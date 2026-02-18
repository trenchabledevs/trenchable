import { PublicKey } from '@solana/web3.js';
import { RISK_WEIGHTS, type RiskCheckResult, type WalletCluster } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

export async function checkWalletClusters(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    // Get earliest transactions to find early buyers
    const signatures = await ctx.connection.getSignaturesForAddress(ctx.tokenMint, { limit: 25 });
    if (signatures.length === 0) {
      return unknownResult('No transaction history found');
    }

    const sorted = [...signatures].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    const firstSlot = sorted[0].slot;
    const earlyTxs = sorted.filter(s => s.slot != null && s.slot <= firstSlot + 3);

    // Collect early buyer wallets
    const earlyBuyerWallets = new Set<string>();
    for (const sig of earlyTxs.slice(0, 10)) {
      try {
        const tx = await ctx.connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
        if (!tx?.meta) continue;
        const postBalances = tx.meta.postTokenBalances || [];
        const preBalances = tx.meta.preTokenBalances || [];
        for (const post of postBalances) {
          if (post.mint !== ctx.tokenMint.toBase58() || !post.owner) continue;
          const pre = preBalances.find(p => p.mint === ctx.tokenMint.toBase58() && p.owner === post.owner);
          if (Number(post.uiTokenAmount.amount) > (pre ? Number(pre.uiTokenAmount.amount) : 0)) {
            earlyBuyerWallets.add(post.owner);
          }
        }
      } catch { /* skip */ }
    }

    if (earlyBuyerWallets.size < 2) {
      return {
        check: 'WALLET_CLUSTER',
        status: 'safe',
        score: 0,
        weight: RISK_WEIGHTS.WALLET_CLUSTER,
        details: { earlyBuyers: earlyBuyerWallets.size, clusters: [] },
        message: 'Too few early buyers to detect clusters',
      };
    }

    // Trace funding sources: for each early buyer, look at their recent SOL transfers
    const fundingMap = new Map<string, string[]>(); // fundingSource -> [buyer wallets]

    for (const wallet of earlyBuyerWallets) {
      try {
        const walletPk = new PublicKey(wallet);
        const walletSigs = await ctx.connection.getSignaturesForAddress(walletPk, { limit: 5 });

        for (const wsig of walletSigs) {
          const wtx = await ctx.connection.getTransaction(wsig.signature, { maxSupportedTransactionVersion: 0 });
          if (!wtx?.meta) continue;

          // Check SOL transfers — look for who sent SOL to this wallet
          const keys = wtx.transaction.message.getAccountKeys();
          const preSOL = wtx.meta.preBalances;
          const postSOL = wtx.meta.postBalances;

          for (let i = 0; i < preSOL.length; i++) {
            const diff = postSOL[i] - preSOL[i];
            const addr = keys.get(i)?.toBase58();
            if (!addr) continue;

            // This wallet received SOL from addr
            if (addr === wallet && diff > 0) {
              // Find who sent it (look for the wallet that lost SOL)
              for (let j = 0; j < preSOL.length; j++) {
                if (j === i) continue;
                const senderDiff = postSOL[j] - preSOL[j];
                const sender = keys.get(j)?.toBase58();
                if (sender && senderDiff < -1_000_000) { // lost > 0.001 SOL
                  const existing = fundingMap.get(sender) || [];
                  if (!existing.includes(wallet)) existing.push(wallet);
                  fundingMap.set(sender, existing);
                  break;
                }
              }
            }
          }
        }
      } catch { /* skip wallet */ }
    }

    // Find clusters: funding sources that funded 2+ early buyers
    const clusters: WalletCluster[] = [];
    for (const [source, wallets] of fundingMap) {
      if (wallets.length >= 2 && !earlyBuyerWallets.has(source)) {
        clusters.push({
          fundingSource: source,
          wallets,
          totalPct: 0, // Would need holder data to calculate
        });
      }
    }

    // Scoring
    const totalClusteredWallets = clusters.reduce((s, c) => s + c.wallets.length, 0);

    if (clusters.length === 0) {
      return {
        check: 'WALLET_CLUSTER',
        status: 'safe',
        score: 0,
        weight: RISK_WEIGHTS.WALLET_CLUSTER,
        details: { clusters: [], earlyBuyers: earlyBuyerWallets.size },
        message: 'No wallet clusters detected — early buyers appear independent',
      };
    }

    if (totalClusteredWallets >= 5 || clusters.length >= 3) {
      return {
        check: 'WALLET_CLUSTER',
        status: 'danger',
        score: 90,
        weight: RISK_WEIGHTS.WALLET_CLUSTER,
        details: {
          clusters: clusters.map(c => ({ source: c.fundingSource, count: c.wallets.length })),
          totalClusteredWallets,
        },
        message: `${totalClusteredWallets} early buyers funded by ${clusters.length} common source(s) — coordinated buying`,
      };
    }

    return {
      check: 'WALLET_CLUSTER',
      status: 'warning',
      score: 55,
      weight: RISK_WEIGHTS.WALLET_CLUSTER,
      details: {
        clusters: clusters.map(c => ({ source: c.fundingSource, count: c.wallets.length })),
        totalClusteredWallets,
      },
      message: `${totalClusteredWallets} early buyers share ${clusters.length} funding source(s) — possible coordination`,
    };
  } catch (error) {
    return unknownResult(String(error));
  }
}

function unknownResult(msg: string): RiskCheckResult {
  return {
    check: 'WALLET_CLUSTER',
    status: 'unknown',
    score: 50,
    weight: RISK_WEIGHTS.WALLET_CLUSTER,
    details: { error: msg },
    message: 'Could not analyze wallet clusters',
  };
}

import { PublicKey } from '@solana/web3.js';
import { RISK_WEIGHTS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

interface EarlyBuyer {
  wallet: string;
  slot: number;
  amount: number;
}

export async function checkBundleDetection(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    // Get the earliest transactions for this token mint
    const signatures = await ctx.connection.getSignaturesForAddress(ctx.tokenMint, {
      limit: 30,
    });

    if (signatures.length === 0) {
      return {
        check: 'BUNDLE_DETECTION',
        status: 'unknown',
        score: 50,
        weight: RISK_WEIGHTS.BUNDLE_DETECTION,
        details: {},
        message: 'No transaction history found for this token',
      };
    }

    // Sort by slot ascending (earliest first)
    const sorted = [...signatures].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    const firstSlot = sorted[0].slot;

    // Get transactions from the first few slots (the launch window)
    const launchWindow = sorted.filter(s => s.slot !== null && s.slot <= firstSlot + 2);

    // Analyze each transaction in the launch window
    const earlyBuyers: EarlyBuyer[] = [];
    const walletSlotsMap = new Map<string, number[]>();

    for (const sig of launchWindow.slice(0, 15)) {
      try {
        const tx = await ctx.connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx?.meta) continue;

        const postBalances = tx.meta.postTokenBalances || [];
        const preBalances = tx.meta.preTokenBalances || [];

        // Find wallets that gained tokens in this transaction
        for (const post of postBalances) {
          if (post.mint !== ctx.tokenMint.toBase58()) continue;
          if (!post.owner) continue;

          const pre = preBalances.find(
            p => p.mint === ctx.tokenMint.toBase58() && p.owner === post.owner
          );
          const preAmount = pre ? Number(pre.uiTokenAmount.amount) : 0;
          const postAmount = Number(post.uiTokenAmount.amount);

          if (postAmount > preAmount) {
            earlyBuyers.push({
              wallet: post.owner,
              slot: sig.slot ?? 0,
              amount: postAmount - preAmount,
            });

            const slots = walletSlotsMap.get(post.owner) || [];
            slots.push(sig.slot ?? 0);
            walletSlotsMap.set(post.owner, slots);
          }
        }
      } catch {
        // Skip failed tx lookups
      }
    }

    // Deduplicate wallets
    const uniqueWallets = new Set(earlyBuyers.map(b => b.wallet));
    const walletsInFirstSlot = earlyBuyers.filter(b => b.slot === firstSlot);
    const uniqueFirstSlotWallets = new Set(walletsInFirstSlot.map(b => b.wallet));

    // Calculate total supply bought by early buyers
    const totalEarlyBought = earlyBuyers.reduce((s, b) => s + b.amount, 0);
    const supply = ctx.mintInfo?.supply ? Number(ctx.mintInfo.supply) : 0;
    const earlyBuyPct = supply > 0 ? (totalEarlyBought / supply) * 100 : 0;

    // Check for shared funding source (simplified: check if multiple early buyers
    // received SOL from the same source recently)
    let sharedFundingDetected = false;
    if (uniqueFirstSlotWallets.size >= 3) {
      // For MVP, checking if 3+ wallets bought in the same slot is a strong bundle signal
      // Full funding source analysis would require tracing SOL transfers
      sharedFundingDetected = true;
    }

    // Scoring
    const numBundledWallets = uniqueFirstSlotWallets.size;
    let score: number;
    let status: 'safe' | 'warning' | 'danger';
    let message: string;

    if (numBundledWallets >= 4 || earlyBuyPct > 20) {
      score = 90;
      status = 'danger';
      message = `${numBundledWallets} wallets bought in the first slot (${earlyBuyPct.toFixed(1)}% of supply) — likely bundled launch`;
    } else if (numBundledWallets >= 2 || earlyBuyPct > 10) {
      score = 50;
      status = 'warning';
      message = `${numBundledWallets} wallets bought in the first slot (${earlyBuyPct.toFixed(1)}% of supply) — possible bundle`;
    } else {
      score = 0;
      status = 'safe';
      message = 'No significant bundling detected in launch transactions';
    }

    return {
      check: 'BUNDLE_DETECTION',
      status,
      score,
      weight: RISK_WEIGHTS.BUNDLE_DETECTION,
      details: {
        walletsInFirstSlot: numBundledWallets,
        totalEarlyWallets: uniqueWallets.size,
        earlyBuyPercentage: Math.round(earlyBuyPct * 10) / 10,
        sharedFundingDetected,
        earlyBuyers: earlyBuyers.slice(0, 10).map(b => ({
          wallet: b.wallet,
          slot: b.slot,
        })),
      },
      message,
    };
  } catch (error) {
    return {
      check: 'BUNDLE_DETECTION',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.BUNDLE_DETECTION,
      details: { error: String(error) },
      message: 'Could not analyze bundle detection',
    };
  }
}

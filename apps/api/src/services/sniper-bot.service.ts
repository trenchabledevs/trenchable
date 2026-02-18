import { RISK_WEIGHTS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

// Known MEV/sniper bot patterns
const BOT_INDICATORS = {
  // Wallets with very high tx count in short periods
  highFrequencyThreshold: 100, // txs in recent history
  // Bots often use program-derived addresses or have specific patterns
  knownBotPrefixes: ['MEV', 'Bot', 'Jito'],
  // Bots buy in the exact same block as pool creation
  sameBlockBuyThreshold: 0, // block offset from pool creation
};

export async function checkSniperBots(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    // Get first transactions for this token
    const signatures = await ctx.connection.getSignaturesForAddress(ctx.tokenMint, { limit: 30 });
    if (signatures.length === 0) {
      return unknownResult('No transaction history');
    }

    const sorted = [...signatures].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    const firstSlot = sorted[0].slot;

    // Get first-block buyers
    const firstBlockBuyers: { wallet: string; amount: number; isSameSlot: boolean }[] = [];

    for (const sig of sorted.slice(0, 10)) {
      try {
        const tx = await ctx.connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
        if (!tx?.meta) continue;

        const postBalances = tx.meta.postTokenBalances || [];
        const preBalances = tx.meta.preTokenBalances || [];

        for (const post of postBalances) {
          if (post.mint !== ctx.tokenMint.toBase58() || !post.owner) continue;
          const pre = preBalances.find(p => p.mint === ctx.tokenMint.toBase58() && p.owner === post.owner);
          const gained = Number(post.uiTokenAmount.amount) - (pre ? Number(pre.uiTokenAmount.amount) : 0);

          if (gained > 0) {
            firstBlockBuyers.push({
              wallet: post.owner,
              amount: gained,
              isSameSlot: sig.slot === firstSlot,
            });
          }
        }
      } catch { /* skip */ }
    }

    // Analyze each first-block buyer for bot characteristics
    let botCount = 0;
    const detectedBots: { wallet: string; reason: string }[] = [];

    for (const buyer of firstBlockBuyers.filter(b => b.isSameSlot)) {
      let isBot = false;
      let reason = '';

      // Check 1: wallet has extremely high recent tx count (only bots do 100s of txs)
      try {
        const { PublicKey } = await import('@solana/web3.js');
        const buyerSigs = await ctx.connection.getSignaturesForAddress(
          new PublicKey(buyer.wallet),
          { limit: 50 }
        );

        if (buyerSigs.length >= 50) {
          // Check how many were in the last hour
          const oneHourAgo = Date.now() / 1000 - 3600;
          const recentCount = buyerSigs.filter(s => s.blockTime && s.blockTime > oneHourAgo).length;
          if (recentCount >= 30) {
            isBot = true;
            reason = `${recentCount} transactions in the last hour — likely automated`;
          }
        }

        // Check 2: wallet was created very recently (just for sniping)
        if (!isBot && buyerSigs.length > 0) {
          const oldest = buyerSigs[buyerSigs.length - 1];
          if (oldest.blockTime) {
            const walletAgeMinutes = (Date.now() / 1000 - oldest.blockTime) / 60;
            if (walletAgeMinutes < 30 && buyerSigs.length > 5) {
              isBot = true;
              reason = `Wallet created ${Math.round(walletAgeMinutes)}min ago with ${buyerSigs.length} txs — disposable sniper`;
            }
          }
        }
      } catch { /* skip */ }

      // Check 3: bought in the exact same slot as token creation
      if (!isBot && buyer.isSameSlot) {
        // Being in the same slot is suspicious but not conclusive alone
        // Combined with other signals it's stronger
        if (firstBlockBuyers.filter(b => b.isSameSlot).length >= 3) {
          isBot = true;
          reason = 'Bought in the same slot as token creation alongside multiple others';
        }
      }

      if (isBot) {
        botCount++;
        detectedBots.push({ wallet: buyer.wallet, reason });
      }
    }

    // Scoring
    const supply = ctx.mintInfo?.supply ? Number(ctx.mintInfo.supply) : 0;
    const botSupplyPct = supply > 0
      ? (firstBlockBuyers.filter(b => detectedBots.some(d => d.wallet === b.wallet))
          .reduce((s, b) => s + b.amount, 0) / supply) * 100
      : 0;

    let score: number;
    let status: 'safe' | 'warning' | 'danger';
    let message: string;

    if (botCount >= 3 || botSupplyPct > 15) {
      score = 85;
      status = 'danger';
      message = `${botCount} likely sniper bot(s) detected — bought ${botSupplyPct.toFixed(1)}% of supply`;
    } else if (botCount >= 1) {
      score = 45;
      status = 'warning';
      message = `${botCount} possible sniper bot detected in early transactions`;
    } else {
      score = 0;
      status = 'safe';
      message = 'No sniper bots detected in launch transactions';
    }

    return {
      check: 'SNIPER_BOTS',
      status,
      score,
      weight: RISK_WEIGHTS.SNIPER_BOTS,
      details: {
        botCount,
        firstBlockBuyers: firstBlockBuyers.filter(b => b.isSameSlot).length,
        detectedBots: detectedBots.slice(0, 5),
        botSupplyPct: Math.round(botSupplyPct * 10) / 10,
      },
      message,
    };
  } catch (error) {
    return unknownResult(String(error));
  }
}

function unknownResult(msg: string): RiskCheckResult {
  return {
    check: 'SNIPER_BOTS',
    status: 'unknown',
    score: 50,
    weight: RISK_WEIGHTS.SNIPER_BOTS,
    details: { error: msg },
    message: 'Could not analyze for sniper bots',
  };
}

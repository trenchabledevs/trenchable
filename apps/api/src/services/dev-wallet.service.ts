import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { RISK_WEIGHTS, PROGRAM_IDS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

async function findCreator(ctx: ScanContext): Promise<string | null> {
  try {
    // First try pump.fun bonding curve to get creator directly
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), ctx.tokenMint.toBuffer()],
      new PublicKey(PROGRAM_IDS.PUMP_FUN)
    );

    const bcInfo = await ctx.connection.getAccountInfo(bondingCurve);
    if (bcInfo && bcInfo.data.length >= 81) {
      // creator is at offset 49 (after 8 byte discriminator + 5 u64s + 1 bool)
      return new PublicKey(bcInfo.data.subarray(49, 81)).toBase58();
    }

    // Fallback: find the earliest transaction on the mint account
    const sigs = await ctx.connection.getSignaturesForAddress(ctx.tokenMint, { limit: 1 }, 'confirmed');
    if (sigs.length === 0) return null;

    // Get the first transaction
    const tx = await ctx.connection.getTransaction(sigs[sigs.length - 1].signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.transaction.message) return null;

    // The first signer is typically the creator/deployer
    const keys = tx.transaction.message.getAccountKeys();
    return keys.get(0)?.toBase58() ?? null;
  } catch {
    return null;
  }
}

export async function checkDevWallet(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    const creator = await findCreator(ctx);
    if (!creator) {
      return {
        check: 'DEV_WALLET',
        status: 'unknown',
        score: 50,
        weight: RISK_WEIGHTS.DEV_WALLET,
        details: {},
        message: 'Could not identify the token creator',
      };
    }

    // Check how many tokens the creator currently holds
    const creatorPubkey = new PublicKey(creator);
    const tokenAccounts = await ctx.connection.getTokenAccountsByOwner(creatorPubkey, {
      mint: ctx.tokenMint,
    });

    let creatorBalance = BigInt(0);
    for (const { account } of tokenAccounts.value) {
      // Token account data: amount is at offset 64, u64 LE
      const amount = account.data.readBigUInt64LE(64);
      creatorBalance += amount;
    }

    const supply = ctx.mintInfo?.supply ?? BigInt(0);
    const holdingPct = supply > 0 ? Number((creatorBalance * BigInt(10000)) / supply) / 100 : 0;

    // Check recent activity (last 10 transactions)
    const recentSigs = await ctx.connection.getSignaturesForAddress(creatorPubkey, { limit: 10 });
    let recentSellCount = 0;

    for (const sig of recentSigs.slice(0, 5)) {
      try {
        const tx = await ctx.connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx?.meta) continue;

        // Check if token balance decreased (indicating a sell)
        const preBalances = tx.meta.preTokenBalances || [];
        const postBalances = tx.meta.postTokenBalances || [];

        for (const pre of preBalances) {
          if (pre.mint === ctx.tokenMint.toBase58() && pre.owner === creator) {
            const post = postBalances.find(
              p => p.mint === ctx.tokenMint.toBase58() && p.owner === creator
            );
            const preBal = Number(pre.uiTokenAmount.amount);
            const postBal = post ? Number(post.uiTokenAmount.amount) : 0;
            if (postBal < preBal) {
              recentSellCount++;
            }
          }
        }
      } catch {
        // Skip failed tx lookups
      }
    }

    // Scoring
    let score: number;
    let status: 'safe' | 'warning' | 'danger';
    let message: string;

    if (holdingPct > 5 || recentSellCount >= 3) {
      score = 80;
      status = 'danger';
      message = holdingPct > 5
        ? `Dev wallet holds ${holdingPct.toFixed(1)}% of supply — high risk`
        : `Dev has sold ${recentSellCount} times recently — active dumping`;
    } else if (holdingPct > 1 || recentSellCount >= 1) {
      score = 40;
      status = 'warning';
      message = `Dev wallet holds ${holdingPct.toFixed(1)}% of supply${recentSellCount > 0 ? `, sold ${recentSellCount} time(s) recently` : ''}`;
    } else {
      score = 0;
      status = 'safe';
      message = `Dev wallet holds ${holdingPct.toFixed(1)}% of supply — low risk`;
    }

    return {
      check: 'DEV_WALLET',
      status,
      score,
      weight: RISK_WEIGHTS.DEV_WALLET,
      details: {
        creator,
        holdingPct: Math.round(holdingPct * 10) / 10,
        creatorBalance: creatorBalance.toString(),
        recentSellCount,
      },
      message,
    };
  } catch (error) {
    return {
      check: 'DEV_WALLET',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.DEV_WALLET,
      details: { error: String(error) },
      message: 'Could not analyze dev wallet',
    };
  }
}

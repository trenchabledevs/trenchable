import { getMint } from '@solana/spl-token';
import { RISK_WEIGHTS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

export async function checkMintAuthority(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    if (!ctx.mintInfo) {
      ctx.mintInfo = await getMint(ctx.connection, ctx.tokenMint);
    }
    const mintInfo = ctx.mintInfo;
    const isRevoked = mintInfo.mintAuthority === null;

    return {
      check: 'MINT_AUTHORITY',
      status: isRevoked ? 'safe' : 'danger',
      score: isRevoked ? 0 : 100,
      weight: RISK_WEIGHTS.MINT_AUTHORITY,
      details: {
        mintAuthority: mintInfo.mintAuthority?.toBase58() ?? null,
        isRevoked,
      },
      message: isRevoked
        ? 'Mint authority is revoked — no new tokens can be minted'
        : `Mint authority is active (${mintInfo.mintAuthority!.toBase58()}) — more tokens can be minted at any time`,
    };
  } catch (error) {
    return {
      check: 'MINT_AUTHORITY',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.MINT_AUTHORITY,
      details: { error: String(error) },
      message: 'Could not verify mint authority status',
    };
  }
}

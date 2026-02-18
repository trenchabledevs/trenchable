import { getMint } from '@solana/spl-token';
import { RISK_WEIGHTS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

export async function checkFreezeAuthority(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    if (!ctx.mintInfo) {
      ctx.mintInfo = await getMint(ctx.connection, ctx.tokenMint);
    }
    const mintInfo = ctx.mintInfo;
    const isRevoked = mintInfo.freezeAuthority === null;

    return {
      check: 'FREEZE_AUTHORITY',
      status: isRevoked ? 'safe' : 'danger',
      score: isRevoked ? 0 : 80,
      weight: RISK_WEIGHTS.FREEZE_AUTHORITY,
      details: {
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() ?? null,
        isRevoked,
      },
      message: isRevoked
        ? 'Freeze authority is revoked — wallets cannot be frozen'
        : `Freeze authority is active (${mintInfo.freezeAuthority!.toBase58()}) — holder wallets can be frozen`,
    };
  } catch (error) {
    return {
      check: 'FREEZE_AUTHORITY',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.FREEZE_AUTHORITY,
      details: { error: String(error) },
      message: 'Could not verify freeze authority status',
    };
  }
}

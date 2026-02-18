import { RISK_WEIGHTS, RUG_PATTERN_INDICATORS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

export async function checkRugPattern(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    const flags: string[] = [];
    let score = 0;

    // 1. Check token metadata for suspicious patterns
    const { PublicKey } = await import('@solana/web3.js');
    const METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM.toBuffer(), ctx.tokenMint.toBuffer()],
      METADATA_PROGRAM
    );

    const accountInfo = await ctx.connection.getAccountInfo(metadataPda);
    let tokenName = '';
    let tokenSymbol = '';

    if (accountInfo) {
      const data = accountInfo.data;
      let offset = 65 + 4;
      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      tokenName = data.subarray(offset, offset + nameLen).toString('utf-8').replace(/\0/g, '').trim();
      offset += nameLen;
      const symbolLen = data.readUInt32LE(offset);
      offset += 4;
      tokenSymbol = data.subarray(offset, offset + symbolLen).toString('utf-8').replace(/\0/g, '').trim();
    }

    // Check for suspicious name patterns
    for (const pattern of RUG_PATTERN_INDICATORS.suspiciousNames) {
      if (pattern.test(tokenName) || pattern.test(tokenSymbol)) {
        flags.push(`Suspicious name/symbol matches pattern: ${pattern.source}`);
        score += 30;
        break;
      }
    }

    // Check for copy-cat names
    for (const pattern of RUG_PATTERN_INDICATORS.copycatNames) {
      if (pattern.test(tokenSymbol)) {
        flags.push(`Token symbol "${tokenSymbol}" matches well-known token — possible copycat`);
        score += 20;
        break;
      }
    }

    // 2. Check token age (very new = riskier)
    const sigs = await ctx.connection.getSignaturesForAddress(ctx.tokenMint, { limit: 1 });
    if (sigs.length > 0) {
      const firstTxTime = sigs[sigs.length - 1].blockTime;
      if (firstTxTime) {
        const ageMinutes = (Date.now() / 1000 - firstTxTime) / 60;
        if (ageMinutes < 10) {
          flags.push(`Token is less than 10 minutes old (${Math.round(ageMinutes)}min)`);
          score += 15;
        } else if (ageMinutes < 60) {
          flags.push(`Token is less than 1 hour old (${Math.round(ageMinutes)}min)`);
          score += 5;
        }
      }
    }

    // 3. Check supply distribution — if deployer minted a huge amount to themselves
    if (ctx.mintInfo) {
      const supply = Number(ctx.mintInfo.supply);
      const decimals = ctx.mintInfo.decimals;

      // Extremely high supply (trillions+) with low decimals often indicates spam
      if (supply > 1e15 && decimals <= 6) {
        flags.push('Extremely high token supply — common in spam tokens');
        score += 10;
      }

      // No metadata at all
      if (!accountInfo) {
        flags.push('No Metaplex metadata found — missing token identity');
        score += 20;
      }
    }

    // 4. Check if the deployer has created many tokens recently (serial rugger)
    try {
      const [bondingCurve] = PublicKey.findProgramAddressSync(
        [Buffer.from('bonding-curve'), ctx.tokenMint.toBuffer()],
        new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
      );
      const bcInfo = await ctx.connection.getAccountInfo(bondingCurve);
      if (bcInfo && bcInfo.data.length >= 81) {
        const creator = new PublicKey(bcInfo.data.subarray(49, 81));
        // Check how many recent transactions the creator has (proxy for activity)
        const creatorSigs = await ctx.connection.getSignaturesForAddress(creator, { limit: 50 });
        if (creatorSigs.length >= 40) {
          flags.push('Creator wallet has very high recent activity — possible serial launcher');
          score += 20;
        }
      }
    } catch { /* skip */ }

    // Cap at 100
    score = Math.min(score, 100);

    let status: 'safe' | 'warning' | 'danger';
    if (score >= 60) status = 'danger';
    else if (score >= 25) status = 'warning';
    else status = 'safe';

    return {
      check: 'RUG_PATTERN',
      status,
      score,
      weight: RISK_WEIGHTS.RUG_PATTERN,
      details: {
        flags,
        tokenName,
        tokenSymbol,
        flagCount: flags.length,
      },
      message: flags.length > 0
        ? `${flags.length} rug pattern(s) detected: ${flags[0]}`
        : 'No known rug patterns detected',
    };
  } catch (error) {
    return {
      check: 'RUG_PATTERN',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.RUG_PATTERN,
      details: { error: String(error) },
      message: 'Could not analyze rug patterns',
    };
  }
}

import type {
  MCPrediction,
  MCPredictionSignals,
  MCFairValue,
  BondingCurveData,
} from '@trenchable/shared';
import { PUMP_FUN_GRADUATION_SOL } from '@trenchable/shared';
import type { DexScreenerData } from './external/dexscreener.js';
import type { GoPlusResult } from './external/goplus.js';
import type { RugcheckReport } from './external/rugcheck.js';

export function computeMCPrediction(
  dexData: DexScreenerData | null,
  goplus: GoPlusResult | null,
  rugcheck: RugcheckReport | null
): MCPrediction | null {
  const currentMC = dexData?.marketCap || null;

  // Need at least some data to make a prediction
  if (!dexData && !goplus && !rugcheck) return null;

  const signals = computeSignals(dexData, goplus, rugcheck);
  const bondingCurve = computeBondingCurve(rugcheck, dexData);
  const fairValue = computeFairValue(currentMC, signals, bondingCurve);
  const confidence = computeConfidence(dexData, goplus, rugcheck, signals);
  const summary = generateSummary(currentMC, signals, bondingCurve, fairValue, confidence);

  return {
    currentMC,
    bondingCurve,
    signals,
    fairValue,
    summary,
    confidence,
  };
}

// ─── Signal computation ───

function computeSignals(
  dexData: DexScreenerData | null,
  goplus: GoPlusResult | null,
  rugcheck: RugcheckReport | null
): MCPredictionSignals {
  const liquidityRatio = computeLiquidityRatio(dexData);
  const liquidityScore = getLiquidityScore(liquidityRatio);
  const momentumScore = getMomentumScore(dexData);
  const holderStage = getHolderStage(goplus, rugcheck, dexData);
  const concentrationRisk = getConcentrationRisk(goplus, rugcheck);
  const tokenAge = getTokenAge(dexData);

  return {
    liquidityRatio,
    liquidityScore,
    momentumScore,
    holderStage,
    concentrationRisk,
    tokenAge,
  };
}

function computeLiquidityRatio(dexData: DexScreenerData | null): number {
  if (!dexData?.liquidity || !dexData?.marketCap || dexData.marketCap === 0) return 0;
  return dexData.liquidity / dexData.marketCap;
}

function getLiquidityScore(liqMcRatio: number): number {
  if (liqMcRatio === 0) return 0;
  if (liqMcRatio > 0.20) return 85;   // very healthy — room to grow
  if (liqMcRatio > 0.10) return 65;   // healthy
  if (liqMcRatio > 0.05) return 45;   // acceptable
  if (liqMcRatio > 0.02) return 25;   // thin — dump risk
  return 10;                           // extremely thin — danger
}

function getMomentumScore(dexData: DexScreenerData | null): number {
  if (!dexData?.pairs?.[0]) return 50;

  const pair = dexData.pairs[0];
  let score = 50;

  // 5-minute buy/sell ratio
  const m5Buys = pair.txns?.m5?.buys || 0;
  const m5Sells = pair.txns?.m5?.sells || 0;
  const m5Ratio = m5Sells > 0 ? m5Buys / m5Sells : m5Buys > 0 ? 5 : 1;

  if (m5Ratio > 2.0) score += 20;      // 2:1 buy pressure in last 5min
  else if (m5Ratio > 1.5) score += 10;
  else if (m5Ratio < 0.5) score -= 20;  // heavy sell pressure
  else if (m5Ratio < 0.7) score -= 10;

  // 1-hour buy/sell ratio
  const h1Buys = pair.txns?.h1?.buys || 0;
  const h1Sells = pair.txns?.h1?.sells || 0;
  const h1Ratio = h1Sells > 0 ? h1Buys / h1Sells : h1Buys > 0 ? 3 : 1;

  if (h1Ratio > 1.5) score += 10;
  else if (h1Ratio < 0.7) score -= 10;

  // Volume acceleration: is 5m volume spiking relative to 1h average?
  const m5Vol = pair.volume?.m5 || 0;
  const h1Vol = pair.volume?.h1 || 0;
  const expectedM5Vol = h1Vol / 12; // expected 5-min slice of 1hr volume
  if (expectedM5Vol > 0 && m5Vol > 0) {
    const volAcceleration = m5Vol / expectedM5Vol;
    if (volAcceleration > 2.0) score += 15;  // volume spiking hard
    else if (volAcceleration > 1.5) score += 8;
    else if (volAcceleration < 0.3) score -= 10; // volume dying
  }

  // Price momentum
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;

  if (priceChange5m > 10) score += 10;   // 10%+ in 5 min
  else if (priceChange5m < -10) score -= 10;

  if (priceChange1h > 30) score += 5;
  else if (priceChange1h < -30) score -= 5;

  return Math.min(Math.max(score, 0), 100);
}

function getHolderStage(
  goplus: GoPlusResult | null,
  rugcheck: RugcheckReport | null,
  dexData: DexScreenerData | null
): 'A' | 'B' | 'C' | 'D' {
  const mc = dexData?.marketCap || 0;
  let top10Pct = 0;

  if (rugcheck?.topHolders && rugcheck.topHolders.length > 0) {
    top10Pct = rugcheck.topHolders.slice(0, 10).reduce((sum, h) => sum + (h.pct || 0), 0);
  } else if (goplus?.holders && goplus.holders.length > 0) {
    top10Pct = goplus.holders.slice(0, 10).reduce((sum, h) => sum + parseFloat(h.percent || '0'), 0) * 100;
  }

  // Stage classification based on concentration + MC
  if (top10Pct > 70 || mc < 50_000) return 'A';  // Accumulation
  if (top10Pct > 40 || mc < 500_000) return 'B';  // Early growth
  if (top10Pct > 20 || mc < 5_000_000) return 'C'; // Distribution
  return 'D';                                       // Mature
}

function getConcentrationRisk(
  goplus: GoPlusResult | null,
  rugcheck: RugcheckReport | null
): 'low' | 'medium' | 'high' | 'extreme' {
  let topPct = 0;

  if (rugcheck?.topHolders?.[0]) {
    topPct = rugcheck.topHolders[0].pct || 0;
  } else if (goplus?.holders?.[0]) {
    topPct = parseFloat(goplus.holders[0].percent || '0') * 100;
  }

  if (topPct > 20) return 'extreme';
  if (topPct > 10) return 'high';
  if (topPct > 5) return 'medium';
  return 'low';
}

function getTokenAge(dexData: DexScreenerData | null): 'minutes' | 'hours' | 'days' | 'weeks' {
  if (!dexData?.pairAge) return 'hours'; // default assumption
  const ageHours = dexData.pairAge / 3_600_000;

  if (ageHours < 1) return 'minutes';
  if (ageHours < 24) return 'hours';
  if (ageHours < 168) return 'days';
  return 'weeks';
}

// ─── Bonding curve (pump.fun only) ───

function computeBondingCurve(
  rugcheck: RugcheckReport | null,
  dexData: DexScreenerData | null
): BondingCurveData | null {
  // Only for pump.fun tokens that haven't graduated
  if (!rugcheck) return null;

  // Check if it's a pump.fun token that's still on the bonding curve
  const isPumpFun = rugcheck.tokenType === 'pump.fun' ||
    rugcheck.markets?.some(m => m.marketType?.toLowerCase().includes('pump'));

  if (!isPumpFun) return null;

  // If the token has markets on Raydium, it's already graduated
  const hasRaydiumMarket = rugcheck.markets?.some(m =>
    m.marketType?.toLowerCase().includes('raydium')
  );
  if (hasRaydiumMarket) return null;

  // Estimate from Rugcheck's total market liquidity
  // Pump.fun tokens show virtual liquidity in SOL
  const totalLiq = rugcheck.totalMarketLiquidity || 0;

  // Convert liquidity to approximate SOL reserves
  // This is a rough estimate — the actual bonding curve data would need an RPC call
  // For instant mode, we approximate using Rugcheck's reported liquidity
  // Typical pump.fun graduation is ~85 SOL ($17k at $200/SOL)
  const estimatedSolReserves = totalLiq > 0 ? totalLiq : 0;

  // If we have DexScreener data, we can get a better estimate
  const currentMC = dexData?.marketCap || 0;

  // Pump.fun graduation MC is approximately $60k-$80k
  const graduationMC = 70_000; // approximate
  const progressPct = currentMC > 0 ? Math.min((currentMC / graduationMC) * 100, 99) : 0;

  // If MC is above graduation level, the token has graduated
  if (currentMC > graduationMC * 1.5) return null;

  const remainingSol = Math.max(PUMP_FUN_GRADUATION_SOL - estimatedSolReserves, 0);

  return {
    progressPct: Math.round(progressPct * 10) / 10,
    realSolReserves: estimatedSolReserves,
    remainingToGraduateSol: Math.round(remainingSol * 100) / 100,
    estimatedGraduationMC: graduationMC,
  };
}

// ─── Fair value estimation ───

function computeFairValue(
  currentMC: number | null,
  signals: MCPredictionSignals,
  bondingCurve: BondingCurveData | null
): MCFairValue {
  if (!currentMC || currentMC === 0) {
    return { low: 0, mid: 0, high: 0, trend: 'accumulating' };
  }

  // Base multiplier from momentum
  const momentumMultiplier = signals.momentumScore > 70 ? 1.5 :
    signals.momentumScore > 55 ? 1.2 :
    signals.momentumScore < 30 ? 0.6 :
    signals.momentumScore < 45 ? 0.8 : 1.0;

  // Liquidity health multiplier
  const liquidityMultiplier = signals.liquidityScore > 70 ? 1.3 :
    signals.liquidityScore > 50 ? 1.1 :
    signals.liquidityScore < 20 ? 0.7 : 1.0;

  // Age-based range width
  let rangeLow: number;
  let rangeHigh: number;

  switch (signals.tokenAge) {
    case 'minutes':
      rangeLow = 0.3;
      rangeHigh = 10;
      break;
    case 'hours':
      rangeLow = 0.5;
      rangeHigh = 5;
      break;
    case 'days':
      rangeLow = 0.7;
      rangeHigh = 3;
      break;
    case 'weeks':
      rangeLow = 0.5;
      rangeHigh = 1.5;
      break;
  }

  // Stage-based growth potential
  let stageMultiplier: number;
  switch (signals.holderStage) {
    case 'A': stageMultiplier = 3.0; break;
    case 'B': stageMultiplier = 2.0; break;
    case 'C': stageMultiplier = 1.5; break;
    case 'D': stageMultiplier = 1.0; break;
  }

  // Concentration penalty (higher concentration = more dump risk)
  const concPenalty = signals.concentrationRisk === 'extreme' ? 0.5 :
    signals.concentrationRisk === 'high' ? 0.7 :
    signals.concentrationRisk === 'medium' ? 0.9 : 1.0;

  // Bonding curve bonus for pre-graduation tokens
  if (bondingCurve && bondingCurve.progressPct > 50) {
    rangeHigh = Math.max(rangeHigh, 5); // at least 5x potential if near graduation
  }

  const combinedMultiplier = momentumMultiplier * liquidityMultiplier * stageMultiplier * concPenalty;

  const low = Math.round(currentMC * rangeLow * concPenalty);
  const high = Math.round(currentMC * rangeHigh * combinedMultiplier);
  const mid = Math.round((low + high) / 2);

  // Determine trend
  let trend: MCFairValue['trend'];
  if (signals.tokenAge === 'minutes' || (signals.holderStage === 'A' && signals.momentumScore < 50)) {
    trend = 'accumulating';
  } else if (signals.momentumScore > 60 && signals.tokenAge !== 'weeks') {
    trend = 'trending';
  } else if (signals.momentumScore < 35) {
    trend = signals.tokenAge === 'weeks' ? 'dying' : 'consolidating';
  } else if (signals.holderStage === 'D') {
    trend = 'mature';
  } else {
    trend = 'consolidating';
  }

  return { low, mid, high, trend };
}

// ─── Confidence ───

function computeConfidence(
  dexData: DexScreenerData | null,
  goplus: GoPlusResult | null,
  rugcheck: RugcheckReport | null,
  signals: MCPredictionSignals
): 'low' | 'medium' | 'high' {
  let sources = 0;
  if (dexData) sources++;
  if (goplus) sources++;
  if (rugcheck) sources++;

  if (signals.tokenAge === 'minutes') return 'low';
  if (sources >= 3 && dexData?.liquidity && dexData.liquidity > 50_000) return 'high';
  if (sources >= 2) return 'medium';
  return 'low';
}

// ─── Summary ───

function generateSummary(
  currentMC: number | null,
  signals: MCPredictionSignals,
  bondingCurve: BondingCurveData | null,
  fairValue: MCFairValue,
  confidence: string
): string {
  const parts: string[] = [];

  // Current MC
  if (currentMC) {
    parts.push(`MC: $${formatNumber(currentMC)}`);
  }

  // Bonding curve status
  if (bondingCurve) {
    parts.push(`${bondingCurve.progressPct.toFixed(0)}% to graduation`);
  }

  // Momentum
  if (signals.momentumScore > 70) {
    parts.push('strong buy pressure');
  } else if (signals.momentumScore > 55) {
    parts.push('positive momentum');
  } else if (signals.momentumScore < 30) {
    parts.push('heavy selling');
  } else if (signals.momentumScore < 45) {
    parts.push('weak momentum');
  }

  // Liquidity health
  if (signals.liquidityScore < 20) {
    parts.push('thin liquidity');
  }

  // Concentration warning
  if (signals.concentrationRisk === 'extreme') {
    parts.push('extreme holder concentration');
  } else if (signals.concentrationRisk === 'high') {
    parts.push('high concentration risk');
  }

  // Fair value range
  if (currentMC && fairValue.high > currentMC) {
    const xPotential = (fairValue.high / currentMC).toFixed(1);
    parts.push(`potential ${xPotential}x`);
  }

  return parts.join(' · ');
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

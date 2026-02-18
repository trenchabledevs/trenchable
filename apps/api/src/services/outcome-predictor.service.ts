/**
 * Outcome-Based MC Predictor
 *
 * Uses real historical outcome data from token_launch_signals to predict
 * what MC a token is likely to reach based on its launch-time signals.
 *
 * Algorithm:
 * 1. Find tokens in our database with similar signals to the current token
 * 2. Look at what MC they actually reached at 1h, 6h, 24h
 * 3. Report outcome distribution (e.g. "30% hit $1M+, avg 2.4x in 6h")
 *
 * Falls back to heuristic model when <100 data points available.
 */

import { getDb } from '../db/database.js';
import { getDatasetStats } from './token-tracker.service.js';

// Minimum data points before we trust the statistical model
const MIN_SAMPLES_FOR_STATS = 100;

export interface OutcomePrediction {
  dataPoints: number;           // How many similar tokens we based this on
  dataQuality: 'statistical' | 'heuristic' | 'insufficient';
  timeframes: {
    '1h': OutcomeTimeframe;
    '6h': OutcomeTimeframe;
    '24h': OutcomeTimeframe;
  };
  rugRisk: {
    pct: number;                // % chance of rug based on similar tokens
    avgRugTimeMinutes: number | null;
  };
  summary: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface OutcomeTimeframe {
  medianMultiple: number;       // median MC multiple vs launch (e.g. 1.5 = 50% up)
  p25Multiple: number;          // 25th percentile (pessimistic)
  p75Multiple: number;          // 75th percentile (optimistic)
  pctAbove2x: number;           // % of tokens that doubled
  pctAbove10x: number;          // % that went 10x
  pctDown50: number;            // % that dropped 50%+
  estimatedMC: {
    bear: number | null;        // p25 MC estimate
    base: number | null;        // median MC estimate
    bull: number | null;        // p75 MC estimate
  };
}

export interface TokenSignalsInput {
  platform: string;
  launchMC: number | null;
  launchLiquidity: number | null;
  riskScore: number;
  lpLockedPct: number | null;
  lpBurnedPct: number | null;
  topHolderPct: number | null;
  devWalletPct: number | null;
  buyTax: number | null;
  sellTax: number | null;
  mintRevoked: boolean;
  freezeRevoked: boolean;
  bondingCurvePct: number | null;
  hasSocials: boolean;
  insidersDetected: number | null;
}

// ─── Main prediction function ───

export function predictOutcomes(signals: TokenSignalsInput): OutcomePrediction {
  const stats = getDatasetStats();

  // Not enough data yet — use heuristic model
  if (stats.tokensWithOutcomes < MIN_SAMPLES_FOR_STATS) {
    return heuristicPrediction(signals, stats.tokensWithOutcomes);
  }

  // Find similar tokens from database
  const similarTokens = findSimilarTokens(signals);

  if (similarTokens.length < 20) {
    // Not enough similar tokens — fall back to heuristic
    return heuristicPrediction(signals, similarTokens.length);
  }

  return statisticalPrediction(signals, similarTokens);
}

// ─── Statistical prediction from real data ───

function statisticalPrediction(signals: TokenSignalsInput, rows: any[]): OutcomePrediction {
  const launchMC = signals.launchMC || 0;

  function calcTimeframe(mcField: string): OutcomeTimeframe {
    const multiples = rows
      .filter(r => r[mcField] !== null && r.launch_mc > 0)
      .map(r => r[mcField] / r.launch_mc)
      .sort((a, b) => a - b);

    if (multiples.length === 0) {
      return emptyTimeframe(launchMC);
    }

    const median = percentile(multiples, 50);
    const p25 = percentile(multiples, 25);
    const p75 = percentile(multiples, 75);
    const pctAbove2x = (multiples.filter(m => m >= 2).length / multiples.length) * 100;
    const pctAbove10x = (multiples.filter(m => m >= 10).length / multiples.length) * 100;
    const pctDown50 = (multiples.filter(m => m <= 0.5).length / multiples.length) * 100;

    return {
      medianMultiple: median,
      p25Multiple: p25,
      p75Multiple: p75,
      pctAbove2x,
      pctAbove10x,
      pctDown50,
      estimatedMC: {
        bear: launchMC > 0 ? launchMC * p25 : null,
        base: launchMC > 0 ? launchMC * median : null,
        bull: launchMC > 0 ? launchMC * p75 : null,
      },
    };
  }

  const rugCount = rows.filter(r => r.rug_detected === 1).length;
  const rugRows = rows.filter(r => r.rug_detected === 1 && r.rug_time_minutes !== null);
  const avgRugTime = rugRows.length > 0
    ? rugRows.reduce((a, r) => a + r.rug_time_minutes, 0) / rugRows.length
    : null;

  const tf1h = calcTimeframe('mc_1h');
  const tf6h = calcTimeframe('mc_6h');
  const tf24h = calcTimeframe('mc_24h');

  const rugPct = (rugCount / rows.length) * 100;

  const summary = buildSummary(signals, tf1h, tf6h, tf24h, rugPct, rows.length, 'statistical');
  const confidence = rows.length >= 200 ? 'high' : rows.length >= 50 ? 'medium' : 'low';

  return {
    dataPoints: rows.length,
    dataQuality: 'statistical',
    timeframes: { '1h': tf1h, '6h': tf6h, '24h': tf24h },
    rugRisk: { pct: rugPct, avgRugTimeMinutes: avgRugTime },
    summary,
    confidence,
  };
}

// ─── Find similar tokens by signals ───

function findSimilarTokens(signals: TokenSignalsInput): any[] {
  const db = getDb();

  // Build similarity query — score tokens in risk score buckets
  const riskBucketLow = Math.max(0, signals.riskScore - 15);
  const riskBucketHigh = Math.min(100, signals.riskScore + 15);

  // LP status similarity
  const hasLockedLP = (signals.lpLockedPct || 0) + (signals.lpBurnedPct || 0) > 50;

  // MC bucket (within 3x range for comparable tokens)
  let mcFilter = '';
  if (signals.launchMC && signals.launchMC > 0) {
    const mcLow = signals.launchMC / 3;
    const mcHigh = signals.launchMC * 3;
    mcFilter = `AND (launch_mc IS NULL OR (launch_mc BETWEEN ${mcLow} AND ${mcHigh}))`;
  }

  return db.prepare(`
    SELECT *
    FROM token_launch_signals
    WHERE mc_24h IS NOT NULL
      AND risk_score BETWEEN ? AND ?
      ${signals.platform !== 'unknown' ? "AND platform = ?" : ""}
      ${mcFilter}
    ORDER BY ABS(risk_score - ?) ASC
    LIMIT 500
  `).all(
    ...(signals.platform !== 'unknown'
      ? [riskBucketLow, riskBucketHigh, signals.platform, signals.riskScore]
      : [riskBucketLow, riskBucketHigh, signals.riskScore])
  ) as any[];
}

// ─── Heuristic fallback (used until we have enough data) ───

function heuristicPrediction(signals: TokenSignalsInput, dataPoints: number): OutcomePrediction {
  // Base multipliers from known meme coin behavior patterns
  let bear1h = 0.7, base1h = 1.2, bull1h = 2.5;
  let bear6h = 0.4, base6h = 1.5, bull6h = 5.0;
  let bear24h = 0.2, base24h = 1.8, bull24h = 8.0;
  let rugPct = 40;

  const riskScore = signals.riskScore;

  // Adjust based on risk score
  if (riskScore <= 20) {
    // Low risk — safer tokens tend to have steadier growth
    rugPct = 10;
    base1h = 1.3; bull1h = 3.0;
    base6h = 2.0; bull6h = 8.0;
    base24h = 2.5; bull24h = 15.0;
  } else if (riskScore <= 40) {
    rugPct = 25;
    base1h = 1.1; bull1h = 2.0;
    base6h = 1.3; bull6h = 5.0;
    base24h = 1.5; bull24h = 8.0;
  } else if (riskScore <= 60) {
    rugPct = 50;
    base1h = 0.9; bear1h = 0.5;
    base6h = 0.8; bear6h = 0.3;
    base24h = 0.6; bear24h = 0.15;
  } else {
    // High/critical risk — most likely to rug
    rugPct = 75;
    bear1h = 0.3; base1h = 0.6; bull1h = 1.2;
    bear6h = 0.1; base6h = 0.3; bull6h = 0.8;
    bear24h = 0.05; base24h = 0.2; bull24h = 0.5;
  }

  // Bonus for locked LP
  const lpTotal = (signals.lpLockedPct || 0) + (signals.lpBurnedPct || 0);
  if (lpTotal > 80) {
    rugPct = Math.max(5, rugPct - 20);
    base6h *= 1.3; bull6h *= 1.2;
  }

  // Penalty for high dev wallet
  if ((signals.devWalletPct || 0) > 10) {
    rugPct = Math.min(95, rugPct + 15);
    bear24h *= 0.7;
  }

  // Pump.fun bonding curve boost
  if (signals.bondingCurvePct !== null) {
    if (signals.bondingCurvePct > 80) {
      // Near graduation = likely pump incoming
      base1h *= 1.5; bull1h *= 2.0;
      base6h *= 1.4; bull6h *= 1.5;
    } else if (signals.bondingCurvePct < 10) {
      // Very early = high risk, high reward
      bear1h *= 0.7; bull1h *= 1.5;
    }
  }

  // Socials reduce rug risk
  if (signals.hasSocials) {
    rugPct = Math.max(5, rugPct - 10);
  }

  const lmc = signals.launchMC;

  const makeTimeframe = (bear: number, base: number, bull: number): OutcomeTimeframe => ({
    medianMultiple: base,
    p25Multiple: bear,
    p75Multiple: bull,
    pctAbove2x: bull > 2 ? Math.max(5, (bull - 2) / (bull - bear) * 50) : 5,
    pctAbove10x: bull > 10 ? 5 : 0,
    pctDown50: bear < 0.5 ? 30 : 10,
    estimatedMC: {
      bear: lmc ? lmc * bear : null,
      base: lmc ? lmc * base : null,
      bull: lmc ? lmc * bull : null,
    },
  });

  const tf1h = makeTimeframe(bear1h, base1h, bull1h);
  const tf6h = makeTimeframe(bear6h, base6h, bull6h);
  const tf24h = makeTimeframe(bear24h, base24h, bull24h);

  const summary = buildSummary(signals, tf1h, tf6h, tf24h, rugPct, dataPoints, 'heuristic');

  return {
    dataPoints,
    dataQuality: dataPoints === 0 ? 'insufficient' : 'heuristic',
    timeframes: { '1h': tf1h, '6h': tf6h, '24h': tf24h },
    rugRisk: { pct: rugPct, avgRugTimeMinutes: riskScore > 60 ? 45 : null },
    summary,
    confidence: dataPoints >= 50 ? 'medium' : 'low',
  };
}

// ─── Summary text ───

function buildSummary(
  signals: TokenSignalsInput,
  tf1h: OutcomeTimeframe,
  tf6h: OutcomeTimeframe,
  tf24h: OutcomeTimeframe,
  rugPct: number,
  dataPoints: number,
  quality: string,
): string {
  const mc = signals.launchMC;
  const base6h = tf6h.estimatedMC.base;

  let summary = '';

  if (quality === 'statistical') {
    summary = `Based on ${dataPoints} similar tokens: `;
  } else if (dataPoints > 0) {
    summary = `Early estimate (${dataPoints} tokens collected so far): `;
  } else {
    summary = 'Estimate based on known patterns: ';
  }

  if (rugPct >= 70) {
    summary += `⚠️ High rug risk (${rugPct.toFixed(0)}%). `;
  } else if (rugPct >= 40) {
    summary += `Moderate rug risk (${rugPct.toFixed(0)}%). `;
  }

  if (base6h && mc) {
    const multiple = base6h / mc;
    if (multiple >= 2) {
      summary += `Typical 6h outcome: ~${multiple.toFixed(1)}x if it holds. `;
    } else if (multiple >= 1) {
      summary += `Slight upside expected if risk holds. `;
    } else {
      summary += `Most similar tokens declined. `;
    }
  }

  if (tf6h.pctAbove2x > 20) {
    summary += `${tf6h.pctAbove2x.toFixed(0)}% chance of 2x in 6h.`;
  }

  return summary.trim();
}

// ─── Helpers ───

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 1;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function emptyTimeframe(launchMC: number): OutcomeTimeframe {
  return {
    medianMultiple: 1,
    p25Multiple: 0.5,
    p75Multiple: 2,
    pctAbove2x: 25,
    pctAbove10x: 5,
    pctDown50: 25,
    estimatedMC: {
      bear: launchMC * 0.5 || null,
      base: launchMC || null,
      bull: launchMC * 2 || null,
    },
  };
}

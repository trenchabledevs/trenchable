/**
 * Token Outcome Tracker Service
 *
 * Tracks every auto-scanned token and checks back at:
 *   1h  — captures early pump or dump
 *   6h  — captures most rug patterns
 *   24h — captures full pump/dump cycle
 *
 * This builds the training dataset for accurate MC prediction.
 */

import { getDb } from '../db/database.js';
import { getDexScreenerData } from './external/dexscreener.js';
import type { ExtendedScanResponse } from '@trenchable/shared';

const CHECK_INTERVALS_MS = [
  1 * 60 * 60 * 1000,   // 1 hour
  6 * 60 * 60 * 1000,   // 6 hours
  24 * 60 * 60 * 1000,  // 24 hours
];

let trackerInterval: ReturnType<typeof setInterval> | null = null;

// ─── Save launch signals when a token is first scanned ───

export function saveLaunchSignals(scan: ExtendedScanResponse): void {
  try {
    const db = getDb();
    const mc = scan.mcPrediction;
    const market = scan.market;
    const checks = scan.checks || [];

    // Extract check details
    const mintCheck = checks.find(c => c.check === 'MINT_AUTHORITY');
    const freezeCheck = checks.find(c => c.check === 'FREEZE_AUTHORITY');
    const lpCheck = checks.find(c => c.check === 'LP_STATUS');
    const holderCheck = checks.find(c => c.check === 'TOP_HOLDERS');
    const devCheck = checks.find(c => c.check === 'DEV_WALLET');
    const taxCheck = checks.find(c => c.check === 'TOKEN_TAX');
    const socialCheck = checks.find(c => c.check === 'SOCIAL_SENTIMENT');

    db.prepare(`
      INSERT OR IGNORE INTO token_launch_signals (
        token_mint, token_name, token_symbol, platform, scanned_at,
        launch_mc, launch_liquidity, launch_price,
        risk_score, risk_level,
        lp_locked_pct, lp_burned_pct,
        top_holder_pct, holder_count,
        dev_wallet_pct, bundle_pct,
        buy_tax, sell_tax,
        mint_revoked, freeze_revoked,
        bonding_curve_pct, has_socials,
        rugcheck_score, insiders_detected
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?
      )
    `).run(
      scan.tokenMint,
      scan.tokenName || null,
      scan.tokenSymbol || null,
      scan.platform || 'unknown',
      scan.scanTimestamp || Date.now(),

      market?.marketCap || null,
      market?.liquidity || null,
      market?.priceUsd || null,

      scan.overallScore,
      scan.riskLevel,

      scan.externalRisk?.lpLockedPct || null,
      scan.externalRisk?.lpBurnedPct || null,

      holderCheck?.details?.topHolderPct || null,
      holderCheck?.details?.holderCount || null,

      devCheck?.details?.devHoldingPct || null,
      null, // bundle_pct — not in instant scan yet

      taxCheck?.details?.buyTax || null,
      taxCheck?.details?.sellTax || null,

      mintCheck?.status === 'safe' ? 1 : 0,
      freezeCheck?.status === 'safe' ? 1 : 0,

      mc?.bondingCurve?.progressPct || null,
      socialCheck?.status === 'safe' ? 1 : 0,

      scan.externalRisk ? (scan.externalRisk as any).rugcheckScore || null : null,
      scan.externalRisk?.insidersDetected || null,
    );
  } catch (err) {
    // Non-critical — don't crash if save fails
    console.error('[TokenTracker] Failed to save launch signals:', err);
  }
}

// ─── Check outcomes for tokens that haven't been checked yet ───

async function checkPendingOutcomes(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  // Find tokens needing outcome checks
  const pending = db.prepare(`
    SELECT token_mint, scanned_at, mc_1h, mc_6h, mc_24h
    FROM token_launch_signals
    WHERE outcome_checked_at IS NULL
       OR (mc_1h IS NULL AND scanned_at < ?)
       OR (mc_6h IS NULL AND scanned_at < ?)
       OR (mc_24h IS NULL AND scanned_at < ?)
    ORDER BY scanned_at DESC
    LIMIT 50
  `).all(
    now - CHECK_INTERVALS_MS[0],
    now - CHECK_INTERVALS_MS[1],
    now - CHECK_INTERVALS_MS[2],
  ) as any[];

  if (pending.length === 0) return;

  console.log(`[TokenTracker] Checking outcomes for ${pending.length} tokens...`);

  for (const row of pending) {
    try {
      const age = now - row.scanned_at;
      const dex = await getDexScreenerData(row.token_mint);

      if (!dex) continue;

      const currentMC = dex.marketCap || null;
      const currentPrice = dex.priceUsd || null;

      // Detect rug: liquidity dropped >90% from launch
      const launchLiq = db.prepare(
        'SELECT launch_liquidity FROM token_launch_signals WHERE token_mint = ?'
      ).get(row.token_mint) as any;

      const currentLiq = dex.liquidity || null;
      let rugDetected = 0;
      let rugTimeMinutes = null;

      if (launchLiq?.launch_liquidity && currentLiq !== null) {
        const liqDrop = (launchLiq.launch_liquidity - currentLiq) / launchLiq.launch_liquidity;
        if (liqDrop > 0.9) {
          rugDetected = 1;
          rugTimeMinutes = Math.round(age / 60000);
        }
      }

      // Update whichever intervals have now passed
      const updates: string[] = [];
      const values: any[] = [];

      if (age >= CHECK_INTERVALS_MS[0] && row.mc_1h === null) {
        updates.push('mc_1h = ?', 'price_1h = ?');
        values.push(currentMC, currentPrice);
      }
      if (age >= CHECK_INTERVALS_MS[1] && row.mc_6h === null) {
        updates.push('mc_6h = ?', 'price_6h = ?');
        values.push(currentMC, currentPrice);
      }
      if (age >= CHECK_INTERVALS_MS[2] && row.mc_24h === null) {
        updates.push('mc_24h = ?', 'price_24h = ?');
        values.push(currentMC, currentPrice);
      }

      if (updates.length > 0) {
        updates.push('rug_detected = ?', 'rug_time_minutes = ?', 'outcome_checked_at = ?');
        values.push(rugDetected, rugTimeMinutes, now, row.token_mint);

        db.prepare(`
          UPDATE token_launch_signals
          SET ${updates.join(', ')}
          WHERE token_mint = ?
        `).run(...values);
      }

      // Small delay to avoid hammering DexScreener
      await new Promise(r => setTimeout(r, 200));
    } catch {
      // Skip failures silently
    }
  }
}

// ─── Start/stop tracker ───

export function startTokenTracker(): void {
  if (trackerInterval) return;

  // Run every 15 minutes
  trackerInterval = setInterval(() => {
    checkPendingOutcomes().catch(err =>
      console.error('[TokenTracker] Outcome check failed:', err)
    );
  }, 15 * 60 * 1000);

  // Also run immediately on start
  setTimeout(() => {
    checkPendingOutcomes().catch(() => {});
  }, 10_000);

  console.log('[TokenTracker] Started — checking outcomes every 15 minutes');
}

export function stopTokenTracker(): void {
  if (trackerInterval) {
    clearInterval(trackerInterval);
    trackerInterval = null;
  }
}

// ─── Stats for the predictor ───

export interface LaunchSignalStats {
  totalTokens: number;
  tokensWithOutcomes: number;
  platformBreakdown: Record<string, number>;
  rugRate: number;       // % of tokens that rugged
  avgMCMultiple1h: number;  // avg MC at 1h / MC at launch
  avgMCMultiple24h: number;
}

export function getDatasetStats(): LaunchSignalStats {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as n FROM token_launch_signals').get() as any).n;
  const withOutcomes = (db.prepare(
    'SELECT COUNT(*) as n FROM token_launch_signals WHERE mc_24h IS NOT NULL'
  ).get() as any).n;

  const platforms = db.prepare(
    'SELECT platform, COUNT(*) as n FROM token_launch_signals GROUP BY platform'
  ).all() as any[];

  const platformBreakdown: Record<string, number> = {};
  for (const p of platforms) platformBreakdown[p.platform] = p.n;

  const rugRate = withOutcomes > 0
    ? (db.prepare(
        'SELECT COUNT(*) as n FROM token_launch_signals WHERE rug_detected = 1'
      ).get() as any).n / withOutcomes
    : 0;

  const mcStats = db.prepare(`
    SELECT
      AVG(CASE WHEN launch_mc > 0 THEN mc_1h / launch_mc END) as avg_1h_multiple,
      AVG(CASE WHEN launch_mc > 0 THEN mc_24h / launch_mc END) as avg_24h_multiple
    FROM token_launch_signals
    WHERE mc_1h IS NOT NULL AND launch_mc IS NOT NULL AND launch_mc > 0
  `).get() as any;

  return {
    totalTokens: total,
    tokensWithOutcomes: withOutcomes,
    platformBreakdown,
    rugRate,
    avgMCMultiple1h: mcStats?.avg_1h_multiple || 0,
    avgMCMultiple24h: mcStats?.avg_24h_multiple || 0,
  };
}

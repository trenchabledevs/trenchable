/**
 * Launch Monitor Service
 *
 * Subscribes to pump.fun and Raydium for every new token launch.
 * Auto-scans each one instantly and saves signals to the training dataset.
 *
 * This runs 24/7 in the background, building the MC prediction dataset
 * without any user interaction needed.
 */

import { addPairListener } from './pair-monitor.service.js';
import { runInstantScan } from './instant-scanner.service.js';
import { saveLaunchSignals } from './token-tracker.service.js';
import { getDb } from '../db/database.js';

let stopMonitor: (() => void) | null = null;
let isRunning = false;

// Queue to process launches without blocking
const scanQueue: Array<{ mint: string; platform: string; timestamp: number }> = [];
let isProcessingQueue = false;

// Safety caps to prevent runaway resource usage
const MAX_QUEUE_SIZE = 100;        // Never queue more than 100 at once
const MAX_SCANS_PER_HOUR = 500;   // Max auto-scans per hour
let scansThisHour = 0;
let hourResetAt = Date.now() + 3_600_000;

// ─── Queue processor ───

async function processQueue(): Promise<void> {
  if (isProcessingQueue || scanQueue.length === 0) return;
  isProcessingQueue = true;

  while (scanQueue.length > 0) {
    const item = scanQueue.shift()!;

    // Skip if already in our database
    try {
      const db = getDb();
      const exists = db.prepare(
        'SELECT 1 FROM token_launch_signals WHERE token_mint = ?'
      ).get(item.mint);
      if (exists) continue;
    } catch { continue; }

    // Skip obviously invalid mints
    if (!item.mint || item.mint === 'unknown' || item.mint.length < 32) continue;

    // Reset hourly counter
    if (Date.now() > hourResetAt) {
      scansThisHour = 0;
      hourResetAt = Date.now() + 3_600_000;
    }

    // Enforce hourly cap
    if (scansThisHour >= MAX_SCANS_PER_HOUR) {
      console.log(`[LaunchMonitor] Hourly cap (${MAX_SCANS_PER_HOUR}) reached, pausing until next hour`);
      scanQueue.length = 0; // clear queue
      break;
    }

    try {
      console.log(`[LaunchMonitor] Auto-scanning new ${item.platform} token: ${item.mint}`);
      const scan = await runInstantScan(item.mint);
      saveLaunchSignals(scan);
      scansThisHour++;
      console.log(`[LaunchMonitor] Saved signals for ${item.mint} — score: ${scan.overallScore} (${scan.riskLevel})`);
    } catch (err) {
      // Many new tokens fail to scan (not yet indexed) — that's fine
    }

    // Small delay between scans to avoid rate limits
    await new Promise(r => setTimeout(r, 1500));
  }

  isProcessingQueue = false;
}

// ─── Start/stop ───

export function startLaunchMonitor(): void {
  if (isRunning) return;
  isRunning = true;

  stopMonitor = addPairListener((event) => {
    if (event.tokenMint && event.tokenMint !== 'unknown') {
      // Don't let queue grow unbounded
      if (scanQueue.length >= MAX_QUEUE_SIZE) return;

      scanQueue.push({
        mint: event.tokenMint,
        platform: event.platform,
        timestamp: event.timestamp,
      });

      // Process queue if not already running
      setTimeout(() => processQueue().catch(() => {}), 0);
    }
  });

  console.log('[LaunchMonitor] Started — auto-scanning all new pump.fun + Raydium launches');
}

export function stopLaunchMonitor(): void {
  if (stopMonitor) {
    stopMonitor();
    stopMonitor = null;
  }
  isRunning = false;
  console.log('[LaunchMonitor] Stopped');
}

export function getLaunchMonitorStats(): {
  isRunning: boolean;
  queueLength: number;
  totalScanned: number;
} {
  let totalScanned = 0;
  try {
    const db = getDb();
    totalScanned = (db.prepare(
      'SELECT COUNT(*) as n FROM token_launch_signals'
    ).get() as any).n;
  } catch {}

  return {
    isRunning,
    queueLength: scanQueue.length,
    totalScanned,
  };
}

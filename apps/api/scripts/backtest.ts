#!/usr/bin/env node
/**
 * Backtest Script — Seed the MC prediction training dataset with historical data
 *
 * Pulls tokens from DexScreener's new pairs feed for Solana,
 * scans each one, and records outcomes.
 *
 * Run: npx tsx scripts/backtest.ts
 * Or:  npx tsx scripts/backtest.ts --limit 500
 */

import { runInstantScan } from '../src/services/instant-scanner.service.js';
import { saveLaunchSignals } from '../src/services/token-tracker.service.js';
import { getDatasetStats } from '../src/services/token-tracker.service.js';
import { getDb } from '../src/db/database.js';

const DEXSCREENER_API = 'https://api.dexscreener.com/token-profiles/latest/v1';
const NEW_PAIRS_API = 'https://api.dexscreener.com/latest/dex/pairs/solana';
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '200');
const DELAY_MS = 1200; // 1.2s between scans to avoid rate limits

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchRecentSolanaTokens(): Promise<string[]> {
  const mints = new Set<string>();

  console.log('Fetching recent Solana token profiles from DexScreener...');

  // Pull from token profiles endpoint (new tokens)
  try {
    const res = await fetch(DEXSCREENER_API);
    if (res.ok) {
      const data = await res.json() as any[];
      for (const item of data) {
        if (item.chainId === 'solana' && item.tokenAddress) {
          mints.add(item.tokenAddress);
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch token profiles:', err);
  }

  // Also pull boosted tokens (more established)
  try {
    const res2 = await fetch('https://api.dexscreener.com/token-boosts/latest/v1');
    if (res2.ok) {
      const data2 = await res2.json() as any[];
      for (const item of data2) {
        if (item.chainId === 'solana' && item.tokenAddress) {
          mints.add(item.tokenAddress);
        }
      }
    }
  } catch {}

  // Pull from trending Solana pairs
  try {
    const res3 = await fetch(`${NEW_PAIRS_API}?rankBy=volume&order=desc`);
    if (res3.ok) {
      const data3 = await res3.json() as any;
      for (const pair of (data3.pairs || [])) {
        if (pair.baseToken?.address) mints.add(pair.baseToken.address);
      }
    }
  } catch {}

  console.log(`Found ${mints.size} unique Solana tokens`);
  return [...mints].slice(0, LIMIT);
}

async function main() {
  console.log('\n🔍 Trenchable MC Prediction Backtest\n');
  console.log(`Target: ${LIMIT} tokens\n`);

  const tokens = await fetchRecentSolanaTokens();

  if (tokens.length === 0) {
    console.error('No tokens found — check internet connection');
    process.exit(1);
  }

  // Check which ones we already have
  const db = getDb();
  const existing = new Set(
    (db.prepare('SELECT token_mint FROM token_launch_signals').all() as any[])
      .map(r => r.token_mint)
  );

  const toScan = tokens.filter(t => !existing.has(t));
  console.log(`Already have ${existing.size} tokens. Scanning ${toScan.length} new ones...\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < toScan.length; i++) {
    const mint = toScan[i];
    const progress = `[${i + 1}/${toScan.length}]`;

    try {
      const scan = await runInstantScan(mint);
      saveLaunchSignals(scan);
      success++;
      console.log(`${progress} ✅ ${scan.tokenSymbol || mint.slice(0, 8)} — score: ${scan.overallScore} (${scan.riskLevel}) MC: $${scan.market?.marketCap?.toLocaleString() || 'N/A'}`);
    } catch (err: any) {
      failed++;
      if (i < 5) console.log(`${progress} ❌ ${mint.slice(0, 8)}... — ${err.message?.slice(0, 60)}`);
    }

    await sleep(DELAY_MS);

    // Print progress every 50 tokens
    if ((i + 1) % 50 === 0) {
      const stats = getDatasetStats();
      console.log(`\n📊 Progress: ${stats.totalTokens} tokens in DB, ${success} success, ${failed} failed\n`);
    }
  }

  const finalStats = getDatasetStats();
  console.log('\n✅ Backtest complete!\n');
  console.log('📊 Dataset Stats:');
  console.log(`   Total tokens: ${finalStats.totalTokens}`);
  console.log(`   With 24h outcomes: ${finalStats.tokensWithOutcomes}`);
  console.log(`   Rug rate: ${(finalStats.rugRate * 100).toFixed(1)}%`);
  console.log(`   Avg 1h multiple: ${finalStats.avgMCMultiple1h.toFixed(2)}x`);
  console.log(`   Avg 24h multiple: ${finalStats.avgMCMultiple24h.toFixed(2)}x`);
  console.log(`   Platforms: ${JSON.stringify(finalStats.platformBreakdown)}`);
  console.log('\nNote: Outcomes (1h/6h/24h MC) will be filled in by the tracker job over time.');
  console.log('Run the API for 24h+ to start accumulating outcome data.\n');
}

main().catch(err => {
  console.error('Backtest failed:', err);
  process.exit(1);
});

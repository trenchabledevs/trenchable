import { getDb } from './database.js';
import type { WatchlistEntry } from '@trenchable/shared';

export function getWatchlist(): WatchlistEntry[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, token_mint as tokenMint, token_name as tokenName, token_symbol as tokenSymbol,
           latest_score as latestScore, previous_score as previousScore,
           risk_level as riskLevel, platform, added_at as addedAt,
           last_scanned_at as lastScannedAt, auto_rescan as autoRescan
    FROM watchlist ORDER BY added_at DESC
  `).all() as WatchlistEntry[];
}

export function addToWatchlist(entry: {
  tokenMint: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  latestScore: number;
  riskLevel: string;
  platform: string;
}): WatchlistEntry | null {
  const db = getDb();
  const now = Date.now();
  try {
    db.prepare(`
      INSERT INTO watchlist (token_mint, token_name, token_symbol, latest_score, risk_level, platform, added_at, last_scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.tokenMint, entry.tokenName, entry.tokenSymbol, entry.latestScore, entry.riskLevel, entry.platform, now, now);

    return db.prepare(`
      SELECT id, token_mint as tokenMint, token_name as tokenName, token_symbol as tokenSymbol,
             latest_score as latestScore, previous_score as previousScore,
             risk_level as riskLevel, platform, added_at as addedAt,
             last_scanned_at as lastScannedAt, auto_rescan as autoRescan
      FROM watchlist WHERE token_mint = ?
    `).get(entry.tokenMint) as WatchlistEntry;
  } catch {
    return null; // Already exists
  }
}

export function removeFromWatchlist(tokenMint: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM watchlist WHERE token_mint = ?').run(tokenMint);
  return result.changes > 0;
}

export function updateWatchlistScore(tokenMint: string, newScore: number, riskLevel: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE watchlist
    SET previous_score = latest_score, latest_score = ?, risk_level = ?, last_scanned_at = ?
    WHERE token_mint = ?
  `).run(newScore, riskLevel, Date.now(), tokenMint);
}

export function getAutoRescanTokens(): WatchlistEntry[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, token_mint as tokenMint, token_name as tokenName, token_symbol as tokenSymbol,
           latest_score as latestScore, previous_score as previousScore,
           risk_level as riskLevel, platform, added_at as addedAt,
           last_scanned_at as lastScannedAt, auto_rescan as autoRescan
    FROM watchlist WHERE auto_rescan = 1
  `).all() as WatchlistEntry[];
}

export function toggleAutoRescan(tokenMint: string, enabled: boolean): void {
  const db = getDb();
  db.prepare('UPDATE watchlist SET auto_rescan = ? WHERE token_mint = ?').run(enabled ? 1 : 0, tokenMint);
}

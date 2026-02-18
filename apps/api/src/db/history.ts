import { getDb } from './database.js';
import type { ScanResponse, ScanHistoryEntry } from '@trenchable/shared';

export function saveScanToHistory(scan: ScanResponse): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO scan_history (token_mint, token_name, token_symbol, overall_score, risk_level, platform, scan_timestamp, checks_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scan.tokenMint,
    scan.tokenName,
    scan.tokenSymbol,
    scan.overallScore,
    scan.riskLevel,
    scan.platform,
    scan.scanTimestamp,
    JSON.stringify(scan.checks)
  );
}

export function getScanHistory(limit = 50, offset = 0): ScanHistoryEntry[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, token_mint as tokenMint, token_name as tokenName, token_symbol as tokenSymbol,
           overall_score as overallScore, risk_level as riskLevel, platform,
           scan_timestamp as scanTimestamp, checks_json as checksJson
    FROM scan_history ORDER BY scan_timestamp DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as ScanHistoryEntry[];
}

export function getHistoryForToken(tokenMint: string, limit = 20): ScanHistoryEntry[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, token_mint as tokenMint, token_name as tokenName, token_symbol as tokenSymbol,
           overall_score as overallScore, risk_level as riskLevel, platform,
           scan_timestamp as scanTimestamp, checks_json as checksJson
    FROM scan_history WHERE token_mint = ? ORDER BY scan_timestamp DESC LIMIT ?
  `).all(tokenMint, limit) as ScanHistoryEntry[];
}

export function clearHistory(): void {
  const db = getDb();
  db.prepare('DELETE FROM scan_history').run();
}

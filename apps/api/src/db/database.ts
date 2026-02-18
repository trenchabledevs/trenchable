import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'trenchable.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initTables(db);
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_mint TEXT NOT NULL,
      token_name TEXT,
      token_symbol TEXT,
      overall_score INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      platform TEXT NOT NULL,
      scan_timestamp INTEGER NOT NULL,
      checks_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scan_history_mint ON scan_history(token_mint);
    CREATE INDEX IF NOT EXISTS idx_scan_history_timestamp ON scan_history(scan_timestamp DESC);

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_mint TEXT NOT NULL UNIQUE,
      token_name TEXT,
      token_symbol TEXT,
      latest_score INTEGER NOT NULL DEFAULT 50,
      previous_score INTEGER,
      risk_level TEXT NOT NULL DEFAULT 'moderate',
      platform TEXT NOT NULL DEFAULT 'unknown',
      added_at INTEGER NOT NULL,
      last_scanned_at INTEGER NOT NULL,
      auto_rescan INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_watchlist_mint ON watchlist(token_mint);

    -- ─── MC Prediction Training Data ───────────────────────────────────

    -- Signals captured at launch time for each token we auto-monitor
    CREATE TABLE IF NOT EXISTS token_launch_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_mint TEXT NOT NULL UNIQUE,
      token_name TEXT,
      token_symbol TEXT,
      platform TEXT NOT NULL,
      scanned_at INTEGER NOT NULL,
      launch_mc REAL,
      launch_liquidity REAL,
      launch_price REAL,
      risk_score INTEGER,
      risk_level TEXT,
      lp_locked_pct REAL,
      lp_burned_pct REAL,
      top_holder_pct REAL,
      holder_count INTEGER,
      dev_wallet_pct REAL,
      bundle_pct REAL,
      buy_tax REAL,
      sell_tax REAL,
      mint_revoked INTEGER,
      freeze_revoked INTEGER,
      bonding_curve_pct REAL,
      has_socials INTEGER,
      rugcheck_score INTEGER,
      insiders_detected INTEGER,
      mc_1h REAL,
      mc_6h REAL,
      mc_24h REAL,
      price_1h REAL,
      price_6h REAL,
      price_24h REAL,
      rug_detected INTEGER DEFAULT 0,
      rug_time_minutes INTEGER,
      outcome_checked_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_launch_signals_mint ON token_launch_signals(token_mint);
    CREATE INDEX IF NOT EXISTS idx_launch_signals_platform ON token_launch_signals(platform);
    CREATE INDEX IF NOT EXISTS idx_launch_signals_scanned ON token_launch_signals(scanned_at DESC);
    CREATE INDEX IF NOT EXISTS idx_launch_signals_outcome ON token_launch_signals(outcome_checked_at);
  `);
}

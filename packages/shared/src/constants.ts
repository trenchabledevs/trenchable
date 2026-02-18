// Solana Program IDs
export const PROGRAM_IDS = {
  SPL_TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TOKEN_2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  RAYDIUM_V4_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CPMM: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PUMP_SWAP_AMM: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
  PUMP_FUN_MIGRATION: '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg',
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
} as const;

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const BURN_ADDRESS = '1nc1nerator11111111111111111111111111111111';

// Risk scoring thresholds
export const RISK_THRESHOLDS = {
  LOW: 25,
  MODERATE: 50,
  HIGH: 75,
  CRITICAL: 100,
} as const;

// Deep scan weights (all 12 checks)
export const RISK_WEIGHTS = {
  MINT_AUTHORITY: 0.14,
  FREEZE_AUTHORITY: 0.10,
  LP_STATUS: 0.15,
  TOP_HOLDERS: 0.12,
  BUNDLE_DETECTION: 0.10,
  DEV_WALLET: 0.08,
  HONEYPOT: 0.08,
  WALLET_CLUSTER: 0.07,
  SOCIAL_SENTIMENT: 0.04,
  RUG_PATTERN: 0.05,
  TOKEN_TAX: 0.04,
  SNIPER_BOTS: 0.03,
} as const;

// Instant scan weights (9 checks — cluster/sniper/bundle merged into rug_pattern)
// Rebalanced for external-API-only fidelity
export const INSTANT_RISK_WEIGHTS = {
  LP_STATUS: 0.18,
  MINT_AUTHORITY: 0.15,
  TOP_HOLDERS: 0.14,
  RUG_PATTERN: 0.13,  // absorbs cluster + sniper + bundle signals
  HONEYPOT: 0.12,
  FREEZE_AUTHORITY: 0.10,
  DEV_WALLET: 0.07,
  TOKEN_TAX: 0.06,
  SOCIAL_SENTIMENT: 0.05,
} as const;

// Pump.fun bonding curve graduation threshold in lamports (85 SOL)
export const PUMP_FUN_GRADUATION_SOL = 85;
export const LAMPORTS_PER_SOL = 1_000_000_000;

// Known sniper bot wallets (well-known MEV/snipe bots on Solana)
export const KNOWN_SNIPER_BOTS = new Set([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',   // Jupiter aggregator (not a bot but often in early txs)
  'MEVx29EAWB63LFHorah4nCUqMXRdEQLv5nMhAi2cfN1',   // Known MEV bot
  'Bot1111111111111111111111111111111111111111',      // Placeholder for known bots
]);

// Known rug patterns — token metadata indicators
export const RUG_PATTERN_INDICATORS = {
  // Suspicious name patterns
  suspiciousNames: [
    /test/i, /rug/i, /scam/i, /fake/i, /honeypot/i,
    /airdrop/i, /free.*money/i, /guaranteed/i,
  ],
  // Copy-cat patterns (famous tokens)
  copycatNames: [
    /^bonk$/i, /^wif$/i, /^pepe$/i, /^shib$/i, /^doge$/i,
    /^trump$/i, /^melania$/i, /^jeo$/i,
  ],
  // Token-2022 transfer fee thresholds
  maxAcceptableTaxBps: 500, // 5% — anything above is suspicious
  criticalTaxBps: 2000,     // 20% — almost certainly a rug
} as const;

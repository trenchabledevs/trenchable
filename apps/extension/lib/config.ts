// API Configuration
// Development: 'http://localhost:3001'
// Production:  'https://api.trenchable.gold'
export const API_BASE_URL = 'https://api.trenchable.gold';

// Cache TTLs in milliseconds
export const INSTANT_CACHE_TTL = 30_000;  // 30 seconds
export const DEEP_CACHE_TTL = 120_000;    // 2 minutes

// Solana address regex (base58, 32-44 chars)
export const SOLANA_ADDRESS_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

// Platform URL patterns
// Axiom uses /meme/<MINT> and /t/<MINT> (and possibly other paths with a bare address)
// pump.fun uses /coin/<MINT> or /<MINT>
// Query strings / hash fragments are allowed after the mint address
export const PLATFORM_PATTERNS = {
  axiom: {
    domain: 'axiom.trade',
    pathRegex: /^\/(?:meme|t)\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:[?#/].*)?$/,
  },
  pumpfun: {
    domain: 'pump.fun',
    pathRegex: /^(?:\/coin)?\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:[?#/].*)?$/,
  },
  // Photon: photon-sol.tinyastro.io/#r@<MINT> or /r/<MINT>
  photon: {
    domain: 'photon-sol.tinyastro.io',
    pathRegex: /^\/(?:r|en)\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:[?#/].*)?$/,
    hashRegex: /[#@]r@([1-9A-HJ-NP-Za-km-z]{32,44})/,
  },
  // BullX: bullx.io/terminal?chainId=solana&address=<MINT>
  bullx: {
    domain: 'bullx.io',
    paramKey: 'address',
  },
  // DexScreener: dexscreener.com/solana/<PAIR_OR_MINT>
  dexscreener: {
    domain: 'dexscreener.com',
    pathRegex: /^\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:[?#/].*)?$/,
  },
} as const;

// Risk level colors
export const RISK_COLORS = {
  low: '#22c55e',
  moderate: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
} as const;

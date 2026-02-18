import 'dotenv/config';

export const config = {
  rpc: {
    primary: process.env.SOLANA_RPC_PRIMARY || null,
    fallback: process.env.SOLANA_RPC_FALLBACK || 'https://api.mainnet-beta.solana.com',
    ws: process.env.SOLANA_WS_ENDPOINT || null,
  },
  server: {
    port: parseInt(process.env.API_PORT || '3001', 10),
    host: process.env.API_HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  cache: {
    scanTtlMs: parseInt(process.env.SCAN_CACHE_TTL_MS || '60000', 10),
    instantTtlMs: parseInt(process.env.INSTANT_CACHE_TTL_MS || '30000', 10),
  },
  jupiter: {
    apiUrl: process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6',
  },
  auth: {
    apiKeys: process.env.API_KEYS ? process.env.API_KEYS.split(',').map(k => k.trim()) : [],
  },
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED === 'true',
    instantPerHour: parseInt(process.env.RATE_LIMIT_INSTANT_PER_HOUR || '50', 10),
    deepPerHour: parseInt(process.env.RATE_LIMIT_DEEP_PER_HOUR || '10', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

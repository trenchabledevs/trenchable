import type { FastifyInstance } from 'fastify';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  toggleAutoRescan,
  getAutoRescanTokens,
  updateWatchlistScore,
} from '../db/watchlist.js';
import { runScan } from '../services/scanner.service.js';

export async function watchlistRoutes(app: FastifyInstance) {
  // Get all watchlist items
  app.get('/api/watchlist', async () => {
    return getWatchlist();
  });

  // Add token to watchlist
  app.post<{ Body: { tokenMint: string; tokenName?: string; tokenSymbol?: string; latestScore?: number; riskLevel?: string; platform?: string } }>(
    '/api/watchlist',
    async (request, reply) => {
      const { tokenMint, tokenName, tokenSymbol, latestScore, riskLevel, platform } = request.body || {};
      if (!tokenMint) {
        return reply.status(400).send({ error: 'tokenMint is required' });
      }

      const entry = addToWatchlist({
        tokenMint,
        tokenName: tokenName || null,
        tokenSymbol: tokenSymbol || null,
        latestScore: latestScore || 50,
        riskLevel: riskLevel || 'moderate',
        platform: platform || 'unknown',
      });

      if (!entry) {
        return reply.status(409).send({ error: 'Token already in watchlist' });
      }
      return entry;
    }
  );

  // Remove from watchlist
  app.delete<{ Params: { tokenMint: string } }>('/api/watchlist/:tokenMint', async (request, reply) => {
    const removed = removeFromWatchlist(request.params.tokenMint);
    if (!removed) {
      return reply.status(404).send({ error: 'Token not in watchlist' });
    }
    return { success: true };
  });

  // Toggle auto-rescan
  app.put<{ Params: { tokenMint: string }; Body: { enabled: boolean } }>(
    '/api/watchlist/:tokenMint/auto-rescan',
    async (request) => {
      toggleAutoRescan(request.params.tokenMint, request.body.enabled);
      return { success: true };
    }
  );

  // Rescan all auto-rescan tokens
  app.post('/api/watchlist/rescan-all', async () => {
    const tokens = getAutoRescanTokens();
    const results: { tokenMint: string; newScore: number; previousScore: number | null }[] = [];

    for (const token of tokens) {
      try {
        const scan = await runScan(token.tokenMint);
        updateWatchlistScore(token.tokenMint, scan.overallScore, scan.riskLevel);
        results.push({
          tokenMint: token.tokenMint,
          newScore: scan.overallScore,
          previousScore: token.latestScore,
        });
      } catch {
        // Skip failed rescans
      }
    }

    return { rescanned: results.length, results };
  });
}

// Auto-rescan interval (runs every 5 minutes)
let rescanInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoRescan() {
  if (rescanInterval) return;
  rescanInterval = setInterval(async () => {
    const tokens = getAutoRescanTokens();
    for (const token of tokens) {
      try {
        const scan = await runScan(token.tokenMint);
        updateWatchlistScore(token.tokenMint, scan.overallScore, scan.riskLevel);
      } catch { /* skip */ }
    }
  }, 5 * 60 * 1000); // 5 minutes
  console.log('[Watchlist] Auto-rescan started (every 5 minutes)');
}

export function stopAutoRescan() {
  if (rescanInterval) {
    clearInterval(rescanInterval);
    rescanInterval = null;
  }
}

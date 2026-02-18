import type { FastifyInstance } from 'fastify';
import { getScanHistory, getHistoryForToken, clearHistory } from '../db/history.js';

export async function historyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string; offset?: string } }>('/api/history', async (request) => {
    const limit = parseInt(request.query.limit || '50', 10);
    const offset = parseInt(request.query.offset || '0', 10);
    return getScanHistory(limit, offset);
  });

  app.get<{ Params: { tokenMint: string } }>('/api/history/:tokenMint', async (request) => {
    return getHistoryForToken(request.params.tokenMint);
  });

  app.delete('/api/history', async () => {
    clearHistory();
    return { success: true };
  });
}

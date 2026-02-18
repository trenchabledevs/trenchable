import type { FastifyInstance } from 'fastify';
import { runScan } from '../services/scanner.service.js';
import type { ScanResponse } from '@trenchable/shared';

export async function compareRoutes(app: FastifyInstance) {
  // Compare multiple tokens
  app.post<{ Body: { tokenMints: string[] } }>('/api/compare', async (request, reply) => {
    const { tokenMints } = request.body || {};

    if (!tokenMints || !Array.isArray(tokenMints) || tokenMints.length < 2) {
      return reply.status(400).send({ error: 'Provide at least 2 token mints to compare' });
    }

    if (tokenMints.length > 5) {
      return reply.status(400).send({ error: 'Maximum 5 tokens can be compared at once' });
    }

    const results = await Promise.allSettled(
      tokenMints.map(mint => runScan(mint))
    );

    const scans: ScanResponse[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        scans.push(result.value);
      }
    }

    return { scans };
  });
}

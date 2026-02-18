import type { FastifyInstance } from 'fastify';
import { testConnection } from '../config/rpc.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    const { ok, latencyMs } = await testConnection();
    return {
      status: ok ? 'ok' : 'error',
      rpcConnected: ok,
      rpcLatencyMs: latencyMs,
    };
  });
}

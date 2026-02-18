import type { FastifyInstance } from 'fastify';
import { Connection } from '@solana/web3.js';
import { config } from '../config/env.js';
import { updateConnection, testConnection } from '../config/rpc.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings/rpc', async () => {
    return {
      primaryRpc: config.rpc.primary ? '***configured***' : null,
      fallbackRpc: config.rpc.fallback,
    };
  });

  app.put<{ Body: { primaryRpc: string } }>('/api/settings/rpc', async (request, reply) => {
    const { primaryRpc } = request.body || {};

    if (!primaryRpc || typeof primaryRpc !== 'string') {
      return reply.status(400).send({ error: 'Invalid RPC URL' });
    }

    try {
      // Test the new connection before accepting it
      const testConn = new Connection(primaryRpc, { commitment: 'confirmed' });
      const { ok, latencyMs } = await testConnection(testConn);

      if (!ok) {
        return reply.status(400).send({
          error: 'RPC connection failed',
          message: 'Could not connect to the provided RPC endpoint',
        });
      }

      // Update the active connection
      updateConnection(primaryRpc);
      config.rpc.primary = primaryRpc;

      return { success: true, latencyMs };
    } catch (error) {
      return reply.status(400).send({
        error: 'Invalid RPC URL',
        message: String(error),
      });
    }
  });
}

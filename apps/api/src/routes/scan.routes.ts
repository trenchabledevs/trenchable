import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { runScan } from '../services/scanner.service.js';

function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

export async function scanRoutes(app: FastifyInstance) {
  // Scan by POST
  app.post<{ Body: { tokenMint: string } }>('/api/scan', async (request, reply) => {
    const { tokenMint } = request.body || {};

    if (!tokenMint || !isValidSolanaAddress(tokenMint)) {
      return reply.status(400).send({
        error: 'Invalid token mint address',
        message: 'Please provide a valid Solana token address',
      });
    }

    try {
      const result = await runScan(tokenMint);
      return result;
    } catch (error) {
      return reply.status(500).send({
        error: 'Scan failed',
        message: String(error),
      });
    }
  });

  // Scan by GET (convenience endpoint)
  app.get<{ Params: { tokenMint: string } }>('/api/scan/:tokenMint', async (request, reply) => {
    const { tokenMint } = request.params;

    if (!isValidSolanaAddress(tokenMint)) {
      return reply.status(400).send({
        error: 'Invalid token mint address',
      });
    }

    try {
      const result = await runScan(tokenMint);
      return result;
    } catch (error) {
      return reply.status(500).send({
        error: 'Scan failed',
        message: String(error),
      });
    }
  });
}

import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { runInstantScan } from '../services/instant-scanner.service.js';
import { runScan } from '../services/scanner.service.js';

function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

export async function instantScanRoutes(app: FastifyInstance) {
  // Instant scan — external API data only, <2s target
  app.get<{ Params: { tokenMint: string } }>('/api/scan/instant/:tokenMint', async (request, reply) => {
    const { tokenMint } = request.params;

    if (!isValidSolanaAddress(tokenMint)) {
      return reply.status(400).send({
        error: 'Invalid token mint address',
      });
    }

    try {
      const result = await runInstantScan(tokenMint);
      return result;
    } catch (error) {
      return reply.status(500).send({
        error: 'Instant scan failed',
        message: String(error),
      });
    }
  });

  // Deep scan — full 12-check pipeline
  app.get<{ Params: { tokenMint: string } }>('/api/scan/deep/:tokenMint', async (request, reply) => {
    const { tokenMint } = request.params;

    if (!isValidSolanaAddress(tokenMint)) {
      return reply.status(400).send({
        error: 'Invalid token mint address',
      });
    }

    try {
      const result = await runScan(tokenMint);
      // Wrap in extended format
      return {
        ...result,
        scanMode: 'deep' as const,
        mcPrediction: null, // Deep scan currently returns standard format
      };
    } catch (error) {
      return reply.status(500).send({
        error: 'Deep scan failed',
        message: String(error),
      });
    }
  });

  // SSE streaming scan — sends instant first, then deep results
  app.get<{ Params: { tokenMint: string } }>('/api/scan/stream/:tokenMint', async (request, reply) => {
    const { tokenMint } = request.params;

    if (!isValidSolanaAddress(tokenMint)) {
      return reply.status(400).send({
        error: 'Invalid token mint address',
      });
    }

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Phase 1: Send instant scan result immediately
      sendEvent('instant', { status: 'scanning' });

      const instantResult = await runInstantScan(tokenMint);
      sendEvent('instant', { status: 'complete', data: instantResult });

      // Phase 2: Start deep scan
      sendEvent('deep', { status: 'scanning' });

      const deepResult = await runScan(tokenMint);
      sendEvent('deep', {
        status: 'complete',
        data: {
          ...deepResult,
          scanMode: 'deep',
          mcPrediction: instantResult.mcPrediction, // Carry over from instant
        },
      });

      // Done
      sendEvent('done', { status: 'complete' });
    } catch (error) {
      sendEvent('error', { message: String(error) });
    } finally {
      reply.raw.end();
    }
  });
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';

/**
 * API key authentication middleware.
 * When API_KEYS is configured, requires X-API-Key header.
 * When not configured (dev mode), all requests pass through.
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Health endpoint is always public
  if (request.url === '/api/health') return;

  // If no API keys configured, allow all (dev mode)
  const apiKeys = config.auth?.apiKeys;
  if (!apiKeys || apiKeys.length === 0) return;

  const providedKey = request.headers['x-api-key'] as string;

  if (!providedKey) {
    return reply.status(401).send({
      error: 'Authentication required',
      message: 'Please provide an API key via X-API-Key header',
    });
  }

  if (!apiKeys.includes(providedKey)) {
    return reply.status(403).send({
      error: 'Invalid API key',
      message: 'The provided API key is not valid',
    });
  }

  // Attach key identity for rate limiting
  (request as any).apiKey = providedKey;
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';

interface RateLimitEntry {
  instant: number;
  deep: number;
  resetAt: number;
}

// In-memory rate limit store (upgrade to Redis for multi-instance)
const limitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limitStore) {
    if (now > entry.resetAt) {
      limitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getOrCreateEntry(key: string): RateLimitEntry {
  const now = Date.now();
  let entry = limitStore.get(key);

  if (!entry || now > entry.resetAt) {
    entry = {
      instant: 0,
      deep: 0,
      resetAt: now + 3600_000, // 1 hour window
    };
    limitStore.set(key, entry);
  }

  return entry;
}

/**
 * Rate limiting middleware.
 * When rate limits are configured, enforces per-key request limits.
 * Free tier: 50 instant/hr, 10 deep/hr (configurable via env).
 */
export async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Skip if rate limiting is disabled
  if (!config.rateLimit?.enabled) return;

  // Health endpoint is exempt
  if (request.url === '/api/health') return;

  // Use API key or IP as identifier
  const key = (request as any).apiKey || request.ip || 'anonymous';
  const entry = getOrCreateEntry(key);

  const isInstant = request.url.includes('/scan/instant/');
  const isDeep = request.url.includes('/scan/deep/') || request.url.includes('/scan/stream/');
  const isScan = request.url.startsWith('/api/scan');

  if (!isScan) return; // Only rate limit scan endpoints

  const remaining = Math.max(0, Math.ceil((entry.resetAt - Date.now()) / 1000));

  if (isInstant) {
    if (entry.instant >= config.rateLimit.instantPerHour) {
      reply.header('X-RateLimit-Reset', entry.resetAt.toString());
      reply.header('Retry-After', remaining.toString());
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        message: `Instant scan limit: ${config.rateLimit.instantPerHour}/hour. Resets in ${remaining}s`,
      });
    }
    entry.instant++;
    reply.header('X-RateLimit-Remaining-Instant', (config.rateLimit.instantPerHour - entry.instant).toString());
  } else if (isDeep) {
    if (entry.deep >= config.rateLimit.deepPerHour) {
      reply.header('X-RateLimit-Reset', entry.resetAt.toString());
      reply.header('Retry-After', remaining.toString());
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        message: `Deep scan limit: ${config.rateLimit.deepPerHour}/hour. Resets in ${remaining}s`,
      });
    }
    entry.deep++;
    reply.header('X-RateLimit-Remaining-Deep', (config.rateLimit.deepPerHour - entry.deep).toString());
  }
}

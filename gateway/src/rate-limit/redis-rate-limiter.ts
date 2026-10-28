import { Redis } from 'ioredis';
import pino from 'pino';
import type { RateLimiter } from './rate-limiter.js';

const logger = pino({ name: 'rate-limiter' });

// One round trip, atomic: trim the window, count, and add the hit only if it fits. Redis TIME is
// the clock so every gateway instance agrees on it.
const SLIDING_WINDOW = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
local count = redis.call('ZCARD', KEYS[1])
if count < limit then
  redis.call('ZADD', KEYS[1], now, now .. ':' .. ARGV[3])
  redis.call('PEXPIRE', KEYS[1], window)
  return {1, limit - count - 1, 0}
end
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
return {0, 0, tonumber(oldest[2]) + window - now}
`;

/**
 * Redis adapter. Fails open: if Redis is unreachable the request is allowed, because a cache-tier
 * outage should not take the whole API down.
 */
export function createRedisRateLimiter(url: string): RateLimiter {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
    lazyConnect: true
  });
  client.on('error', (err) => logger.warn({ err: err.message }, 'Redis error - rate limiting disabled'));
  client.connect().catch((err) => logger.warn({ err: err.message }, 'Initial Redis connection failed'));

  let counter = 0;

  return {
    async hit(key, limit, windowMs) {
      if (client.status !== 'ready') return { allowed: true, remaining: limit, retryAfterMs: 0 };
      try {
        const [allowed, remaining, retryAfterMs] = (await client.eval(
          SLIDING_WINDOW,
          1,
          `ratelimit:${key}`,
          windowMs,
          limit,
          String(counter++)
        )) as [number, number, number];
        return { allowed: allowed === 1, remaining, retryAfterMs };
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Rate limit check failed; allowing request');
        return { allowed: true, remaining: limit, retryAfterMs: 0 };
      }
    },
    async close() {
      await client.quit().catch(() => undefined);
    }
  };
}

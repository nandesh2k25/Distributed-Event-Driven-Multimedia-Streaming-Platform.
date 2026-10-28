import { Redis } from 'ioredis';
import pino from 'pino';
import type { CatalogCache } from './catalog-cache.js';

const logger = pino({ name: 'catalog-cache' });
const GENERATION_KEY = 'catalog:gen';

/**
 * Redis adapter. Every key embeds a generation number; `catalogChanged()` increments it, which
 * is atomic and needs no key scan. Any Redis failure degrades to "no cache", never to an error.
 */
export function createRedisCache(url: string): CatalogCache {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
    lazyConnect: true
  });
  client.on('error', (err) => logger.warn({ err: err.message }, 'Redis error - running without cache'));
  client.connect().catch((err) => logger.warn({ err: err.message }, 'Initial Redis connection failed'));

  const ready = () => client.status === 'ready';

  return {
    async remember(scope, args, ttlSeconds, load) {
      let key: string | null = null;

      if (ready()) {
        try {
          // Read the generation *before* loading: a slow load that finishes after a write
          // stores under the old generation, which no later read will look at.
          const generation = (await client.get(GENERATION_KEY)) ?? '0';
          key = `catalog:g${generation}:${scope}:${JSON.stringify(args)}`;
          const cached = await client.get(key);
          if (cached !== null) return (JSON.parse(cached) as { v: never }).v;
        } catch (err) {
          logger.warn({ scope, err: (err as Error).message }, 'Cache read failed');
          key = null;
        }
      }

      const value = await load();

      if (key !== null && value !== undefined) {
        try {
          await client.set(key, JSON.stringify({ v: value }), 'EX', ttlSeconds);
        } catch (err) {
          logger.warn({ scope, err: (err as Error).message }, 'Cache write failed');
        }
      }
      return value;
    },

    async catalogChanged() {
      if (!ready()) return; // reads bypass the cache while Redis is down, so nothing can be stale
      try {
        await client.incr(GENERATION_KEY);
      } catch (err) {
        // The data write already succeeded, so don't fail the request; entries expire by TTL.
        logger.error({ err: (err as Error).message }, 'Cache invalidation failed; stale reads possible until TTL');
      }
    },

    async health() {
      if (!ready()) return 'down';
      try {
        return (await client.ping()) === 'PONG' ? 'up' : 'error';
      } catch {
        return 'error';
      }
    },

    async close() {
      await client.quit().catch(() => client.disconnect());
    }
  };
}

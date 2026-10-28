import { describe, expect, it, vi } from 'vitest';
import { describeCatalogCacheContract } from './cache.contract.js';
import { createRedisCache } from './redis-cache.js';
import { config } from '../config.js';
import type { CatalogCache } from './catalog-cache.js';

async function untilUp(cache: CatalogCache) {
  for (let i = 0; i < 50; i++) {
    if ((await cache.health()) === 'up') return cache;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Redis is not reachable at ${config.redisUrl}; start it with "pnpm docker:up"`);
}

// Needs the Redis container from docker-compose, like the rest of the catalog tests need Postgres.
describeCatalogCacheContract('redis adapter', async () => untilUp(createRedisCache(config.redisUrl)));

describe('redis adapter when Redis is unreachable', () => {
  it('degrades to running the loader every time, without throwing', async () => {
    const cache = createRedisCache('redis://127.0.0.1:1'); // nothing listens here
    const load = vi.fn(async () => 'value');

    expect(await cache.remember('s', [], 60, load)).toBe('value');
    expect(await cache.remember('s', [], 60, load)).toBe('value');
    expect(load).toHaveBeenCalledTimes(2);

    await expect(cache.catalogChanged()).resolves.toBeUndefined();
    expect(await cache.health()).toBe('down');
    await cache.close();
  });
});

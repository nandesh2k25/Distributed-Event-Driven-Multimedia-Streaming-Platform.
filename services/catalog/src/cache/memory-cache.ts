import type { CatalogCache } from './catalog-cache.js';

/** In-process adapter for tests. Mirrors the Redis adapter, including JSON round-tripping. */
export function createMemoryCache(now: () => number = Date.now): CatalogCache {
  let generation = 0;
  const store = new Map<string, { json: string; expiresAt: number }>();

  return {
    async remember(scope, args, ttlSeconds, load) {
      const startedAt = generation; // results are filed under the generation current at read start
      const key = `g${startedAt}:${scope}:${JSON.stringify(args)}`;

      const hit = store.get(key);
      if (hit && hit.expiresAt > now()) return (JSON.parse(hit.json) as { v: never }).v;

      const value = await load();
      if (value !== undefined) {
        store.set(key, { json: JSON.stringify({ v: value }), expiresAt: now() + ttlSeconds * 1000 });
      }
      return value;
    },

    async catalogChanged() {
      generation += 1;
      store.clear(); // unreachable anyway; free the memory
    },

    async health() {
      return 'up';
    },

    async close() {
      store.clear();
    }
  };
}

import { describe, expect, it } from 'vitest';
import { describeCatalogCacheContract } from './cache.contract.js';
import { createMemoryCache } from './memory-cache.js';

describeCatalogCacheContract('in-memory adapter', async () => createMemoryCache());

describe('in-memory adapter clock', () => {
  it('expires entries using the injected clock', async () => {
    let now = 1_000;
    const cache = createMemoryCache(() => now);
    await cache.remember('s', [], 10, async () => 'a');
    now += 9_000;
    expect(await cache.remember('s', [], 10, async () => 'b')).toBe('a');
    now += 2_000;
    expect(await cache.remember('s', [], 10, async () => 'c')).toBe('c');
  });
});

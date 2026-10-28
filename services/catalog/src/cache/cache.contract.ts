import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CatalogCache } from './catalog-cache.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Behaviour every CatalogCache adapter must have. Scopes are random so runs never collide. */
export function describeCatalogCacheContract(name: string, make: () => Promise<CatalogCache>) {
  describe(`CatalogCache contract: ${name}`, () => {
    const scope = () => `contract-${randomUUID()}`;
    const counting = <T>(value: T) => vi.fn(async () => value);

    it('runs the loader once per (scope, args) and serves hits afterwards', async () => {
      const cache = await make();
      const s = scope();
      const load = counting({ n: 1 });

      expect(await cache.remember(s, ['a'], 60, load)).toEqual({ n: 1 });
      expect(await cache.remember(s, ['a'], 60, load)).toEqual({ n: 1 });
      expect(load).toHaveBeenCalledTimes(1);
      await cache.close();
    });

    it('keeps different args and different scopes apart, distinguishing types', async () => {
      const cache = await make();
      const s = scope();
      const one = counting('one');
      const two = counting('two');
      const three = counting('three');
      const other = counting('other');

      expect(await cache.remember(s, ['a', 1], 60, one)).toBe('one');
      expect(await cache.remember(s, ['a', '1'], 60, two)).toBe('two');
      expect(await cache.remember(s, [], 60, three)).toBe('three');
      expect(await cache.remember(scope(), ['a', 1], 60, other)).toBe('other');
      expect(await cache.remember(s, ['a', 1], 60, counting('never'))).toBe('one');
      await cache.close();
    });

    it('caches falsy and null results too', async () => {
      const cache = await make();
      for (const falsy of [null, 0, '', false]) {
        const load = counting(falsy);
        const s = scope();
        await cache.remember(s, [], 60, load);
        expect(await cache.remember(s, [], 60, load)).toBe(falsy);
        expect(load).toHaveBeenCalledTimes(1);
      }
      await cache.close();
    });

    it('does not cache a failing loader and propagates its error', async () => {
      const cache = await make();
      const s = scope();
      await expect(cache.remember(s, [], 60, async () => { throw new Error('db down'); })).rejects.toThrow('db down');
      expect(await cache.remember(s, [], 60, counting('recovered'))).toBe('recovered');
      await cache.close();
    });

    it('makes every cached read unreachable after catalogChanged()', async () => {
      const cache = await make();
      const a = scope();
      const b = scope();
      await cache.remember(a, [], 60, counting('old-a'));
      await cache.remember(b, ['x'], 60, counting('old-b'));

      await cache.catalogChanged();

      expect(await cache.remember(a, [], 60, counting('new-a'))).toBe('new-a');
      expect(await cache.remember(b, ['x'], 60, counting('new-b'))).toBe('new-b');
      await cache.close();
    });

    it('never serves a value whose load was already in flight when the catalog changed', async () => {
      const cache = await make();
      const s = scope();
      let finish!: (v: string) => void;
      const slow = new Promise<string>((resolve) => (finish = resolve));

      const inFlight = cache.remember(s, [], 60, () => slow); // started before the write...
      await sleep(20);
      await cache.catalogChanged(); //                         ...the write lands...
      finish('stale'); //                                      ...then the old read finishes
      expect(await inFlight).toBe('stale'); // that caller still gets what it loaded

      expect(await cache.remember(s, [], 60, counting('fresh'))).toBe('fresh'); // but nobody else does
      await cache.close();
    });

    it('expires entries after their TTL', async () => {
      const cache = await make();
      const s = scope();
      await cache.remember(s, [], 1, counting('first'));
      await sleep(1200);
      expect(await cache.remember(s, [], 1, counting('second'))).toBe('second');
      await cache.close();
    });

    it('returns hits in JSON form (Dates become ISO strings) so adapters cannot drift', async () => {
      const cache = await make();
      const s = scope();
      await cache.remember(s, [], 60, counting({ at: new Date(0) }));
      expect(await cache.remember(s, [], 60, counting({ at: 'unused' }))).toEqual({ at: '1970-01-01T00:00:00.000Z' });
      await cache.close();
    });

    it('reports health', async () => {
      const cache = await make();
      expect(await cache.health()).toBe('up');
      await cache.close();
    });
  });
}

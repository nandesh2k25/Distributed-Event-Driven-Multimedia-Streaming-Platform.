import { afterEach, describe, expect, it } from 'vitest';
import type { RateLimiter } from './rate-limiter.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Behaviour every RateLimiter adapter must have. Uses real (short) windows so any clock works. */
export function rateLimiterContract(name: string, create: () => RateLimiter) {
  describe(`RateLimiter contract: ${name}`, () => {
    let limiter: RateLimiter;
    let n = 0;
    const key = () => `contract-${Date.now()}-${n++}`;

    afterEach(async () => {
      await limiter?.close();
    });

    it('allows requests up to the limit and reports what remains', async () => {
      limiter = create();
      const k = key();
      expect((await limiter.hit(k, 3, 5000)).remaining).toBe(2);
      expect((await limiter.hit(k, 3, 5000)).remaining).toBe(1);
      expect(await limiter.hit(k, 3, 5000)).toMatchObject({ allowed: true, remaining: 0 });
    });

    it('rejects over the limit with a positive retry delay', async () => {
      limiter = create();
      const k = key();
      for (let i = 0; i < 2; i++) await limiter.hit(k, 2, 5000);

      const result = await limiter.hit(k, 2, 5000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(5000);
    });

    it('does not count rejected requests against the window', async () => {
      limiter = create();
      const k = key();
      await limiter.hit(k, 1, 300);
      for (let i = 0; i < 5; i++) await limiter.hit(k, 1, 300);

      await sleep(350);
      expect((await limiter.hit(k, 1, 300)).allowed).toBe(true);
    });

    it('lets requests through again once they slide out of the window', async () => {
      limiter = create();
      const k = key();
      await limiter.hit(k, 1, 200);
      expect((await limiter.hit(k, 1, 200)).allowed).toBe(false);

      await sleep(250);
      expect((await limiter.hit(k, 1, 200)).allowed).toBe(true);
    });

    it('limits each key independently', async () => {
      limiter = create();
      const a = key();
      const b = key();
      await limiter.hit(a, 1, 5000);

      expect((await limiter.hit(a, 1, 5000)).allowed).toBe(false);
      expect((await limiter.hit(b, 1, 5000)).allowed).toBe(true);
    });
  });
}

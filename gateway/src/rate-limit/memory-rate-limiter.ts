import type { RateLimiter } from './rate-limiter.js';

/** In-process adapter for tests and single-instance use. `now` is injectable so tests control time. */
export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    async hit(key, limit, windowMs) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => at > t - windowMs);

      const oldest = recent[0];
      if (oldest !== undefined && recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, remaining: 0, retryAfterMs: oldest + windowMs - t };
      }

      recent.push(t);
      hits.set(key, recent);
      return { allowed: true, remaining: limit - recent.length, retryAfterMs: 0 };
    },
    async close() {
      hits.clear();
    }
  };
}

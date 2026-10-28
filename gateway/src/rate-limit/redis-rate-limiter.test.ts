import { describe, expect, it } from 'vitest';
import { createRedisRateLimiter } from './redis-rate-limiter.js';
import { rateLimiterContract } from './rate-limiter.contract.js';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

rateLimiterContract('redis', () => {
  const limiter = createRedisRateLimiter(url);
  const hit = limiter.hit.bind(limiter);
  let connected = false;

  // The adapter connects lazily and fails open until ready, so wait for a real answer first
  // (with limit 1, an allowed probe reports remaining 0; a fail-open one reports 1).
  limiter.hit = async (...args) => {
    for (let i = 0; !connected && i < 30; i++) {
      connected = (await hit(`probe-${Math.random()}`, 1, 1000)).remaining === 0;
      if (!connected) await new Promise((r) => setTimeout(r, 100));
    }
    return hit(...args);
  };
  return limiter;
});

describe('redis rate limiter failure mode', () => {
  it('fails open when Redis is unreachable', async () => {
    const limiter = createRedisRateLimiter('redis://localhost:1');
    const result = await limiter.hit('k', 1, 1000);
    expect(result.allowed).toBe(true);
    await limiter.close();
  });
});

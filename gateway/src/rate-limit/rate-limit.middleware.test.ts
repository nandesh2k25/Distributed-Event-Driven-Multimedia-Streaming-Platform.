import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createMemoryRateLimiter } from './memory-rate-limiter.js';
import { rateLimitMiddleware } from './rate-limit.middleware.js';

function appWithLimit(limit: number) {
  const app = express();
  app.use(rateLimitMiddleware(createMemoryRateLimiter(), { limit, windowMs: 60_000 }));
  app.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('rateLimitMiddleware', () => {
  it('passes requests under the limit and reports the budget in headers', async () => {
    const res = await request(appWithLimit(2)).get('/ping');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('2');
    expect(res.headers['x-ratelimit-remaining']).toBe('1');
  });

  it('answers 429 with Retry-After and the error envelope once the limit is spent', async () => {
    const app = appWithLimit(2);
    await request(app).get('/ping');
    await request(app).get('/ping');
    const res = await request(app).get('/ping');

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(res.body).toMatchObject({ success: false, error: { code: 'RATE_LIMITED' } });
  });
});

import type { NextFunction, Request, Response } from 'express';
import { createErrorResponse } from '@music/shared';
import type { RateLimiter } from './rate-limiter.js';

export function rateLimitMiddleware(limiter: RateLimiter, opts: { limit: number; windowMs: number }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await limiter.hit(req.ip ?? 'unknown', opts.limit, opts.windowMs);

    res.setHeader('X-RateLimit-Limit', String(opts.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (result.allowed) return next();

    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
    res.status(429).json(
      createErrorResponse('RATE_LIMITED', `Too many requests; limit is ${opts.limit} per minute per IP`)
    );
  };
}

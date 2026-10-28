export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window after this one (0 when rejected). */
  remaining: number;
  /** When rejected, how long until the oldest counted request leaves the window. */
  retryAfterMs: number;
}

/**
 * Sliding-window rate limiter. `hit` records one request for `key` and says whether it fits within
 * `limit` requests per `windowMs`. A rejected request is not counted.
 */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  close(): Promise<void>;
}

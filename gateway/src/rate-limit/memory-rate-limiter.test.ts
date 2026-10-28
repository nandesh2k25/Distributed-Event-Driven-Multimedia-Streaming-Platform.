import { createMemoryRateLimiter } from './memory-rate-limiter.js';
import { rateLimiterContract } from './rate-limiter.contract.js';

rateLimiterContract('memory', () => createMemoryRateLimiter());

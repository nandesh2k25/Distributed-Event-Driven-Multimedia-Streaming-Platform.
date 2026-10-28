import { Redis } from 'ioredis';
import pino from 'pino';
import { config } from '../config.js';

const logger = pino({ name: 'catalog-redis' });

let redisClient: Redis | null = null;
let isRedisConnected = false;

try {
  redisClient = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        return null; // stop retrying after 3 attempts
      }
      return Math.min(times * 100, 1000);
    },
    lazyConnect: true
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
    logger.info('Connected to Redis cache');
  });

  redisClient.on('error', (err) => {
    isRedisConnected = false;
    logger.warn({ err: err.message }, 'Redis connection error - running in degraded non-cached mode');
  });

  redisClient.on('close', () => {
    isRedisConnected = false;
  });

  // Attempt initial connect
  redisClient.connect().catch((err) => {
    logger.warn({ err: err.message }, 'Failed initial Redis connection');
  });
} catch (err: any) {
  logger.warn({ err: err.message }, 'Redis initialization skipped');
}

export const redis = redisClient;

export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis || !isRedisConnected) return null;
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err: any) {
    logger.warn({ key, err: err.message }, 'Failed to read from Redis cache');
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds: number = config.cacheTtlSeconds): Promise<void> {
  if (!redis || !isRedisConnected) return;
  try {
    const serialized = JSON.stringify(value);
    await redis.set(key, serialized, 'EX', ttlSeconds);
  } catch (err: any) {
    logger.warn({ key, err: err.message }, 'Failed to set Redis cache');
  }
}

export async function delCache(...keys: string[]): Promise<void> {
  if (!redis || !isRedisConnected || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err: any) {
    logger.warn({ keys, err: err.message }, 'Failed to delete from Redis cache');
  }
}

export async function delCachePattern(pattern: string): Promise<void> {
  if (!redis || !isRedisConnected) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err: any) {
    logger.warn({ pattern, err: err.message }, 'Failed to clear cache pattern');
  }
}

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

export const healthRouter: Router = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  let dbStatus = 'down';
  let redisStatus = 'down';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'up';
  } catch (err) {
    dbStatus = 'error';
  }

  try {
    if (redis && redis.status === 'ready') {
      const ping = await redis.ping();
      redisStatus = ping === 'PONG' ? 'up' : 'error';
    }
  } catch (err) {
    redisStatus = 'error';
  }

  const isHealthy = dbStatus === 'up';
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    service: 'catalog-service',
    dependencies: {
      database: dbStatus,
      redis: redisStatus
    }
  });
});

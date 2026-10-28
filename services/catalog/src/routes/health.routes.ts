import { Router, Request, Response } from 'express';
import type { CatalogDeps } from '../services/deps.js';

export function createHealthRouter({ prisma, cache }: CatalogDeps): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    let dbStatus = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch {
      dbStatus = 'error';
    }

    const redisStatus = await cache.health();
    const isHealthy = dbStatus === 'up';

    return res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'catalog-service',
      dependencies: { database: dbStatus, redis: redisStatus }
    });
  });

  return router;
}

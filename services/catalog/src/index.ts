import pino from 'pino';
import { createApp } from './app.js';
import { createRedisCache } from './cache/redis-cache.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';

const logger = pino({ name: 'catalog-server' });
const cache = createRedisCache(config.redisUrl);
const app = createApp({ prisma, cache });

const server = app.listen(config.port, () => {
  logger.info(`Catalog Service listening on port ${config.port} [${config.nodeEnv}]`);
});

const gracefulShutdown = () => {
  logger.info('Shutting down Catalog Service gracefully...');
  server.close(async () => {
    await cache.close();
    await prisma.$disconnect();
    logger.info('Catalog Service HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

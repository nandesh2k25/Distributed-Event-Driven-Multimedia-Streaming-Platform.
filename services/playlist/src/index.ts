import pino from 'pino';
import { createHttpCatalogClient } from '@music/shared';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';

const logger = pino({ name: 'playlist-server' });
const app = createApp({ prisma, catalog: createHttpCatalogClient({ baseUrl: config.catalogUrl }) });

const server = app.listen(config.port, () => {
  logger.info(`Playlist Service listening on port ${config.port} [${config.nodeEnv}]`);
});

const gracefulShutdown = () => {
  logger.info('Shutting down Playlist Service gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

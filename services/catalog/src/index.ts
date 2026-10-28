import { createApp } from './app.js';
import { config } from './config.js';
import pino from 'pino';

const logger = pino({ name: 'catalog-server' });
const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`Catalog Service listening on port ${config.port} [${config.nodeEnv}]`);
});

const gracefulShutdown = () => {
  logger.info('Shutting down Catalog Service gracefully...');
  server.close(() => {
    logger.info('Catalog Service HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

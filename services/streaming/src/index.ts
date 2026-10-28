import pino from 'pino';
import { createApp } from './app.js';
import { config } from './config.js';
import { createS3Storage } from './storage.js';
import { createCatalogResolver } from './track-resolver.js';

const logger = pino({ name: 'streaming-server' });
const app = createApp({
  storage: createS3Storage(config.minio),
  resolver: createCatalogResolver(config.catalogUrl, config.trackCacheTtlMs)
});

const server = app.listen(config.port, () => {
  logger.info(`Streaming Service listening on port ${config.port} [${config.nodeEnv}]`);
});

const gracefulShutdown = () => {
  logger.info('Shutting down Streaming Service gracefully...');
  server.close(() => process.exit(0));
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

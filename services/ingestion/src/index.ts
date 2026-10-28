import pino from 'pino';
import { createApp } from './app.js';
import { createHttpCatalogClient } from './catalog-client.js';
import { config } from './config.js';
import { createRabbitPublisher } from './publisher.js';
import { createS3RawStore } from './storage.js';

const logger = pino({ name: 'ingestion-server' });
const publisher = createRabbitPublisher(config.rabbitmqUrl);

const app = createApp({
  store: createS3RawStore(config.minio),
  catalog: createHttpCatalogClient(config.catalogUrl),
  publisher,
  maxUploadBytes: config.maxUploadBytes
});

const server = app.listen(config.port, () => {
  logger.info(`Ingestion Service listening on port ${config.port} [${config.nodeEnv}]`);
});

const gracefulShutdown = () => {
  logger.info('Shutting down Ingestion Service gracefully...');
  server.close(async () => {
    await publisher.close();
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

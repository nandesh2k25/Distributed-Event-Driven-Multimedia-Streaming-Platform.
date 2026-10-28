import amqp from 'amqplib';
import pino from 'pino';
import { QUEUES, assertAudioTopology, createHttpCatalogClient } from '@music/shared';
import { createS3WorkerStorage } from './adapters.js';
import { config } from './config.js';
import { createMediaTools } from './ffmpeg.js';
import { startConsumer } from './consumer.js';

const logger = pino({ name: 'transcode-worker' });

async function main() {
  const deps = {
    storage: createS3WorkerStorage(config.minio),
    media: createMediaTools(config.ffmpegPath, config.ffprobePath),
    catalog: createHttpCatalogClient({ baseUrl: config.catalogUrl })
  };

  const connection = await amqp.connect(config.rabbitmqUrl);
  const channel = await connection.createChannel();
  await assertAudioTopology(channel);
  await startConsumer(channel, deps, logger);

  logger.info(`Worker consuming ${QUEUES.AUDIO_TRANSCODE}`);

  // Exit so the container orchestrator restarts us with a fresh connection.
  connection.on('close', () => {
    logger.error('RabbitMQ connection closed');
    process.exit(1);
  });
  connection.on('error', (err) => logger.error({ err }, 'RabbitMQ connection error'));

  const shutdown = async () => {
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});

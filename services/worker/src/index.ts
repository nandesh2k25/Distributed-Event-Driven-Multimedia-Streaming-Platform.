import amqp from 'amqplib';
import pino from 'pino';
import { QUEUES, assertAudioTopology } from '@music/shared';
import { createHttpCatalogUpdater, createS3WorkerStorage } from './adapters.js';
import { config } from './config.js';
import { createMediaTools } from './ffmpeg.js';
import { handleDelivery } from './process-job.js';

const logger = pino({ name: 'transcode-worker' });

async function main() {
  const deps = {
    storage: createS3WorkerStorage(config.minio),
    media: createMediaTools(config.ffmpegPath, config.ffprobePath),
    catalog: createHttpCatalogUpdater(config.catalogUrl)
  };

  const connection = await amqp.connect(config.rabbitmqUrl);
  const channel = await connection.createChannel();
  await assertAudioTopology(channel);
  await channel.prefetch(1); // one CPU-heavy job at a time per worker

  await channel.consume(
    QUEUES.AUDIO_TRANSCODE,
    async (msg) => {
      if (!msg) return;
      const disposition = await handleDelivery(msg.content, deps, logger);
      if (disposition === 'ack') channel.ack(msg);
      else channel.nack(msg, false, false); // requeue=false -> dead-letter exchange -> DLQ
    },
    { noAck: false }
  );

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

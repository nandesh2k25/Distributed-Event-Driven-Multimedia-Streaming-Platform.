import amqp from 'amqplib';
import type { ConfirmChannel } from 'amqplib';
import { AUDIO_EVENTS_EXCHANGE, ROUTING_KEYS, assertAudioTopology } from '@music/shared';
import type { JobPublisher } from './ports.js';

/** Publishes transcode jobs on a confirm channel, (re)connecting lazily. */
export function createRabbitPublisher(url: string): JobPublisher & { close(): Promise<void> } {
  let channelPromise: Promise<ConfirmChannel> | null = null;
  let connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;

  async function connect(): Promise<ConfirmChannel> {
    const conn = await amqp.connect(url);
    connection = conn;
    const reset = () => {
      channelPromise = null;
    };
    conn.on('close', reset);
    conn.on('error', reset);
    const ch = await conn.createConfirmChannel();
    await assertAudioTopology(ch);
    return ch;
  }

  return {
    async publish(job) {
      channelPromise ??= connect().catch((err) => {
        channelPromise = null;
        throw err;
      });
      const ch = await channelPromise;
      await new Promise<void>((resolve, reject) => {
        ch.publish(
          AUDIO_EVENTS_EXCHANGE,
          ROUTING_KEYS.TRANSCODE_REQUEST,
          Buffer.from(JSON.stringify(job)),
          { persistent: true, contentType: 'application/json', correlationId: job.correlationId },
          (err) => (err ? reject(err) : resolve())
        );
      });
    },
    async close() {
      await connection?.close().catch(() => undefined);
    }
  };
}

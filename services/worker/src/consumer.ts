import { QUEUES } from '@music/shared';
import { handleDelivery, type WorkerDeps } from './process-job.js';

/** The slice of an amqplib channel the consumer uses, so tests can drive it without a broker. */
export interface ConsumerChannel {
  prefetch(count: number): Promise<unknown>;
  consume(
    queue: string,
    onMessage: (msg: { content: Buffer } | null) => void | Promise<void>,
    options: { noAck: boolean }
  ): Promise<unknown>;
  ack(msg: { content: Buffer }): void;
  nack(msg: { content: Buffer }, allUpTo: boolean, requeue: boolean): void;
}

type Log = { info(o: object, m: string): void; error(o: object, m: string): void };

/**
 * Subscribes to the transcode queue with manual acknowledgement. A finished job is acked; a
 * failed one is nacked without requeue so the broker dead-letters it instead of retrying forever.
 */
export async function startConsumer(channel: ConsumerChannel, deps: WorkerDeps, log: Log): Promise<void> {
  await channel.prefetch(1); // one CPU-heavy job at a time per worker

  await channel.consume(
    QUEUES.AUDIO_TRANSCODE,
    async (msg) => {
      if (!msg) return; // the broker cancelled the consumer
      const disposition = await handleDelivery(msg.content, deps, log);
      if (disposition === 'ack') channel.ack(msg);
      else channel.nack(msg, false, false);
    },
    { noAck: false }
  );
}

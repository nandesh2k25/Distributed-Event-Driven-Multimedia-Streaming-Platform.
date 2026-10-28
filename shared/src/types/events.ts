import { BitrateVariant } from './domain.js';

export const AUDIO_EVENTS_EXCHANGE = 'audio.events';
export const AUDIO_DEAD_LETTER_EXCHANGE = 'audio.events.dlx';

export const QUEUES = {
  AUDIO_TRANSCODE: 'audio.transcode.queue',
  AUDIO_TRANSCODE_DLQ: 'audio.transcode.dlq'
} as const;

export const ROUTING_KEYS = {
  TRANSCODE_REQUEST: 'audio.transcode.request',
  TRANSCODE_COMPLETED: 'audio.transcode.completed',
  TRANSCODE_FAILED: 'audio.transcode.failed'
} as const;

export interface AudioTranscodeJob {
  trackId: string;
  rawFileKey: string;
  originalFormat: string;
  targetBitrates: number[];
  correlationId: string;
  timestamp: string;
}

export interface AudioTranscodeResult {
  trackId: string;
  status: 'READY' | 'FAILED';
  duration?: number;
  waveformPeaks?: number[]; // 128 normalized amplitude peak floats
  variants?: BitrateVariant[];
  error?: string;
  correlationId: string;
  timestamp: string;
}

/** Minimal subset of an amqplib channel, so shared stays free of an amqplib dependency. */
export interface AmqpTopologyChannel {
  assertExchange(name: string, type: string, options?: Record<string, unknown>): Promise<unknown>;
  assertQueue(name: string, options?: Record<string, unknown>): Promise<unknown>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
}

/**
 * Declares the audio pipeline topology (idempotent): the audio.events exchange, the transcode
 * queue, and a dead-letter exchange + queue that receives rejected (nack, requeue=false) jobs.
 */
export async function assertAudioTopology(ch: AmqpTopologyChannel): Promise<void> {
  await ch.assertExchange(AUDIO_DEAD_LETTER_EXCHANGE, 'direct', { durable: true });
  await ch.assertQueue(QUEUES.AUDIO_TRANSCODE_DLQ, { durable: true });
  await ch.bindQueue(QUEUES.AUDIO_TRANSCODE_DLQ, AUDIO_DEAD_LETTER_EXCHANGE, QUEUES.AUDIO_TRANSCODE_DLQ);

  await ch.assertExchange(AUDIO_EVENTS_EXCHANGE, 'direct', { durable: true });
  await ch.assertQueue(QUEUES.AUDIO_TRANSCODE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': AUDIO_DEAD_LETTER_EXCHANGE,
      'x-dead-letter-routing-key': QUEUES.AUDIO_TRANSCODE_DLQ
    }
  });
  await ch.bindQueue(QUEUES.AUDIO_TRANSCODE, AUDIO_EVENTS_EXCHANGE, ROUTING_KEYS.TRANSCODE_REQUEST);
}

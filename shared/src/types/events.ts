import { BitrateVariant } from './domain.js';

export const MEDIA_EXCHANGE = 'media.exchange';

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

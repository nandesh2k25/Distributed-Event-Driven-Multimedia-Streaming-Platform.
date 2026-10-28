import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AudioTranscodeJob, BitrateVariant } from '@music/shared';
import type { MediaTools } from './ffmpeg.js';

export interface WorkerStorage {
  download(key: string, destPath: string): Promise<void>;
  upload(key: string, filePath: string, contentType: string, size: number): Promise<void>;
}

export interface ReadyPayload {
  status: 'READY';
  duration: number;
  waveformPeaks: number[];
  storageKey: string;
  bitrate: number;
  format: string;
  variants: BitrateVariant[];
}

export interface CatalogUpdater {
  markReady(trackId: string, payload: ReadyPayload, correlationId: string): Promise<void>;
  markFailed(trackId: string, correlationId: string): Promise<void>;
}

export interface WorkerDeps {
  storage: WorkerStorage;
  media: MediaTools;
  catalog: CatalogUpdater;
}

const TARGET_BITRATE = 320;

/** Runs one transcode job end to end. Throws on any failure so the caller can reject (-> DLQ). */
export async function processJob(job: AudioTranscodeJob, { storage, media, catalog }: WorkerDeps): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `transcode-${job.trackId}-`));
  try {
    const input = join(dir, `input.${job.originalFormat}`);
    const output = join(dir, 'output.mp3');

    await storage.download(job.rawFileKey, input);
    await media.transcodeToMp3(input, output);

    const duration = await media.probeDuration(output);
    const waveformPeaks = await media.computePeaks(output);

    const storageKey = `processed/${job.trackId}.mp3`;
    const { size } = await stat(output);
    await storage.upload(storageKey, output, 'audio/mpeg', size);

    await catalog.markReady(
      job.trackId,
      {
        status: 'READY',
        duration,
        waveformPeaks,
        storageKey,
        bitrate: TARGET_BITRATE,
        format: 'mp3',
        variants: [{ bitrate: TARGET_BITRATE, codec: 'mp3', s3Key: storageKey, fileSize: size }]
      },
      job.correlationId
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type Disposition = 'ack' | 'reject';

/**
 * Handles one raw queue message. `ack` = done; `reject` = nack without requeue so the broker
 * dead-letters it. Malformed payloads are rejected too, since retrying can never fix them.
 */
export async function handleDelivery(
  content: Buffer,
  deps: WorkerDeps,
  log: { info(o: object, m: string): void; error(o: object, m: string): void }
): Promise<Disposition> {
  let job: AudioTranscodeJob;
  try {
    job = JSON.parse(content.toString()) as AudioTranscodeJob;
    if (!job.trackId || !job.rawFileKey || !job.originalFormat) throw new Error('missing required job fields');
  } catch (err) {
    log.error({ err }, 'Rejecting malformed transcode job');
    return 'reject';
  }

  try {
    await processJob(job, deps);
    log.info({ trackId: job.trackId, correlationId: job.correlationId }, 'Transcode complete');
    return 'ack';
  } catch (err) {
    log.error({ err, trackId: job.trackId, correlationId: job.correlationId }, 'Transcode failed; dead-lettering');
    await deps.catalog.markFailed(job.trackId, job.correlationId).catch(() => undefined);
    return 'reject';
  }
}

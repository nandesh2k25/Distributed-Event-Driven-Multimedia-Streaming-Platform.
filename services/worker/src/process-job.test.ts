import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { CatalogUnavailableError, type AudioTranscodeJob } from '@music/shared';
import { createInMemoryCatalog, type InMemoryCatalog } from '@music/shared/testing';
import { handleDelivery, type WorkerDeps } from './process-job.js';

const log = { info: vi.fn(), error: vi.fn() };
const peaks = Array.from({ length: 128 }, (_, i) => i / 127);

let catalog: InMemoryCatalog;
let trackId: string;
let content: Buffer;

beforeEach(async () => {
  catalog = createInMemoryCatalog();
  ({ trackId } = await catalog.registerUpload({
    title: 'Song',
    artistName: 'Band',
    genre: 'Rock',
    originalFormat: 'flac',
    rawStorageKey: 'raw/x.flac'
  }));
  const job: AudioTranscodeJob = {
    trackId,
    rawFileKey: 'raw/x.flac',
    originalFormat: 'flac',
    targetBitrates: [320],
    correlationId: 'cid-1',
    timestamp: new Date().toISOString()
  };
  content = Buffer.from(JSON.stringify(job));
});

const statusOf = async () => (await catalog.getTrack(trackId))?.status;

function makeDeps(overrides: Partial<{ transcodeError: Error; catalog: WorkerDeps['catalog'] }> = {}) {
  let workDir = '';
  const deps = {
    storage: {
      download: vi.fn(async (_key: string, dest: string) => {
        workDir = dest.replace(/[\\/][^\\/]+$/, '');
        await writeFile(dest, 'raw');
      }),
      upload: vi.fn(async () => undefined)
    },
    media: {
      transcodeToMp3: vi.fn(async (_i: string, out: string) => {
        if (overrides.transcodeError) throw overrides.transcodeError;
        await writeFile(out, Buffer.alloc(2048));
      }),
      probeDuration: vi.fn(async () => 187.5),
      computePeaks: vi.fn(async () => peaks)
    },
    catalog: overrides.catalog ?? catalog
  } satisfies WorkerDeps;
  return { deps, getWorkDir: () => workDir };
}

describe('handleDelivery', () => {
  it('transcodes, uploads to processed storage, marks the track READY with duration + peaks, then acks', async () => {
    const { deps, getWorkDir } = makeDeps();
    const result = await handleDelivery(content, deps, log);

    expect(result).toBe('ack');
    expect(deps.storage.download).toHaveBeenCalledWith('raw/x.flac', expect.stringContaining('input.flac'));
    expect(deps.storage.upload).toHaveBeenCalledWith(`processed/${trackId}.mp3`, expect.any(String), 'audio/mpeg', 2048);
    expect(await catalog.getTrack(trackId)).toMatchObject({
      status: 'READY',
      duration: 187.5,
      waveformPeaks: peaks,
      storageKey: `processed/${trackId}.mp3`,
      bitrate: 320,
      variants: [{ bitrate: 320, codec: 'mp3', s3Key: `processed/${trackId}.mp3`, fileSize: 2048 }]
    });
    expect(existsSync(getWorkDir())).toBe(false); // temp files cleaned up
  });

  it('rejects (-> DLQ) and marks the track FAILED when ffmpeg fails', async () => {
    const { deps, getWorkDir } = makeDeps({ transcodeError: new Error('ffmpeg exited with code 1') });
    const result = await handleDelivery(content, deps, log);

    expect(result).toBe('reject');
    expect(deps.storage.upload).not.toHaveBeenCalled();
    expect(await statusOf()).toBe('FAILED');
    expect(existsSync(getWorkDir())).toBe(false);
  });

  it('rejects when the catalog cannot be updated, even if marking FAILED also fails', async () => {
    const down = async () => {
      throw new CatalogUnavailableError('catalog down');
    };
    const { deps } = makeDeps({ catalog: { markTrackReady: down, markTrackFailed: down } });

    expect(await handleDelivery(content, deps, log)).toBe('reject');
    expect(await statusOf()).toBe('PROCESSING'); // nothing could be recorded
  });

  it('rejects malformed messages without touching storage', async () => {
    const { deps } = makeDeps();
    expect(await handleDelivery(Buffer.from('not json'), deps, log)).toBe('reject');
    expect(await handleDelivery(Buffer.from('{"trackId":"t1"}'), deps, log)).toBe('reject');
    expect(deps.storage.download).not.toHaveBeenCalled();
  });
});

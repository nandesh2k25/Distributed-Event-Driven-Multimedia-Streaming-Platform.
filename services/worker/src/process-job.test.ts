import { describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { AudioTranscodeJob } from '@music/shared';
import { handleDelivery, type WorkerDeps } from './process-job.js';

const job: AudioTranscodeJob = {
  trackId: 't1',
  rawFileKey: 'raw/x.flac',
  originalFormat: 'flac',
  targetBitrates: [320],
  correlationId: 'cid-1',
  timestamp: new Date().toISOString()
};
const content = Buffer.from(JSON.stringify(job));
const log = { info: vi.fn(), error: vi.fn() };
const peaks = Array.from({ length: 128 }, (_, i) => i / 127);

function makeDeps(overrides: Partial<{ transcodeError: Error; markReadyError: Error }> = {}) {
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
    catalog: {
      markReady: vi.fn(async () => {
        if (overrides.markReadyError) throw overrides.markReadyError;
      }),
      markFailed: vi.fn(async () => undefined)
    }
  } satisfies WorkerDeps;
  return { deps, getWorkDir: () => workDir };
}

describe('handleDelivery', () => {
  it('transcodes, uploads to processed storage, marks READY with duration + peaks, then acks', async () => {
    const { deps, getWorkDir } = makeDeps();
    const result = await handleDelivery(content, deps, log);

    expect(result).toBe('ack');
    expect(deps.storage.download).toHaveBeenCalledWith('raw/x.flac', expect.stringContaining('input.flac'));
    expect(deps.storage.upload).toHaveBeenCalledWith('processed/t1.mp3', expect.any(String), 'audio/mpeg', 2048);
    expect(deps.catalog.markReady).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        status: 'READY',
        duration: 187.5,
        waveformPeaks: peaks,
        storageKey: 'processed/t1.mp3',
        bitrate: 320,
        variants: [{ bitrate: 320, codec: 'mp3', s3Key: 'processed/t1.mp3', fileSize: 2048 }]
      }),
      'cid-1'
    );
    expect(deps.catalog.markFailed).not.toHaveBeenCalled();
    expect(existsSync(getWorkDir())).toBe(false); // temp files cleaned up
  });

  it('rejects (-> DLQ) and marks the track FAILED when ffmpeg fails', async () => {
    const { deps, getWorkDir } = makeDeps({ transcodeError: new Error('ffmpeg exited with code 1') });
    const result = await handleDelivery(content, deps, log);

    expect(result).toBe('reject');
    expect(deps.storage.upload).not.toHaveBeenCalled();
    expect(deps.catalog.markReady).not.toHaveBeenCalled();
    expect(deps.catalog.markFailed).toHaveBeenCalledWith('t1', 'cid-1');
    expect(existsSync(getWorkDir())).toBe(false);
  });

  it('rejects when the catalog update fails, even if marking FAILED also fails', async () => {
    const { deps } = makeDeps({ markReadyError: new Error('catalog down') });
    deps.catalog.markFailed.mockRejectedValueOnce(new Error('still down'));
    expect(await handleDelivery(content, deps, log)).toBe('reject');
  });

  it('rejects malformed messages without touching storage', async () => {
    const { deps } = makeDeps();
    expect(await handleDelivery(Buffer.from('not json'), deps, log)).toBe('reject');
    expect(await handleDelivery(Buffer.from('{"trackId":"t1"}'), deps, log)).toBe('reject');
    expect(deps.storage.download).not.toHaveBeenCalled();
  });
});

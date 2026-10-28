import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { CatalogUnavailableError, type CatalogClient } from '@music/shared';
import { createInMemoryCatalog } from '@music/shared/testing';
import { createApp } from './app.js';
import type { JobPublisher, RawAudioStore } from './ports.js';

function setup(overrides: { putError?: Error; maxUploadBytes?: number; catalog?: Partial<CatalogClient> } = {}) {
  const stored: { key: string; bytes: number; contentType: string }[] = [];
  const store: RawAudioStore = {
    async put(key, body, contentType) {
      let bytes = 0;
      for await (const chunk of body) bytes += (chunk as Buffer).length;
      if (overrides.putError) throw overrides.putError;
      stored.push({ key, bytes, contentType });
    }
  };
  const inMemory = createInMemoryCatalog();
  const catalog: CatalogClient = { ...inMemory, ...overrides.catalog };
  const publisher: JobPublisher = { publish: vi.fn(async () => undefined) };
  const app = createApp({ store, catalog, publisher, maxUploadBytes: overrides.maxUploadBytes ?? 1024 * 1024 });
  return { app, stored, catalog: inMemory, publisher };
}

const audio = Buffer.alloc(4096, 1);
const upload = (app: ReturnType<typeof setup>['app']) =>
  request(app)
    .post('/api/ingest/upload')
    .field('title', 'Song')
    .field('artistName', 'Artist')
    .field('genre', 'Rock');

describe('ingestion service', () => {
  it('accepts a valid upload: 202, stores raw file, registers a PROCESSING track, publishes job', async () => {
    const { app, stored, catalog, publisher } = setup();
    const res = await upload(app).field('albumTitle', 'Album').attach('file', audio, { filename: 'a.flac', contentType: 'audio/flac' });

    expect(res.status).toBe(202);
    const { trackId } = res.body.data;
    expect(res.body).toEqual({ success: true, data: { trackId, status: 'PROCESSING' } });

    expect(stored).toHaveLength(1);
    expect(stored[0]!.key).toMatch(/^raw\/.+\.flac$/);
    expect(stored[0]!.bytes).toBe(audio.length);

    expect(catalog.tracks()).toHaveLength(1);
    expect(catalog.tracks()[0]).toMatchObject({
      id: trackId,
      title: 'Song',
      status: 'PROCESSING',
      rawStorageKey: stored[0]!.key,
      originalFormat: 'flac',
      artist: { name: 'Artist' },
      album: { title: 'Album' },
      genre: { name: 'Rock' }
    });
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ trackId, rawFileKey: stored[0]!.key, originalFormat: 'flac', targetBitrates: [320] })
    );
  });

  it('rejects non-audio files with 400 INVALID_FILE_TYPE and registers nothing', async () => {
    const { app, catalog, publisher } = setup();
    const res = await upload(app).attach('file', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(catalog.tracks()).toEqual([]);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('accepts application/octet-stream only when the extension is an audio type', async () => {
    const { app } = setup();
    const ok = await upload(app).attach('file', audio, { filename: 'a.flac', contentType: 'application/octet-stream' });
    expect(ok.status).toBe(202);
    const bad = await upload(app).attach('file', audio, { filename: 'a.exe', contentType: 'application/octet-stream' });
    expect(bad.status).toBe(400);
  });

  it('rejects missing metadata with field-level details', async () => {
    const { app, catalog } = setup();
    const res = await request(app).post('/api/ingest/upload').field('title', 'Song').attach('file', audio, { filename: 'a.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(expect.arrayContaining(['artistName', 'genre']));
    expect(catalog.tracks()).toEqual([]);
  });

  it('requires a file and multipart content', async () => {
    const { app } = setup();
    expect((await upload(app)).body.error.code).toBe('FILE_REQUIRED');
    const json = await request(app).post('/api/ingest/upload').send({ title: 'x' });
    expect(json.status).toBe(400);
    expect(json.body.error.code).toBe('INVALID_CONTENT_TYPE');
  });

  it('marks the track FAILED when the raw upload fails', async () => {
    const { app, catalog, publisher } = setup({ putError: new Error('minio down') });
    const res = await upload(app).attach('file', audio, { filename: 'a.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(500);
    expect(catalog.tracks().map((t) => t.status)).toEqual(['FAILED']);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('rejects files over the size limit with 413 and marks the track FAILED', async () => {
    const { app, catalog, publisher } = setup({ maxUploadBytes: 1000 });
    const res = await upload(app).attach('file', audio, { filename: 'a.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(413);
    expect(catalog.tracks().map((t) => t.status)).toEqual(['FAILED']);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('answers 502 CATALOG_UNAVAILABLE, without storing the file, when the catalog cannot be reached', async () => {
    const { app, stored, publisher } = setup({
      catalog: {
        registerUpload: async () => {
          throw new CatalogUnavailableError('connection refused');
        }
      }
    });
    const res = await upload(app).attach('file', audio, { filename: 'a.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('CATALOG_UNAVAILABLE');
    expect(stored).toEqual([]);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});

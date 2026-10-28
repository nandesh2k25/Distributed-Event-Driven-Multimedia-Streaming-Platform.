import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import type { CatalogClient, JobPublisher, RawAudioStore } from './ports.js';

function setup(overrides: { putError?: Error; maxUploadBytes?: number } = {}) {
  const stored: { key: string; bytes: number; contentType: string }[] = [];
  const store: RawAudioStore = {
    async put(key, body, contentType) {
      let bytes = 0;
      for await (const chunk of body) bytes += (chunk as Buffer).length;
      if (overrides.putError) throw overrides.putError;
      stored.push({ key, bytes, contentType });
    }
  };
  const catalog: CatalogClient = {
    resolveArtist: vi.fn(async () => ({ id: 'artist-1' })),
    resolveGenre: vi.fn(async () => ({ id: 'genre-1' })),
    resolveAlbum: vi.fn(async () => ({ id: 'album-1' })),
    createPlaceholder: vi.fn(async () => ({ id: 'track-1' })),
    markFailed: vi.fn(async () => undefined)
  };
  const publisher: JobPublisher = { publish: vi.fn(async () => undefined) };
  const app = createApp({ store, catalog, publisher, maxUploadBytes: overrides.maxUploadBytes ?? 1024 * 1024 });
  return { app, stored, catalog, publisher };
}

const audio = Buffer.alloc(4096, 1);
const upload = (app: ReturnType<typeof setup>['app']) =>
  request(app)
    .post('/api/ingest/upload')
    .field('title', 'Song')
    .field('artistName', 'Artist')
    .field('genre', 'Rock');

describe('ingestion service', () => {
  it('accepts a valid upload: 202, stores raw file, creates PROCESSING placeholder, publishes job', async () => {
    const { app, stored, catalog, publisher } = setup();
    const res = await upload(app).field('albumTitle', 'Album').attach('file', audio, { filename: 'a.flac', contentType: 'audio/flac' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, data: { trackId: 'track-1', status: 'PROCESSING' } });

    expect(stored).toHaveLength(1);
    expect(stored[0]!.key).toMatch(/^raw\/.+\.flac$/);
    expect(stored[0]!.bytes).toBe(audio.length);

    expect(catalog.createPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Song', artistId: 'artist-1', albumId: 'album-1', genreId: 'genre-1', rawStorageKey: stored[0]!.key }),
      expect.any(String)
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 'track-1', rawFileKey: stored[0]!.key, originalFormat: 'flac', targetBitrates: [320] })
    );
  });

  it('rejects non-audio files with 400 INVALID_FILE_TYPE and creates nothing', async () => {
    const { app, catalog, publisher } = setup();
    const res = await upload(app).attach('file', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(catalog.createPlaceholder).not.toHaveBeenCalled();
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
    const { app } = setup();
    const res = await request(app).post('/api/ingest/upload').field('title', 'Song').attach('file', audio, { filename: 'a.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(expect.arrayContaining(['artistName', 'genre']));
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
    expect(catalog.markFailed).toHaveBeenCalledWith('track-1', expect.any(String));
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('rejects files over the size limit with 413 and marks the track FAILED', async () => {
    const { app, catalog, publisher } = setup({ maxUploadBytes: 1000 });
    const res = await upload(app).attach('file', audio, { filename: 'a.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(413);
    expect(catalog.markFailed).toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});

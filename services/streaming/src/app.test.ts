import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Readable } from 'node:stream';
import { CatalogUnavailableError } from '@music/shared';
import { createApp } from './app.js';
import type { ObjectStorage } from './storage.js';
import type { TrackResolver } from './track-resolver.js';

const AUDIO = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

function setup() {
  const getRange = vi.fn(async (_key: string, start: number, end: number) =>
    Readable.from([AUDIO.subarray(start, end + 1)])
  );
  const storage: ObjectStorage = {
    head: async (key) => (key === 'processed/a.mp3' ? { size: AUDIO.length, contentType: 'audio/mpeg' } : null),
    getRange
  };
  const resolver: TrackResolver = {
    resolve: async (id) =>
      id === 'ready'
        ? { storageKey: 'processed/a.mp3', isFree: true }
        : id === 'premium'
          ? { storageKey: 'processed/a.mp3', isFree: false }
          : id === 'orphan'
            ? { storageKey: 'processed/missing.mp3', isFree: true }
            : null
  };
  return { app: createApp({ storage, resolver }), getRange };
}

const get = (app: ReturnType<typeof setup>['app'], id = 'ready') =>
  request(app).get(`/api/stream/${id}`).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe('streaming service', () => {
  it('serves an explicit range as 206 with exact headers and bytes', async () => {
    const { app, getRange } = setup();
    const res = await get(app).set('Range', 'bytes=100-199');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 100-199/1000');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe('100');
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['cache-control']).toBe('public, max-age=86400, immutable');
    expect(res.body.equals(AUDIO.subarray(100, 200))).toBe(true);
    // only the requested slice was requested from storage
    expect(getRange).toHaveBeenCalledWith('processed/a.mp3', 100, 199);
  });

  it('handles open-ended and suffix ranges (seek-to-offset)', async () => {
    const { app } = setup();
    const open = await get(app).set('Range', 'bytes=900-');
    expect(open.status).toBe(206);
    expect(open.headers['content-range']).toBe('bytes 900-999/1000');

    const suffix = await get(app).set('Range', 'bytes=-50');
    expect(suffix.headers['content-range']).toBe('bytes 950-999/1000');
    expect(suffix.body.length).toBe(50);
  });

  it('returns the whole file as 200 when no Range is sent', async () => {
    const { app } = setup();
    const res = await get(app);
    expect(res.status).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe('1000');
    expect(res.body.equals(AUDIO)).toBe(true);
  });

  it('returns 416 with Content-Range */size for an unsatisfiable range', async () => {
    const { app, getRange } = setup();
    const res = await request(app).get('/api/stream/ready').set('Range', 'bytes=5000-6000');
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */1000');
    expect(res.body.success).toBe(false);
    expect(getRange).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown tracks and for assets missing from storage', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/stream/nope')).status).toBe(404);
    const orphan = await request(app).get('/api/stream/orphan');
    expect(orphan.status).toBe(404);
    expect(orphan.body.error.code).toBe('AUDIO_NOT_FOUND');
  });

  it('keeps premium tracks from guests but streams them to signed-in users', async () => {
    const { app, getRange } = setup();

    const guest = await request(app).get('/api/stream/premium');
    expect(guest.status).toBe(401);
    expect(guest.body.error.code).toBe('LOGIN_REQUIRED');
    expect(getRange).not.toHaveBeenCalled();

    const member = await request(app).get('/api/stream/premium').set('X-User-Id', 'user-1');
    expect(member.status).toBe(200);
  });

  it('streams free tracks to guests', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/stream/ready')).status).toBe(200);
  });

  it('answers 502 CATALOG_UNAVAILABLE when the catalog cannot be reached', async () => {
    const storage: ObjectStorage = { head: async () => null, getRange: vi.fn() };
    const resolver: TrackResolver = {
      resolve: async () => {
        throw new CatalogUnavailableError('connection refused');
      }
    };
    const res = await request(createApp({ storage, resolver })).get('/api/stream/any');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('CATALOG_UNAVAILABLE');
  });

  it('answers HEAD without reading the object body', async () => {
    const { app, getRange } = setup();
    const res = await request(app).head('/api/stream/ready').set('Range', 'bytes=0-9');
    expect(res.status).toBe(206);
    expect(res.headers['content-length']).toBe('10');
    expect(getRange).not.toHaveBeenCalled();
  });
});

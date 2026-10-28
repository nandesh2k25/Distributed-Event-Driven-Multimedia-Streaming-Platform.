import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { createMemoryCache } from './cache/memory-cache.js';
import { Express } from 'express';

describe('Catalog Service Integration Tests', () => {
  let app: Express;
  const cache = createMemoryCache();

  beforeAll(() => {
    app = createApp({ prisma, cache });
  });

  it('GET /health returns healthy status and dependencies', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.dependencies.database).toBe('up');
  });

  it('GET /tracks returns paginated tracks with standardized envelope', async () => {
    const res = await request(app).get('/tracks');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(12);

    // Verify first track fields
    const track = res.body.data[0];
    expect(track.id).toBeDefined();
    expect(track.title).toBeDefined();
    expect(track.duration).toBeGreaterThan(0);
    expect(track.status).toBe('READY');
    expect(track.artist).toBeDefined();
    expect(track.genre).toBeDefined();
  });

  it('GET /tracks with genre filter returns filtered tracks', async () => {
    const res = await request(app).get('/tracks?genre=synthwave');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const track of res.body.data) {
      expect(track.genre.toLowerCase()).toBe('synthwave');
    }
  });

  it('GET /tracks/:id returns track with 128 normalized waveform peaks', async () => {
    // First get a track ID
    const listRes = await request(app).get('/tracks?limit=1');
    const trackId = listRes.body.data[0].id;

    const res = await request(app).get(`/tracks/${trackId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(trackId);
    expect(Array.isArray(res.body.data.waveformPeaks)).toBe(true);
    expect(res.body.data.waveformPeaks.length).toBe(128);

    // Verify amplitude peaks are normalized between 0.0 and 1.0
    for (const peak of res.body.data.waveformPeaks) {
      expect(typeof peak).toBe('number');
      expect(peak).toBeGreaterThanOrEqual(0);
      expect(peak).toBeLessThanOrEqual(1.0);
    }
  });

  it('GET /tracks/:id with nonexistent ID returns 404', async () => {
    const res = await request(app).get('/tracks/nonexistent-track-id');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TRACK_NOT_FOUND');
  });

  it('GET /artists returns artists with track counts', async () => {
    const res = await request(app).get('/artists');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);

    const artist = res.body.data[0];
    expect(artist.name).toBeDefined();
    expect(artist._count.tracks).toBeGreaterThanOrEqual(1);
  });

  it('GET /artists/:id returns artist details and their tracks', async () => {
    const listRes = await request(app).get('/artists');
    const artistId = listRes.body.data[0].id;

    const res = await request(app).get(`/artists/${artistId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(artistId);
    expect(Array.isArray(res.body.data.tracks)).toBe(true);
  });

  it('GET /albums returns albums with artist details', async () => {
    const res = await request(app).get('/albums');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(5);

    const album = res.body.data[0];
    expect(album.title).toBeDefined();
    expect(album.artist).toBeDefined();
  });

  it('GET /albums/:id returns album with ordered tracks', async () => {
    const listRes = await request(app).get('/albums');
    const albumId = listRes.body.data[0].id;

    const res = await request(app).get(`/albums/${albumId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(albumId);
    expect(Array.isArray(res.body.data.tracks)).toBe(true);
  });

  it('GET /genres returns all genre categories', async () => {
    const res = await request(app).get('/genres');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(6);
  });

  it('GET /search with query returns multi-entity search results', async () => {
    const res = await request(app).get('/search?q=Mirage');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.query).toBe('Mirage');
    expect(Array.isArray(res.body.data.artists)).toBe(true);
    expect(res.body.data.artists.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.artists[0].name).toBe('Neon Mirage');

    // Also check tracks
    expect(Array.isArray(res.body.data.tracks)).toBe(true);
    expect(res.body.data.tracks.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /search with empty query returns empty results', async () => {
    const res = await request(app).get('/search?q=');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tracks).toEqual([]);
    expect(res.body.data.artists).toEqual([]);
    expect(res.body.data.albums).toEqual([]);
  });

  it('Gateway route aliases (/api/catalog/tracks and /catalog/tracks) work identical', async () => {
    const res1 = await request(app).get('/api/catalog/tracks?limit=2');
    const res2 = await request(app).get('/catalog/tracks?limit=2');
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.data.length).toBe(res2.body.data.length);
  });

  describe('cache invalidation', () => {
    it('shows updated artist, album and genre counts right after a track is added or changed', async () => {
      const artistId = (await request(app).get('/artists')).body.data[0].id as string;
      const countFor = async () => {
        const list = (await request(app).get('/artists')).body.data as { id: string; _count: { tracks: number } }[];
        return list.find((a) => a.id === artistId)!._count.tracks;
      };
      const before = await countFor(); // warms the cache

      const created = await request(app).post('/tracks').send({ title: 'Cache Probe', artistId, status: 'PROCESSING' });
      expect(created.status).toBe(201);
      const trackId = created.body.data.id as string;

      try {
        expect(await countFor()).toBe(before + 1); // creating a track must not leave a stale artists list

        const artistPage = (await request(app).get(`/artists/${artistId}`)).body.data;
        expect(artistPage.tracks.some((t: { id: string }) => t.id === trackId)).toBe(false); // not READY yet

        await request(app).patch(`/tracks/${trackId}`).send({ status: 'READY' });
        const refreshed = (await request(app).get(`/artists/${artistId}`)).body.data;
        expect(refreshed.tracks.some((t: { id: string }) => t.id === trackId)).toBe(true); // artist page is not stale
        expect((await request(app).get(`/tracks/${trackId}`)).body.data.status).toBe('READY');
      } finally {
        await prisma.track.delete({ where: { id: trackId } });
        await cache.catalogChanged();
      }
    });
  });

  describe('batch lookup', () => {
    it('POST /tracks/batch returns the requested tracks with relations, ignoring unknown and duplicate ids', async () => {
      const list = await request(app).get('/tracks?limit=2');
      const [a, b] = list.body.data;
      const res = await request(app).post('/tracks/batch').send({ ids: [a.id, b.id, a.id, 'does-not-exist'] });

      expect(res.status).toBe(200);
      expect(res.body.data.map((t: { id: string }) => t.id).sort()).toEqual([a.id, b.id].sort());
      expect(res.body.data[0].artist).toBeDefined();
    });

    it('POST /tracks/batch validates the body', async () => {
      expect((await request(app).post('/tracks/batch').send({ ids: [] })).status).toBe(400);
      expect((await request(app).post('/tracks/batch').send({})).status).toBe(400);
    });
  });

  describe('track updates', () => {
    it('PATCH /tracks/:id rejects fields outside the allowlist and unknown ids', async () => {
      const bad = await request(app).patch('/tracks/anything').send({ artistId: 'hijack' });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');

      const invalidPeaks = await request(app).patch('/tracks/anything').send({ waveformPeaks: [2] });
      expect(invalidPeaks.status).toBe(400);

      const missing = await request(app).patch('/tracks/does-not-exist').send({ status: 'FAILED' });
      expect(missing.status).toBe(404);
    });
  });

  describe('upload registration endpoint', () => {
    const valid = { title: 'T', artistName: 'A', genre: 'G', originalFormat: 'flac', rawStorageKey: 'raw/x.flac' };

    it('POST /tracks/uploads validates its body at the boundary', async () => {
      for (const bad of [{}, { ...valid, title: ' ' }, { ...valid, rawStorageKey: '' }, { ...valid, genre: undefined }]) {
        const res = await request(app).post('/tracks/uploads').send(bad);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('the retired /resolve endpoints are gone', async () => {
      for (const path of ['/artists/resolve', '/genres/resolve', '/albums/resolve']) {
        expect((await request(app).post(path).send({ name: 'x' })).status).toBe(404);
      }
    });
  });
});

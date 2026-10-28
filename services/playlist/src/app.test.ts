import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { createInMemoryCatalog } from '@music/shared/testing';

const KNOWN = ['t1', 't2', 't3', 't4'];
const catalog = createInMemoryCatalog();
for (const id of KNOWN) catalog.addTrack({ id, title: `Title ${id}` });
const app = createApp({ prisma, catalog });

const users = new Set<string>();
let user: string;
const as = (u: string) => ({ 'x-user-id': u });

async function newPlaylist(owner = user, body: object = { title: 'Mix' }) {
  const res = await request(app).post('/api/playlists').set(as(owner)).send(body);
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}
const add = (id: string, trackId: string, extra: object = {}, owner = user) =>
  request(app).post(`/api/playlists/${id}/tracks`).set(as(owner)).send({ trackId, ...extra });
async function order(id: string, owner = user) {
  const res = await request(app).get(`/api/playlists/${id}`).set(as(owner));
  return (res.body.data.tracks as { trackId: string; position: number }[]).map((t) => `${t.position}:${t.trackId}`);
}

beforeEach(() => {
  user = `test-${randomUUID()}`;
  users.add(user);
});

afterAll(async () => {
  await prisma.playlist.deleteMany({ where: { userId: { in: [...users] } } });
  await prisma.favorite.deleteMany({ where: { userId: { in: [...users] } } });
  await prisma.$disconnect();
});

describe('playlists', () => {
  it('creates, lists with track counts, updates and deletes (cascading tracks)', async () => {
    const id = await newPlaylist(user, { title: ' Road Trip ', description: 'long drive' });
    await add(id, 't1');

    const list = await request(app).get('/api/playlists').set(as(user));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id, title: 'Road Trip', trackCount: 1 });

    const patched = await request(app).patch(`/api/playlists/${id}`).set(as(user)).send({ title: 'Renamed' });
    expect(patched.body.data.title).toBe('Renamed');

    expect((await request(app).delete(`/api/playlists/${id}`).set(as(user))).status).toBe(204);
    expect((await request(app).get(`/api/playlists/${id}`).set(as(user))).status).toBe(404);
    expect(await prisma.playlistTrack.count({ where: { playlistId: id } })).toBe(0);
  });

  it('validates input at the boundary', async () => {
    const res = await request(app).post('/api/playlists').set(as(user)).send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await request(app).post('/api/playlists').set(as(user)).set('content-type', 'application/json').send('{bad')).status).toBe(400);
  });

  it('appends tracks in order, hydrates them from the catalog, and rejects unknown and duplicate tracks', async () => {
    const id = await newPlaylist();
    expect((await add(id, 't1')).status).toBe(201);
    await add(id, 't2');
    await add(id, 't3');

    expect(await order(id)).toEqual(['0:t1', '1:t2', '2:t3']);
    const detail = await request(app).get(`/api/playlists/${id}`).set(as(user));
    expect(detail.body.data.tracks[0].track).toMatchObject({ id: 't1', title: 'Title t1' });

    const unknown = await add(id, 'ghost');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('TRACK_NOT_FOUND');
    const dup = await add(id, 't2');
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_TRACK');
  });

  it('inserts at a position and keeps positions contiguous', async () => {
    const id = await newPlaylist();
    for (const t of ['t1', 't2', 't3']) await add(id, t);
    expect((await add(id, 't4', { position: 1 })).status).toBe(201);
    expect(await order(id)).toEqual(['0:t1', '1:t4', '2:t2', '3:t3']);
  });

  it('removes a track and closes the gap', async () => {
    const id = await newPlaylist();
    for (const t of ['t1', 't2', 't3']) await add(id, t);

    expect((await request(app).delete(`/api/playlists/${id}/tracks/t2`).set(as(user))).status).toBe(204);
    expect(await order(id)).toEqual(['0:t1', '1:t3']);
    expect((await request(app).delete(`/api/playlists/${id}/tracks/t2`).set(as(user))).status).toBe(404);
  });

  it('reorders persistently, including full reversals that would collide on the unique index', async () => {
    const id = await newPlaylist();
    for (const t of ['t1', 't2', 't3', 't4']) await add(id, t);

    const res = await request(app).put(`/api/playlists/${id}/tracks/order`).set(as(user)).send({ trackIds: ['t4', 't3', 't2', 't1'] });
    expect(res.status).toBe(200);
    expect(await order(id)).toEqual(['0:t4', '1:t3', '2:t2', '3:t1']);

    await request(app).put(`/api/playlists/${id}/tracks/order`).set(as(user)).send({ trackIds: ['t3', 't4', 't1', 't2'] });
    expect(await order(id)).toEqual(['0:t3', '1:t4', '2:t1', '3:t2']);
  });

  it('rejects reorders that are not a permutation of the playlist', async () => {
    const id = await newPlaylist();
    for (const t of ['t1', 't2']) await add(id, t);
    for (const trackIds of [['t1'], ['t1', 't1'], ['t1', 't3'], ['t1', 't2', 't3']]) {
      const res = await request(app).put(`/api/playlists/${id}/tracks/order`).set(as(user)).send({ trackIds });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ORDER');
    }
    expect(await order(id)).toEqual(['0:t1', '1:t2']); // unchanged
  });

  it('keeps positions unique and contiguous under concurrent adds', async () => {
    const id = await newPlaylist();
    const results = await Promise.all(['t1', 't2', 't3', 't4'].map((t) => add(id, t)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    const positions = (await order(id)).map((s) => Number(s.split(':')[0])).sort();
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it('enforces ownership: private playlists are hidden, public ones read-only', async () => {
    const other = `test-${randomUUID()}`;
    users.add(other);
    const priv = await newPlaylist(user, { title: 'Private', isPublic: false });
    const pub = await newPlaylist(user, { title: 'Public', isPublic: true });

    expect((await request(app).get(`/api/playlists/${priv}`).set(as(other))).status).toBe(404);
    const asOther = await request(app).get(`/api/playlists/${pub}`).set(as(other));
    expect(asOther.status).toBe(200);
    expect(asOther.body.data.isOwner).toBe(false);
    expect((await request(app).get(`/api/playlists/${pub}`).set(as(user))).body.data.isOwner).toBe(true);
    expect((await add(pub, 't1', {}, other)).status).toBe(403);
    expect((await request(app).delete(`/api/playlists/${pub}`).set(as(other))).status).toBe(403);
    expect((await request(app).get('/api/playlists').set(as(other))).body.data).toEqual([]);
  });
});

describe('favorites', () => {
  it('adds idempotently, lists newest first with track data, and removes', async () => {
    expect((await request(app).put('/api/favorites/t1').set(as(user))).body.data).toEqual({ trackId: 't1', favorited: true });
    await request(app).put('/api/favorites/t1').set(as(user)); // idempotent
    await request(app).put('/api/favorites/t2').set(as(user));

    expect((await request(app).get('/api/favorites/ids').set(as(user))).body.data).toEqual(['t2', 't1']);
    const list = await request(app).get('/api/favorites').set(as(user));
    expect(list.body.data.map((f: { track: { id: string } }) => f.track.id)).toEqual(['t2', 't1']);

    expect((await request(app).delete('/api/favorites/t1').set(as(user))).body.data.favorited).toBe(false);
    expect((await request(app).delete('/api/favorites/t1').set(as(user))).status).toBe(200); // idempotent
    expect((await request(app).get('/api/favorites/ids').set(as(user))).body.data).toEqual(['t2']);
  });

  it('toggles state back and forth', async () => {
    expect((await request(app).post('/api/favorites/t3/toggle').set(as(user))).body.data.favorited).toBe(true);
    expect((await request(app).post('/api/favorites/t3/toggle').set(as(user))).body.data.favorited).toBe(false);
  });

  it('rejects unknown tracks and keeps users separate', async () => {
    expect((await request(app).put('/api/favorites/ghost').set(as(user))).status).toBe(404);
    await request(app).put('/api/favorites/t1').set(as(user));
    const other = `test-${randomUUID()}`;
    users.add(other);
    expect((await request(app).get('/api/favorites/ids').set(as(other))).body.data).toEqual([]);
  });
});

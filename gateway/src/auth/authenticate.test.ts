import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signToken } from '@music/shared';

const SECRET = 'gateway-test-secret';
const token = (userId = 'user-1', ttl = 60, secret = SECRET) =>
  signToken({ userId, email: 'a@b.co', displayName: 'Ada' }, secret, ttl);

let upstream: http.Server;
let app: Express;
let hits: number;

// The proxy targets are read from the environment when the gateway module loads, so the stub
// upstream has to be listening (and the env set) before the app is imported.
beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    hits++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ userId: req.headers['x-user-id'] ?? null }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, resolve));
  const url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  process.env.JWT_SECRET = SECRET;
  for (const name of ['CATALOG', 'PLAYLIST', 'INGESTION', 'STREAMING', 'AUTH']) {
    process.env[`${name}_SERVICE_URL`] = url;
  }
  const { createApp } = await import('../app.js');
  app = createApp();
});

afterAll(() => {
  upstream.close();
});

const reset = () => {
  hits = 0;
};

describe('gateway authentication', () => {
  it('passes the verified user id to the service', async () => {
    reset();
    const res = await request(app).get('/api/tracks').set('Authorization', `Bearer ${token('user-42')}`);
    expect(res.body.userId).toBe('user-42');
  });

  it('ignores an X-User-Id the client sends itself', async () => {
    reset();
    const forged = await request(app).get('/api/tracks').set('X-User-Id', 'someone-else');
    expect(forged.body.userId).toBeNull();

    const overridden = await request(app)
      .get('/api/tracks')
      .set('X-User-Id', 'someone-else')
      .set('Authorization', `Bearer ${token('user-1')}`);
    expect(overridden.body.userId).toBe('user-1');
  });

  it('accepts the token as a query parameter on the stream route only', async () => {
    reset();
    const stream = await request(app).get(`/api/stream/t1?access_token=${token('user-9')}`);
    expect(stream.body.userId).toBe('user-9');

    const elsewhere = await request(app).get(`/api/tracks?access_token=${token('user-9')}`);
    expect(elsewhere.body.userId).toBeNull();
  });

  it('lets guests through to public routes with no user id', async () => {
    reset();
    const res = await request(app).get('/api/tracks');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });

  it('rejects a bad or expired token with 401 TOKEN_INVALID instead of treating it as a guest', async () => {
    reset();
    for (const bad of [token('u', 60, 'wrong-secret'), token('u', -10), 'garbage']) {
      const res = await request(app).get('/api/tracks').set('Authorization', `Bearer ${bad}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    }
    expect(hits).toBe(0);
  });

  it.each(['/api/playlists', '/api/favorites/ids', '/api/ingest/upload'])(
    'turns guests away from %s without reaching the service',
    async (path) => {
      reset();
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('LOGIN_REQUIRED');
      expect(hits).toBe(0);
    }
  );

  it('lets signed-in users reach per-user routes', async () => {
    reset();
    const res = await request(app).get('/api/playlists').set('Authorization', `Bearer ${token('user-7')}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-7');
  });

  it('keeps signup and login reachable without a token', async () => {
    reset();
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(200);
    expect(hits).toBe(1);
  });
});

#!/usr/bin/env node
/**
 * Measures the running stack and prints JSON. Used for the numbers in docs/resume-guide.md.
 *
 *   node scripts/bench.mjs            # latency + transcode
 *   node scripts/bench.mjs --no-transcode
 *
 * Needs the full stack up (infrastructure, worker, catalog, streaming, ingestion, auth, gateway)
 * and `pnpm seed` already run. Start the gateway with RATE_LIMIT_PER_MINUTE=1000000 or the
 * limiter will (correctly) cut the run short. The transcode part signs up a throwaway
 * bench-*@example.com account and deletes the audio objects it creates. Remove the leftovers with:
 *   docker exec music-postgres psql -U postgres -d music_auth -c "DELETE FROM users WHERE email LIKE 'bench-%@example.com'"
 *   docker exec music-postgres psql -U postgres -d music_catalog -c "DELETE FROM tracks WHERE title LIKE 'bench-%'; DELETE FROM artists WHERE name='Bench Artist'; DELETE FROM genres WHERE name='Bench'"
 *
 * Why a keep-alive http client and not fetch: on Windows, Node's fetch added a flat ~15 ms to
 * every call to the services, which would have swamped what is being measured.
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const GW = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080/api';
const CATALOG = process.env.CATALOG_URL ?? 'http://127.0.0.1:3001/api';
const STREAMING = process.env.STREAMING_URL ?? 'http://127.0.0.1:3004/api';
const withTranscode = !process.argv.includes('--no-transcode');

const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

function send(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const t = performance.now();
    const req = http.request(url, { method, agent, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ ms: performance.now() - t, status: res.statusCode, text, json: () => JSON.parse(text) });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const get = (url, headers) => send(url, { headers });

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, p50: +pct(s, 50).toFixed(2), p95: +pct(s, 95).toFixed(2), p99: +pct(s, 99).toFixed(2) };
};
async function sequential(n, fn) {
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(await fn(i));
  return xs;
}
async function concurrent(total, workers, fn) {
  const xs = [];
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    [...Array(workers)].map(async () => {
      while (next < total) xs.push(await fn(next++));
    })
  );
  return { xs, requestsPerSecond: Math.round(total / ((performance.now() - t0) / 1000)) };
}

const out = { env: { node: process.version, platform: process.platform } };

// ---- 64 KiB byte-range reads of a seeded free track
const tracks = (await get(`${GW}/tracks?limit=50`)).json().data;
const free = tracks.find((t) => t.isFree);
if (!free) throw new Error('No free track found; run `pnpm seed` first');
const rangeRead = (base) => async () => {
  const r = await get(`${base}/stream/${free.id}`, { range: 'bytes=0-65535' });
  if (r.status !== 206) throw new Error(`expected 206 from ${base}, got ${r.status}`);
  return r.ms;
};
await sequential(100, rangeRead(GW)); // warm connections and the resolver cache
out.range_64KiB_via_gateway = stats(await sequential(1000, rangeRead(GW)));
out.range_64KiB_direct_streaming = stats(await sequential(1000, rangeRead(STREAMING)));
{
  const { xs, requestsPerSecond } = await concurrent(5000, 32, rangeRead(GW));
  out.range_64KiB_via_gateway_32_workers = { ...stats(xs), requestsPerSecond };
}

// ---- Catalog read cache: a never-seen search reads Postgres, the identical repeat comes from Redis
{
  const miss = [];
  const hit = [];
  for (let i = 0; i < 300; i++) {
    const url = `${CATALOG}/tracks?limit=12&search=bench${i}-${Date.now()}`;
    miss.push((await get(url)).ms);
    hit.push((await get(url)).ms);
  }
  out.catalog_search_first_call_postgres = stats(miss);
  out.catalog_search_repeat_call_redis = stats(hit);
}

// ---- What the gateway adds (JWT check, Redis rate-limit round trip, proxy hop) on a cached read
await sequential(50, () => get(`${CATALOG}/genres`));
await sequential(50, () => get(`${GW}/genres`));
out.genres_direct_to_catalog = stats(await sequential(1000, async () => (await get(`${CATALOG}/genres`)).ms));
out.genres_via_gateway = stats(await sequential(1000, async () => (await get(`${GW}/genres`)).ms));

// ---- Upload -> transcode -> READY
if (withTranscode) {
  const require = createRequire(new URL('../services/catalog/package.json', import.meta.url));
  const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

  const wav = (seconds, rate = 44100, channels = 2) => {
    const samples = seconds * rate;
    const data = Buffer.alloc(samples * channels * 2);
    for (let i = 0; i < samples; i++) {
      const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3 * 32767);
      for (let c = 0; c < channels; c++) data.writeInt16LE(v, (i * channels + c) * 2);
    }
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
    h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * 2, 28);
    h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
  };
  const multipart = (fields, file) => {
    const boundary = `----bench${Date.now()}`;
    const parts = Object.entries(fields).map(
      ([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
    );
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bench.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
    parts.push(file, Buffer.from(`\r\n--${boundary}--\r\n`));
    return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` };
  };

  const email = `bench-${Date.now()}@example.com`;
  const signup = await send(`${GW}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'bench password', displayName: 'Bench' })
  });
  const auth = { authorization: `Bearer ${signup.json().data.token}` };

  out.transcodes = [];
  const created = [];
  for (const seconds of [30, 120, 300]) {
    const file = wav(seconds);
    const { body, type } = multipart(
      { title: `bench-${seconds}s-${Date.now()}`, artistName: 'Bench Artist', genre: 'Bench' },
      file
    );
    const t0 = performance.now();
    const res = await send(`${GW}/ingest/upload`, {
      method: 'POST',
      headers: { ...auth, 'content-type': type, 'content-length': body.length },
      body
    });
    const acceptedMs = performance.now() - t0;
    if (res.status !== 202) throw new Error(`upload failed: ${res.status} ${res.text}`);
    const id = res.json().data.trackId;
    created.push(id);

    let status = 'PROCESSING';
    while (status === 'PROCESSING') {
      if (performance.now() - t0 > 180_000) throw new Error('transcode timed out');
      await new Promise((r) => setTimeout(r, 50));
      status = (await get(`${CATALOG}/tracks/${id}?poll=${Math.random()}`)).json().data.status;
    }
    out.transcodes.push({
      audioSeconds: seconds,
      wavMB: +(file.length / 1048576).toFixed(1),
      uploadAcceptedMs: Math.round(acceptedMs),
      totalToReadyMs: Math.round(performance.now() - t0),
      status
    });
  }

  const s3 = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin', secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin' }
  });
  for (const id of created) {
    const t = (await get(`${CATALOG}/tracks/${id}?poll=${Math.random()}`)).json().data;
    if (t.rawStorageKey) await s3.send(new DeleteObjectCommand({ Bucket: 'raw-audio', Key: t.rawStorageKey }));
    if (t.storageKey) await s3.send(new DeleteObjectCommand({ Bucket: 'processed-audio', Key: t.storageKey }));
  }
  out.cleanup = { note: 'audio objects deleted; track rows and the bench account remain', account: email };
}

console.log(JSON.stringify(out, null, 2));
agent.destroy();

# Resume and interview guide

Everything in the tables below was measured on this repository, not estimated. Reproduce the latency and transcode numbers with `node scripts/bench.mjs` and the test count with `pnpm test`.

**Measurement setup.** One laptop (Intel Core i5-8350U, 4 cores / 8 threads, 15.8 GB RAM, Windows 11, Node 24). Postgres, Redis, RabbitMQ, MinIO and the FFmpeg worker run in Docker on the same machine; each service is a single Node process. The load generator runs on the same CPU, so the figures include no real network and are pessimistic on throughput. They show the shape of the system, not a production capacity plan.

## The numbers

| Area | Result | How it was measured |
| :--- | :--- | :--- |
| Byte-range streaming | **p50 6.6 ms, p95 8.4 ms, p99 10.8 ms** for a 64 KiB `Range` read straight from the Streaming Service | 1,000 sequential requests, keep-alive client, `206 Partial Content` asserted on every one |
| Through the gateway | p50 9.9 ms, p95 14.2 ms, p99 19.1 ms | Same, via `:8080` |
| Concurrency | **228 requests/s** through the gateway with 32 concurrent clients (p95 176 ms) | 5,000 range reads; load generator shares the CPU |
| Catalog read cache | Repeated search **7.3 ms to 1.8 ms** at p50 (about 4x); p95 10.4 ms to 2.6 ms | 300 never-seen searches, each followed by the identical request. The data set is only 14 tracks, so the gap would widen with a bigger catalog |
| What the gateway adds | +3.6 ms at p50 (1.4 ms direct, 5.0 ms through) on a cached read | JWT check, Redis rate-limit round trip and one proxy hop together |
| Transcode, end to end | 30 s of audio in **1.2 s**, 120 s in **2.7 s**, 300 s in **6.9 s** (about 44x real time) | Upload a stereo 44.1 kHz WAV, poll until `READY`. Includes the upload, queue hop, FFmpeg to 320 kbps MP3, 128 waveform peaks and the catalog update |
| Upload acceptance | 50 MB accepted (`202`) in 1.0 s, about 49 MB/s into MinIO | Same run; the response returns before transcoding |
| Rate limiting | With a limit of 5, requests 1-5 return `200`, then `429` with `Retry-After: 60` | Run live against Redis; `/health` is exempt |
| Automated tests | **200 tests in 9 packages**, all passing | `pnpm test`: shared 39, frontend 26, ingestion 8, gateway 31, auth 8, worker 15, streaming 14, playlist 12, catalog 47 |
| Size | about 6,300 lines of source and 2,500 lines of tests (TypeScript) | Tracked files, generated code excluded |
| Turnkey demo | `pnpm seed` loads 12 tracks with waveforms and playable audio in about 6 s | Timed |

## Resume bullets

Pick three or four. Each is backed by a number above.

- Designed and built a TypeScript microservice platform for music streaming (API gateway, auth, catalog, playlist, ingestion and streaming services plus an FFmpeg worker) in a pnpm monorepo, with 200 automated tests across 9 packages.
- Implemented HTTP 206 byte-range audio delivery from S3-compatible storage that reads only the requested slice, serving 64 KiB range reads at p50 6.6 ms and p99 10.8 ms, and 228 requests/s at 32 concurrent clients on a single laptop.
- Built an asynchronous ingestion pipeline on RabbitMQ with manual acknowledgement and a dead-letter queue: a 5-minute WAV becomes a 320 kbps MP3 with a 128-point waveform in 6.9 s end to end, and the upload call returns `202` before any transcoding starts.
- Wrote a Redis sliding-window rate limiter as an atomic Lua script on a sorted set (shared across gateway instances, using the Redis clock, failing open if Redis is down) and verified it with one contract suite run against both the Redis and in-memory adapters.
- Replaced pattern-based cache invalidation with a generation counter embedded in every key, which removed a class of stale-data bug (artist counts went stale after an upload) and cut repeated catalog searches from 7.3 ms to 1.8 ms.
- Added JWT authentication verified only at the gateway, which discards client-supplied identity headers, plus signup and login with bcrypt, a guest mode limited to free tracks, and server-side premium enforcement in the streaming service.
- Consolidated four hand-written HTTP clients into one shared Catalog client with HTTP and in-memory adapters held to the same contract suite, so every service's tests run against a fake that is proven to behave like the real thing.

## System design talking points

Each one is a decision you can defend, with the trade-off and what you would change.

**1. Why transcoding is asynchronous.** FFmpeg is CPU-bound and takes seconds; an upload request should not hold a connection that long or compete with API traffic. The ingestion service registers a `PROCESSING` placeholder, streams the file to object storage, publishes a job and returns `202`. The worker consumes with `prefetch(1)` and manual acks, so a crashed worker's job is redelivered, and a job that fails is nacked without requeue into a dead-letter queue instead of looping forever. *Trade-off:* the client has to poll for `READY`. *Next step:* push status over SSE or WebSocket, and add a retry-with-backoff queue before the DLQ for transient failures.

**2. How seeking works.** The browser sends `Range: bytes=a-b`; the streaming service answers `206` with `Content-Range`, `Accept-Ranges` and an exact `Content-Length`, and asks object storage for only that byte range, so skipped audio is never read. Out-of-bounds ranges return `416`. The range parser is a pure function with its own unit tests. The track-to-storage-key lookup is cached for 60 s because every seek is a request. *Trade-off:* a track that becomes ready is invisible to the streaming service for up to 60 s, which is harmless here.

**3. Cache invalidation.** Every cached key contains a generation number; any catalog write increments it (one atomic `INCR`), making every earlier entry unreachable at once, and old entries simply expire. A read captures the generation before it loads, so a slow read that finishes after a write can never be served stale. *Why not per-write invalidation:* writes are rare and TTLs short, and a writer and reader disagreeing about a key pattern was a real bug here. *Trade-off:* a write throws away unrelated entries too.

**4. Rate limiting.** A sliding window, not a fixed one, so a client cannot send a double burst across a minute boundary. The Lua script trims the window, counts, and adds the hit only if it fits, in one round trip, so concurrent gateways cannot both squeeze through. It uses Redis `TIME` so instances with skewed clocks agree. It fails open: losing Redis should degrade protection, not take the API down. *Trade-off:* the limit is per IP, so users behind one NAT share a budget; a per-user limit for signed-in traffic is the natural next step. Also note memory is proportional to the limit (one sorted-set entry per request in the window).

**5. Authentication boundary.** Tokens are verified in exactly one place. The gateway deletes any `X-User-Id` the client sent and sets it from the verified token; services trust that header. Guests simply have no header. A token that fails verification is rejected with `401 TOKEN_INVALID` rather than silently downgraded to guest, so the client knows its session ended. Passwords use bcrypt, login gives the same answer for a wrong password and an unknown email, and an unknown email still pays a hash comparison so response time does not reveal which emails exist. *Trade-off, say this first:* because services trust a header, they must never be reachable except through the gateway. A stricter design would have each service verify the JWT itself or use mTLS between services.

**6. Free versus premium.** The Catalog stores `isFree`; the streaming service, which owns the audio bytes, enforces it, so no gateway route can forget the check. Guests get `401 LOGIN_REQUIRED` on premium tracks; the UI shows a lock. *Browser detail worth knowing:* an `<audio>` element cannot send an `Authorization` header, so the stream route alone also accepts `?access_token=`. The cost is that the token can appear in access logs; the mitigation is a short-lived stream-only token, which is not built.

**7. Testing strategy.** Services depend on narrow interfaces (the Catalog client, the cache, the rate limiter, object storage, the job publisher) and are given adapters, so tests swap in-memory versions. The important part is that each interface has one contract suite that runs against every adapter, including the real one against the real database; that is what stops the fakes from drifting. Pure logic (range parsing, peak normalisation, token verification) has plain unit tests, the queue consumer is tested against a fake channel, and catalog and playlist CRUD run against real Postgres.

**8. Playlist ordering under concurrency.** Positions are unique per playlist, and every mutation takes a row lock (`FOR UPDATE`) and renumbers through an offset so the unique constraint is never violated mid-update. A track appears once per playlist (`409 DUPLICATE_TRACK`). Reorder takes the complete list so the server never has to guess.

## Known limitations

Say these before an interviewer finds them; each shows you know where the edges are.

- The frontend is covered by jsdom component tests and a production build, but has not been exercised in a real browser (drag-and-drop, the canvas waveform and audio playback are unverified there).
- Services trust `X-User-Id` (see point 5); there is no refresh token, password reset, email verification or login throttling beyond the global per-IP rate limit.
- Uploads are validated by MIME type and file extension, not by inspecting the contents. An oversize upload can leave a partial object in the raw bucket.
- Ingestion needs the metadata fields before the file in the multipart body.
- If the cache increment fails while Redis is otherwise up, the error is logged and entries expire by TTL, so reads can be stale for up to two minutes.
- Benchmarks are single machine and single process per service; they show relative costs (cache, gateway hop, transcode speed), not capacity. The cache gain was measured on 14 tracks.
- The Catalog's write endpoints exist for internal callers; the gateway blocks them (`405`), but they are unauthenticated on the internal network.

## Reproduce the numbers

```bash
pnpm docker:up && pnpm build && pnpm seed
# start catalog, streaming, ingestion, playlist, auth and the worker, then the gateway with a high limit:
RATE_LIMIT_PER_MINUTE=1000000 pnpm --filter @music/gateway start
node scripts/bench.mjs                 # add --no-transcode to skip the upload test
pnpm test                              # 200 tests; catalog tests need the Postgres and Redis containers
```

The benchmark script uses a keep-alive `http` client instead of `fetch` on purpose: on Windows, Node's `fetch` added a flat ~15 ms to every call to these services, which would have hidden everything above. It leaves a throwaway `bench-*@example.com` account and a few `bench-*` tracks behind; the header comment in the script shows how to remove them.

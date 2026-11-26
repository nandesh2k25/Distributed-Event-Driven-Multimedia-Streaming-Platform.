[← Back to README](../README.md) · **[Overview](description.md)** · **[Architecture](architecture.md)** · **[Setup & Run](setup-and-run.md)** · **[API Reference](api-reference.md)** · **[Verification](verification.md)**

---

# Verification, Testing & Benchmarking Guide

This guide details automated testing suites, manual endpoint smoke test scripts (via `curl`), and throughput benchmarking.

---

## 1. Automated Test Suite

The platform contains over 200 automated unit and integration tests across all microservices and packages.

### Run All Tests
Ensure Docker containers are running and databases are seeded before running integration tests:
```bash
pnpm test
```

### Run Tests Per Workspace Package
```bash
pnpm --filter @music/shared test     # Byte-range parsing, JWT token signing, Catalog client
pnpm --filter @music/gateway test    # Rate limiter contract, Correlation ID middleware
pnpm --filter @music/catalog test    # Prisma queries, Redis cache invalidation
pnpm --filter @music/playlist test   # Reorder transactions, duplicate track rejection
pnpm --filter @music/streaming test  # Range header slicing & MinIO integration
pnpm --filter @music/worker test     # Mocked queue consumer & DLQ dead-letter tests
pnpm --filter @music/frontend test   # WaveformVisualizer & persistent AudioPlayerContext
```

---

## 2. End-to-End Manual Verification (cURL)

Make sure the API Gateway is running on `http://localhost:8080`.

### 2.1. Aggregated Dependency Health Check
Verify live connectivity across Postgres, Redis, RabbitMQ, and MinIO:
```bash
curl -i http://localhost:8080/health
```
*Expected Status*: `HTTP/1.1 200 OK` with all dependencies showing `status: "UP"`.

### 2.2. Catalog Exploration & Search
```bash
# List first 5 tracks with pagination metadata
curl -s "http://localhost:8080/api/tracks?limit=5"

# Filter by genre
curl -s "http://localhost:8080/api/tracks?genre=synthwave"

# Live search across tracks, artists, and albums
curl -s "http://localhost:8080/api/search?q=mirage"

# List artists and albums
curl -s "http://localhost:8080/api/artists"
curl -s "http://localhost:8080/api/albums"
```

### 2.3. User Authentication & Member Token
```bash
# Sign up a new user account
AUTH_RESP=$(curl -s -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@example.com","password":"securepassword123","displayName":"DevTester"}')

# Extract JWT token
TOKEN=$(node -pe 'JSON.parse(process.argv[1]).data.token' "$AUTH_RESP")
echo "Authenticated JWT: $TOKEN"

# Query profile
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/auth/me
```

### 2.4. Free vs. Premium Track Access Rule
```bash
# Get IDs for a free track and a premium track
FREE_ID=$(curl -s "http://localhost:8080/api/tracks?limit=50" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.find(t => t.isFree).id')
PREMIUM_ID=$(curl -s "http://localhost:8080/api/tracks?limit=50" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.find(t => !t.isFree).id')

# Free track streams without authentication (HTTP 206)
curl -i -H "Range: bytes=0-1000" "http://localhost:8080/api/stream/$FREE_ID"

# Premium track without token returns 401
curl -i -H "Range: bytes=0-1000" "http://localhost:8080/api/stream/$PREMIUM_ID"

# Premium track with token streams successfully (HTTP 206)
curl -i -H "Authorization: Bearer $TOKEN" -H "Range: bytes=0-1000" "http://localhost:8080/api/stream/$PREMIUM_ID"
```

### 2.5. Redis Sliding-Window Rate Limiting
Test the gateway's 300 req/min rate limit:
```bash
# Rapidly fire requests to trigger rate limiting
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/genres
done
```
Inspect headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and on `429` observe `Retry-After`.

### 2.6. Playlists & Reordering
```bash
# Create a playlist
PL_ID=$(curl -s -X POST http://localhost:8080/api/playlists \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Late Night Beats"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')

# Add track
curl -s -X POST "http://localhost:8080/api/playlists/$PL_ID/tracks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"trackId\":\"$FREE_ID\"}"

# Retrieve playlist with ordered tracks
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/playlists/$PL_ID"
```

### 2.7. Asynchronous Audio Ingestion & FFmpeg Transcoding
```bash
# Dispatch upload (ensure metadata fields come before file)
curl -i -X POST http://localhost:8080/api/ingest/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F title="Test Track" \
  -F artistName="Neon Mirage" \
  -F genre="Synthwave" \
  -F "file=@sample.flac;type=audio/flac"
```
- Expect `HTTP 202 Accepted` with `{ trackId, status: "PROCESSING" }`.
- Check worker logs: `docker logs -f music-worker`.
- Track transitions to `status: "READY"` with 128 waveform peaks upon completion.

---

## 3. Benchmarking Audio Throughput & Latency

A benchmark script is provided in `scripts/bench.mjs`:
```bash
# Benchmark Time-to-First-Byte (TTFB) and byte-range throughput
node scripts/bench.mjs
```
Expected performance metrics:
- Sub-200ms Time-To-First-Byte (TTFB) on byte-range audio chunks.
- Sub-5ms response time on Redis-cached catalog routes.
- Sub-3 second FFmpeg transcoding for standard 3-4 minute audio tracks.

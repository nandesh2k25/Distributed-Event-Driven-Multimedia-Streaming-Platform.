# Distributed Multimedia Streaming Platform

A production-grade, distributed music streaming and audio processing platform built with an event-driven microservices architecture. Designed to decouple lightweight API metadata handling from compute-intensive audio transcoding and high-throughput byte-range media delivery.

For a detailed breakdown of the system architecture, microservices design, and Mermaid sequence diagrams, see [docs/description.md](docs/description.md).

---

## Architecture & Service Map

| Service / Component | Port | Description |
| :--- | :--- | :--- |
| **API Gateway** | `8080` | Ingress reverse proxy, JWT verification, Redis sliding-window rate limiting, `X-Correlation-ID` propagation & aggregated health checks |
| **PostgreSQL 16** | `5432` | Relational metadata persistence (`music_catalog`, `music_playlist` and `music_auth` databases) |
| **Redis 7** | `6379` | In-memory distributed caching & gateway rate limiting |
| **RabbitMQ 3** | `5672` / `15672` | AMQP message broker for asynchronous media transcoding jobs & web management dashboard |
| **MinIO S3** | `9000` / `9001` | High-performance S3-compatible object storage (`raw-audio` and `processed-audio` buckets) & console UI |
| **Catalog Service** | `3001` | Prisma/PostgreSQL catalog (artists, albums, tracks, genres), search, Redis-cached listings |
| **Auth Service** | `3005` | Prisma/PostgreSQL (`music_auth`): signup, login and session check; issues the JWTs the gateway verifies |
| **Playlist Service** | `3002` | Prisma/PostgreSQL (`music_playlist`): playlists, ordered tracks, favorites; track data comes from the Catalog Service |
| **Ingestion Service** | `3003` | Validates and streams uploads to MinIO, creates a `PROCESSING` track, dispatches jobs to RabbitMQ (`audio.events`) |
| **Transcode Worker** | N/A | Dockerized FFmpeg worker: 320 kbps MP3 + 128 waveform peaks, DLQ for failures |
| **Streaming Service** | `3004` | HTTP 206 byte-range audio delivery from MinIO (`/api/stream/:trackId`) |
| **Frontend** | `5173` | React 19 + Vite + Tailwind SPA (browse, search, player, upload, playlists, sign in) |
| **Shared Contracts** | N/A | `@music/shared` monorepo package exporting domain models, events, range utils, Zod schemas, the Catalog client and JWT helpers |

### System diagram

Every request enters through the gateway. Services never call each other directly, except to read the Catalog through the shared Catalog client; the only asynchronous path is the transcode queue.

```mermaid
flowchart LR
    Browser["Browser<br/>React SPA"] -->|"/api/*"| GW["API Gateway :8080<br/>rate limit · JWT · correlation ID"]
    GW --> Auth["Auth :3005"]
    GW --> Catalog["Catalog :3001"]
    GW --> Playlist["Playlist :3002"]
    GW --> Ingest["Ingestion :3003"]
    GW --> Stream["Streaming :3004"]

    GW -.->|"sliding window"| Redis[("Redis")]
    Catalog -.->|"read cache"| Redis
    Auth --> PGA[("Postgres<br/>music_auth")]
    Catalog --> PGC[("Postgres<br/>music_catalog")]
    Playlist --> PGP[("Postgres<br/>music_playlist")]

    Playlist -->|"Catalog client"| Catalog
    Stream -->|"Catalog client"| Catalog
    Ingest -->|"Catalog client"| Catalog

    Ingest -->|"raw upload"| Minio[("MinIO")]
    Ingest -->|"audio.events"| MQ{{"RabbitMQ"}}
    MQ -->|"audio.transcode.queue"| Worker["FFmpeg Worker"]
    MQ -.->|"rejected jobs"| DLQ["audio.transcode.dlq"]
    Worker -->|"download / upload"| Minio
    Worker -->|"mark READY / FAILED"| Catalog
    Stream -->|"HTTP 206 ranges"| Minio
```

### Upload and transcode

```mermaid
sequenceDiagram
    actor U as User
    participant GW as Gateway
    participant I as Ingestion
    participant C as Catalog
    participant M as MinIO
    participant Q as RabbitMQ
    participant W as Worker

    U->>GW: POST /api/ingest/upload (Bearer token)
    GW->>I: forwards with verified X-User-Id
    I->>C: registerUpload (PROCESSING placeholder)
    I->>M: stream file to raw-audio
    I->>Q: publish audio.events
    I-->>U: 202 Accepted { trackId }
    Q->>W: deliver job (prefetch 1, manual ack)
    W->>M: download raw, upload 320 kbps MP3
    W->>C: markTrackReady (duration, 128 peaks)
    W->>Q: ack
    Note over W,Q: on failure: markTrackFailed, nack without requeue, job goes to the DLQ
    U->>GW: GET /api/tracks/{id}
    GW-->>U: status READY
```

### Who can do what

| | Guest (no token) | Signed in |
| :--- | :---: | :---: |
| Browse, search, view catalog | yes | yes |
| Stream **free** tracks | yes | yes |
| Stream **premium** tracks | no (`401 LOGIN_REQUIRED`) | yes |
| Playlists, favorites, uploads | no (`401 LOGIN_REQUIRED`) | yes |

The gateway is the only place tokens are verified. It discards any `X-User-Id` a client sends and sets it from the verified token, which is why services behind it can trust the header. The Streaming Service applies the free vs premium rule itself, so no gateway route can forget it. **The services trust `X-User-Id`, so only the gateway (`:8080`) may be reachable from outside; never expose ports 3001-3005 publicly.**

---

## Prerequisites

Ensure the following runtimes and tools are installed on your host machine:

- **Node.js**: `v20.x` or later (LTS recommended)
- **pnpm**: `v9.x` or later
- **Docker & Docker Compose**: Docker Desktop or Docker Engine running with Compose v2+

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/nandesh2k25/Distributed-Event-Driven-Multimedia-Streaming-Platform..git
cd Distributed-Event-Driven-Multimedia-Streaming-Platform.
git checkout dev
```

### 2. Install Monorepo Dependencies

```bash
pnpm install
```

### 3. Start Infrastructure Services (Docker Compose)

Launch the underlying PostgreSQL, Redis, RabbitMQ, and MinIO instances in detached mode:

```bash
pnpm docker:up
# Alternatively: docker compose up -d
```

> **Note:** On first startup, the setup container automatically initializes the PostgreSQL databases (`music_catalog`, `music_playlist`, `music_auth`) and configures MinIO storage buckets (`raw-audio`, `processed-audio`).

To verify all containers are healthy:

```bash
docker compose ps
```

### 4. Configure the Catalog Service

Prisma reads its connection string from `services/catalog/.env` (gitignored). Create it with the local defaults that match `docker-compose.yml`:

```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/music_catalog?schema=public"
REDIS_URL="redis://localhost:6379"
PORT=3001
NODE_ENV=development
```

### 5. Build Workspace Packages

Compile the shared package first (the services import its compiled output), then everything else:

```bash
pnpm build
```

### 6. Set Up the Databases

Apply the Prisma migrations for the three databases. `pnpm build` already generated the Playlist and Auth clients; Prisma CLI commands read `DATABASE_URL`, and each service falls back to the local default at runtime:

```bash
pnpm --filter @music/catalog exec prisma generate
pnpm --filter @music/catalog exec prisma migrate deploy

DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/music_playlist?schema=public" \
  pnpm --filter @music/playlist exec prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/music_auth?schema=public" \
  pnpm --filter @music/auth exec prisma migrate deploy
```

Then load the demo library with one command:

```bash
pnpm seed
```

It creates 6 genres, 4 artists, 5 albums and 12 tracks (the first 8 free, the last 4 premium), each with a pre-computed 128-point waveform, and uploads a generated demo tune for every track to MinIO so they are playable straight away. It needs the MinIO container from step 3 but not any running service, and it is safe to run again. Set `SEED_SKIP_AUDIO=1` to seed metadata only.

### 7. Run the Automated Test Suite

Catalog, Playlist, Auth and gateway tests run against the live PostgreSQL and Redis containers, so complete steps 3 and 6 first:

```bash
pnpm test
```

This runs 200 tests across 9 packages. Beyond CRUD integration tests for the Catalog and Playlist APIs, it includes unit tests for byte-range parsing, waveform peak normalisation and token verification, and a mocked queue-consumption test for the worker (`services/worker/src/consumer.test.ts`). Adapters for the cache, rate limiter and Catalog client each run one shared contract suite. `docs/resume-guide.md` lists the measured performance numbers and how to reproduce them.

### 8. Start the Services

Run each in its own terminal. Dev mode gives hot reload:

```bash
pnpm --filter @music/catalog dev    # Catalog Service  -> http://localhost:3001
pnpm --filter @music/streaming dev  # Streaming Service-> http://localhost:3004
pnpm --filter @music/ingestion dev  # Ingestion Service-> http://localhost:3003
pnpm --filter @music/playlist dev   # Playlist Service -> http://localhost:3002
pnpm --filter @music/auth dev       # Auth Service     -> http://localhost:3005
pnpm --filter @music/gateway dev    # API Gateway      -> http://localhost:8080
pnpm --filter @music/frontend dev   # React frontend   -> http://localhost:5173
```

Then start the FFmpeg transcoding worker. It runs in Docker because it needs FFmpeg, and `docker compose up -d` already starts it with the rest of the infrastructure:

```bash
docker compose up -d --build worker
docker logs -f music-worker     # "Worker consuming audio.transcode.queue"
```

The worker reaches the Catalog Service on your host at `host.docker.internal:3001`, so keep the catalog running. To run the worker on the host instead, install FFmpeg and run `pnpm --filter @music/worker dev`.

Or run the compiled builds with `pnpm --filter <package> start` (`@music/catalog`, `@music/streaming`, `@music/ingestion`, `@music/playlist`, `@music/auth`, `@music/gateway`). The frontend dev server proxies `/api/*` to the gateway; set `GATEWAY_URL` to point it elsewhere.

Open **http://localhost:5173**. You are a **guest** straight away: browse, search and play the free tracks from the persistent bottom player bar (premium tracks show a lock). Use **Sign up** in the header to create an account and unlock premium tracks, playlists, favorites and uploads. Use **Upload** in the header to add your own audio: the Upload Studio shows the track moving from `PROCESSING` to `READY`, and playing it shows its waveform in the player bar (click or drag the waveform to seek).

Use **Playlists** to create playlists, then the list-plus icon on any track to add it. Inside a playlist you can drag rows or use the up/down arrows to reorder (saved immediately) and remove tracks. The heart on any track toggles a favorite, and **Favorites** lists them.

> **Note:** Tokens are signed with `JWT_SECRET`. Both the gateway and the Auth Service default to a development-only secret; the Auth Service refuses to start with it when `NODE_ENV=production`. Set the same `JWT_SECRET` on both anywhere that is not your own machine.

### Configuration

| Variable | Used by | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | gateway, auth | dev-only value | HMAC secret for tokens (must match) |
| `TOKEN_TTL_SECONDS` | auth | `604800` (7 days) | Token lifetime |
| `BCRYPT_ROUNDS` | auth | `10` | Password hashing cost |
| `RATE_LIMIT_PER_MINUTE` | gateway | `300` | Requests per IP per minute on `/api/*` |
| `REDIS_HOST` / `REDIS_PORT` | gateway | `localhost` / `6379` | Rate-limit store (requests are allowed if Redis is down) |
| `AUTH_SERVICE_URL` etc. | gateway | `http://localhost:300x` | Upstream service addresses |
| `SEED_SKIP_AUDIO` | seed | unset | `1` seeds metadata only |

---

## Verifying the Deployment

### Aggregated Health Check

Query the gateway's `/health` endpoint to verify live connectivity across all internal infrastructure dependencies:

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-10-28T09:15:28.754Z",
    "uptime": 12.34,
    "dependencies": {
      "postgres": { "status": "UP", "latencyMs": 26 },
      "redis": { "status": "UP", "latencyMs": 6 },
      "rabbitmq": { "status": "UP", "latencyMs": 8 },
      "minio": { "status": "UP", "latencyMs": 12 }
    }
  }
}
```

### Catalog API (through the Gateway)

```bash
curl "http://localhost:8080/api/tracks?limit=5"
curl "http://localhost:8080/api/tracks?genre=synthwave"
curl "http://localhost:8080/api/search?q=mirage"
curl http://localhost:8080/api/artists
curl http://localhost:8080/api/albums
curl http://localhost:8080/api/genres
```

### Accounts, guests and premium tracks

```bash
# Guests can stream a free track but not a premium one
curl -s "http://localhost:8080/api/tracks?limit=50" | node -pe "JSON.parse(require('fs').readFileSync(0)).data.map(t => t.id + ' ' + (t.isFree ? 'free' : 'premium') + ' ' + t.title).join('\n')"
curl -s -o /dev/null -w '%{http_code}\n' -H "Range: bytes=0-99" http://localhost:8080/api/stream/<free-id>      # 206
curl -s -H "Range: bytes=0-99" http://localhost:8080/api/stream/<premium-id>                                  # 401 LOGIN_REQUIRED

# Sign up (or POST /api/auth/login with the same email and password); the response carries a token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/signup -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"correct horse","displayName":"You"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.token")

curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" -H "Range: bytes=0-99" http://localhost:8080/api/stream/<premium-id>   # 206
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/auth/me
```

An expired or invalid token is rejected with `401 TOKEN_INVALID` (the SPA then signs the user out) rather than being treated as a guest. Browsers cannot attach headers to an `<audio>` element, so the stream route alone also accepts the token as `?access_token=`.

### Rate Limiting

`/api/*` allows `RATE_LIMIT_PER_MINUTE` requests per client IP in a sliding one-minute window, shared across gateway instances through Redis. Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`; over the limit you get `429 RATE_LIMITED` with a `Retry-After` header.

```bash
RATE_LIMIT_PER_MINUTE=5 pnpm --filter @music/gateway dev
for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w '%{http_code} ' http://localhost:8080/api/genres; done   # 200 x5, then 429 429
```

### Playlists and Favorites

Playlists, favorites and uploads need a signed-in user: add `-H "Authorization: Bearer $TOKEN"` to the requests below. The gateway turns the token into the `X-User-Id` the Playlist Service uses, so each account has its own library.

```bash
H="Authorization: Bearer $TOKEN"
PL=$(curl -s -X POST http://localhost:8080/api/playlists -H "$H" -H 'content-type: application/json' \
  -d '{"title":"Road Trip"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.id")

curl -X POST http://localhost:8080/api/playlists/$PL/tracks -H "$H" -H 'content-type: application/json' -d '{"trackId":"<id>"}'
curl -X PUT  http://localhost:8080/api/playlists/$PL/tracks/order -H "$H" -H 'content-type: application/json' -d '{"trackIds":["<id2>","<id1>"]}'
curl -X DELETE http://localhost:8080/api/playlists/$PL/tracks/<id1> -H "$H"
curl http://localhost:8080/api/playlists/$PL -H "$H"                      # tracklist in order, with track details
curl -X PUT http://localhost:8080/api/favorites/<id> -H "$H"              # also DELETE, or POST .../<id>/toggle
```

Reordering requires the full list of the playlist's `trackIds`; positions stay contiguous (`0..n-1`). A track can appear in a playlist once (`409 DUPLICATE_TRACK` otherwise).

### Upload and Transcoding Pipeline

```bash
curl -i -X POST http://localhost:8080/api/ingest/upload -H "Authorization: Bearer $TOKEN" \
  -F title="My Song" -F artistName="My Band" -F genre="Rock" -F albumTitle="Debut" \
  -F "file=@song.flac;type=audio/flac"
```

Send the metadata fields **before** the file part. Expect `202 Accepted` with `{ "trackId": "...", "status": "PROCESSING" }` immediately. The worker then transcodes to 320 kbps MP3, computes 128 waveform peaks and flips the track to `READY` (check with `GET /api/tracks/<trackId>`). Unsupported file types are rejected with `400 INVALID_FILE_TYPE`.

Jobs that fail (for example a corrupt file) mark the track `FAILED` and are dead-lettered to `audio.transcode.dlq`; inspect them in the RabbitMQ console at http://localhost:15672.

### Byte-Range Streaming

```bash
TRACK_ID=$(curl -s "http://localhost:8080/api/tracks?limit=50" | node -pe "JSON.parse(require('fs').readFileSync(0)).data.find(t => t.isFree).id")
curl -i -H "Range: bytes=0-1048575" -o /dev/null http://localhost:8080/api/stream/$TRACK_ID
```

Expect `206 Partial Content` with `Content-Range`, `Accept-Ranges: bytes` and an exact `Content-Length`. An out-of-bounds range returns `416`.

`/api/catalog/*` is also routed to the Catalog Service. All responses use the `{ success, data, meta }` envelope.

---

## API Reference

All paths are served by the gateway on `:8080`. Success responses are `{ "success": true, "data": ..., "meta": ... }`; errors are `{ "success": false, "error": { "code", "message", "details?" } }`. **Auth** is `none` (open to guests), `member` (needs `Authorization: Bearer <token>`), or `free/member` for streaming (guests get free tracks only). The Catalog is read-only through the gateway (`405 METHOD_NOT_ALLOWED` for writes).

| Method | Path | Auth | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/signup` | none | Body `{ email, password (8-72 chars), displayName }`. `201` with `{ user, token }`; `409 EMAIL_TAKEN`; `400 VALIDATION_ERROR` |
| `POST` | `/api/auth/login` | none | Body `{ email, password }`. `200` with `{ user, token }`; `401 INVALID_CREDENTIALS` (same answer for a wrong password and an unknown email) |
| `GET` | `/api/auth/me` | member | The signed-in account; `401` otherwise |
| `GET` | `/api/tracks` | none | Paged list. Query: `page`, `limit`, `search`, `genre`, `artistId`, `albumId`, `status`. Each track has `isFree` |
| `GET` | `/api/tracks/:id` | none | One track with artist, album, genre, `waveformPeaks` and `status` |
| `GET` | `/api/albums`, `/api/albums/:id` | none | Albums, and one album with its tracks |
| `GET` | `/api/artists`, `/api/artists/:id` | none | Artists with track/album counts, and one artist with albums and tracks |
| `GET` | `/api/genres` | none | All genres |
| `GET` | `/api/search?q=` | none | Tracks, artists and albums matching the query |
| `GET` | `/api/stream/:trackId` | free/member | Audio bytes. Honors `Range` (`206`, `416` when out of bounds). Premium track as a guest: `401 LOGIN_REQUIRED`. Not ready: `404 TRACK_NOT_FOUND` |
| `POST` | `/api/ingest/upload` | member | Multipart: `title`, `artistName`, `genre`, optional `albumTitle`, then `file`. `202 { trackId, status: "PROCESSING" }`; `400 INVALID_FILE_TYPE`; `413 FILE_TOO_LARGE` |
| `GET` | `/api/playlists` | member | The caller's playlists |
| `POST` | `/api/playlists` | member | Body `{ title, description?, isPublic? }`. `201` |
| `GET` `PATCH` `DELETE` | `/api/playlists/:id` | member | Read (tracks in order), edit, or delete one playlist |
| `POST` | `/api/playlists/:id/tracks` | member | Body `{ trackId }`. `409 DUPLICATE_TRACK` if already present |
| `PUT` | `/api/playlists/:id/tracks/order` | member | Body `{ trackIds }`, the complete new order |
| `DELETE` | `/api/playlists/:id/tracks/:trackId` | member | Remove a track; positions are renumbered |
| `GET` | `/api/favorites`, `/api/favorites/ids` | member | Favorites with track details, or just the ids |
| `PUT` `DELETE` | `/api/favorites/:trackId` | member | Add or remove (idempotent) |
| `POST` | `/api/favorites/:trackId/toggle` | member | Flip and return the new state |
| `GET` | `/health` | none | Aggregated Postgres, Redis, RabbitMQ and MinIO health (not rate limited) |

Every response carries `X-Correlation-ID`; `/api/*` responses also carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`, and a `429` adds `Retry-After`.

Other errors you may see: `401 TOKEN_INVALID` (bad or expired token), `429 RATE_LIMITED`, `502 CATALOG_UNAVAILABLE` (a service could not reach the Catalog), `503 SERVICE_UNAVAILABLE` (the gateway could not reach a service).

### Correlation ID Verification

The API Gateway automatically generates a UUIDv4 `X-Correlation-ID` header if one is not provided, or preserves and propagates incoming client correlation IDs:

```bash
curl -i -H "X-Correlation-ID: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" http://localhost:8080/
```

---

## Default Infrastructure Credentials

| Service | Host Port | Username | Password / Auth |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | `localhost:5432` | `postgres` | `postgrespassword` |
| **RabbitMQ Management** | `http://localhost:15672` | `guest` | `guest` |
| **MinIO Console** | `http://localhost:9001` | `minioadmin` | `minioadmin` |
| **Redis** | `localhost:6379` | *none* | *none* |

---

## Repository Structure

```
├── .Agent/             # Agent and workflow rules (untracked)
├── docs/               # System architecture, and the resume / interview guide with measured metrics
│   ├── description.md
│   └── resume-guide.md
├── frontend/           # React + Vite + Tailwind SPA
├── gateway/            # Express ingress reverse proxy & health aggregator
├── scripts/            # Database init script and bench.mjs (latency and transcode benchmark)
├── services/           # Backend microservices (Auth, Catalog, Playlist, Ingestion, Worker, Streaming)
├── shared/             # Shared TypeScript models, DTOs, events & range utilities
├── docker-compose.yml  # Multi-container orchestration specification
├── package.json        # Monorepo root scripts & configuration
├── pnpm-workspace.yaml # Workspace package definitions
└── tsconfig.base.json  # Shared strict TypeScript configuration
```

---

## Stopping Infrastructure

To stop all running Docker containers and retain data volumes:

```bash
pnpm docker:down
# Alternatively: docker compose down
```

To stop containers and wipe persistent data volumes:

```bash
docker compose down -v
```

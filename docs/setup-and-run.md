[← Back to README](../README.md) · **[Overview](description.md)** · **[Architecture](architecture.md)** · **[Setup & Run](setup-and-run.md)** · **[API Reference](api-reference.md)** · **[Verification](verification.md)**

---

# Setup, Installation & Runbook

This guide covers everything required to set up the environment, run multi-container infrastructure, apply migrations, seed demo media, and start the platform services locally.

---

## 1. Prerequisites

Ensure the following tools are installed on your host system:

- **Node.js**: `v20.x` or later (LTS recommended)
- **pnpm**: `v9.x` or later (`npm i -g pnpm`)
- **Docker & Docker Compose**: Docker Desktop or Docker Engine with Compose v2+
- *(Optional)* **FFmpeg**: Only required if running the worker natively outside Docker.

---

## 2. Step-by-Step Installation

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/nandesh2k25/Distributed-Event-Driven-Multimedia-Streaming-Platform..git
cd Distributed-Event-Driven-Multimedia-Streaming-Platform.
git checkout dev

# Install monorepo dependencies across all packages
pnpm install
```

### Step 2: Launch Infrastructure (Docker Compose)
Start PostgreSQL 16, Redis 7, RabbitMQ 3, and MinIO S3 in the background:
```bash
pnpm docker:up
# Or: docker compose up -d
```

> **Automated Initialization:** On first launch, the `music-minio-setup` and `scripts/init-postgres.sh` containers automatically initialize databases (`music_catalog`, `music_playlist`, `music_auth`) and create MinIO buckets (`raw-audio`, `processed-audio`).

Verify containers are running:
```bash
docker compose ps
```

### Step 3: Configure Environment Variables
Prisma and the microservices fall back to default localhost settings matching `docker-compose.yml`. For customized setups, create `services/catalog/.env`:
```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/music_catalog?schema=public"
REDIS_URL="redis://localhost:6379"
PORT=3001
NODE_ENV=development
```

### Step 4: Build Workspace Packages
Compile the shared contracts package first, followed by all microservices:
```bash
pnpm build
```

### Step 5: Apply Database Migrations
Apply Prisma migrations across all three PostgreSQL databases:
```bash
pnpm --filter @music/catalog exec prisma generate
pnpm --filter @music/catalog exec prisma migrate deploy

DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/music_playlist?schema=public" \
  pnpm --filter @music/playlist exec prisma migrate deploy

DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/music_auth?schema=public" \
  pnpm --filter @music/auth exec prisma migrate deploy
```

### Step 6: Seed Turnkey Demo Library
Populate sample artists, albums, tracks with real audio files and pre-computed 128-point waveform arrays:
```bash
pnpm seed
```
- Populates 6 genres, 4 artists, 5 albums, and 12 tracks (8 free, 4 premium).
- Automatically synthesizes and uploads demo audio blobs to MinIO so tracks can be streamed immediately.
- Safe and idempotent to run multiple times. *(Set `SEED_SKIP_AUDIO=1` to seed metadata only)*.

---

## 3. Starting the Services

### Option A: Local Development Mode (Hot Reload)
Run each service in a separate terminal:
```bash
pnpm --filter @music/catalog dev    # Catalog Service   -> http://localhost:3001
pnpm --filter @music/streaming dev  # Streaming Service -> http://localhost:3004
pnpm --filter @music/ingestion dev  # Ingestion Service -> http://localhost:3003
pnpm --filter @music/playlist dev   # Playlist Service  -> http://localhost:3002
pnpm --filter @music/auth dev       # Auth Service      -> http://localhost:3005
pnpm --filter @music/gateway dev    # API Gateway       -> http://localhost:8080
pnpm --filter @music/frontend dev   # React Frontend    -> http://localhost:5173
```

### Option B: Transcode Worker Startup
The worker requires FFmpeg and is pre-configured to run as a Docker container:
```bash
docker compose up -d --build worker
docker logs -f music-worker
```
*(To run on host without Docker: install `ffmpeg` and run `pnpm --filter @music/worker dev`)*.

---

## 4. Configuration Matrix

| Variable | Used By | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | All services | `8080` (gw), `3001`-`3005` | Listening port for service |
| `JWT_SECRET` | gateway, auth | *dev-only-secret* | Shared HMAC secret for token issuance & verification |
| `TOKEN_TTL_SECONDS`| auth | `604800` (7 days) | Token expiration window |
| `BCRYPT_ROUNDS` | auth | `10` | Password hashing salt cost |
| `RATE_LIMIT_PER_MINUTE` | gateway | `300` | Allowed requests per minute per IP |
| `REDIS_HOST` / `PORT` | gateway, catalog | `localhost` / `6379` | Redis connection info |
| `MINIO_ENDPOINT` | ingestion, stream, worker | `localhost:9000` | S3-compatible object store |
| `RABBITMQ_URL` | ingestion, worker | `amqp://guest:guest@localhost:5672` | Message broker connection |

---

## 5. Teardown & Cleanup

Stop all running containers while preserving database and storage volumes:
```bash
pnpm docker:down
# Or: docker compose down
```

Stop containers and wipe all persistent volumes (fresh slate):
```bash
docker compose down -v
```

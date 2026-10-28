# Distributed Multimedia Streaming Platform

A production-grade, distributed music streaming and audio processing platform built with an event-driven microservices architecture. Designed to decouple lightweight API metadata handling from compute-intensive audio transcoding and high-throughput byte-range media delivery.

For a detailed breakdown of the system architecture, microservices design, and Mermaid sequence diagrams, see [docs/description.md](docs/description.md).

---

## Architecture & Service Map

| Service / Component | Port | Description |
| :--- | :--- | :--- |
| **API Gateway** | `8080` | Ingress reverse proxy, request routing, `X-Correlation-ID` propagation, rate limiting & aggregated health checks |
| **PostgreSQL 16** | `5432` | Relational metadata persistence (`music_catalog` and `music_playlist` databases) |
| **Redis 7** | `6379` | In-memory distributed caching & gateway rate limiting |
| **RabbitMQ 3** | `5672` / `15672` | AMQP message broker for asynchronous media transcoding jobs & web management dashboard |
| **MinIO S3** | `9000` / `9001` | High-performance S3-compatible object storage (`raw-audio` and `processed-audio` buckets) & console UI |
| **Catalog Service** | `3001` | Prisma/PostgreSQL catalog (artists, albums, tracks, genres), search, Redis-cached listings |
| **Frontend** | `5173` | React 19 + Vite + Tailwind SPA (browse and live search) |
| **Shared Contracts** | N/A | `@music/shared` monorepo package exporting domain models, events, range utils, and Zod schemas |

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

> **Note:** On first startup, the setup container automatically initializes the PostgreSQL databases (`music_catalog`, `music_playlist`) and configures MinIO storage buckets (`raw-audio`, `processed-audio`).

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

### 6. Set Up the Catalog Database

Apply the Prisma migrations and load the sample artists, albums and tracks (the seed is idempotent):

```bash
pnpm --filter @music/catalog exec prisma generate
pnpm --filter @music/catalog exec prisma migrate deploy
pnpm seed
```

### 7. Run the Automated Test Suite

Catalog tests run against the live PostgreSQL and Redis containers, so complete steps 3 and 6 first:

```bash
pnpm test
```

### 8. Start the Services

Run each in its own terminal. Dev mode gives hot reload:

```bash
pnpm --filter @music/catalog dev    # Catalog Service  -> http://localhost:3001
pnpm --filter @music/gateway dev    # API Gateway      -> http://localhost:8080
pnpm --filter @music/frontend dev   # React frontend   -> http://localhost:5173
```

Or run the compiled builds with `pnpm --filter <package> start` (`@music/catalog`, `@music/gateway`). The frontend dev server proxies `/api/*` to the gateway; set `GATEWAY_URL` to point it elsewhere.

Open **http://localhost:5173** to browse the catalog and use the live search.

> **Note:** The Playlist, Ingestion and Streaming services are not implemented yet (tickets 03-05). Their gateway routes return `503` until they exist.

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

`/api/catalog/*` is also routed to the Catalog Service. All responses use the `{ success, data, meta }` envelope.

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
├── docs/               # System architecture & sequence specifications
│   └── description.md
├── frontend/           # React + Vite + Tailwind SPA
├── gateway/            # Express ingress reverse proxy & health aggregator
├── scripts/            # Infrastructure bootstrap & database init scripts
├── services/           # Backend microservices (Catalog, Playlist, Ingestion, Streaming)
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

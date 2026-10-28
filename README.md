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

### 4. Build Workspace Packages

Compile TypeScript packages across the monorepo:

```bash
pnpm build
```

### 5. Run the Automated Test Suite

Run unit and integration tests across all packages:

```bash
pnpm test
```

### 6. Start the API Gateway

Start the API Gateway in development mode with hot reload:

```bash
pnpm --filter @music/gateway dev
```

Or run the compiled production build:

```bash
pnpm --filter @music/gateway start
```

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

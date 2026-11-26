[← Back to README](../README.md) · **[Overview](description.md)** · **[Architecture](architecture.md)** · **[Setup & Run](setup-and-run.md)** · **[API Reference](api-reference.md)** · **[Verification](verification.md)** · **[Resume Guide](resume-guide.md)**

---

# Product Specification & Requirements: Distributed Music Streaming Platform

## 1. Executive Summary & Problem Statement

Modern audio streaming platforms require handling two conflicting workload profiles simultaneously:
1. **Lightweight, High-Throughput Metadata Operations**: Instant live search, genre filtering, playlist reordering, and profile browsing.
2. **Compute-Intensive Multimedia Operations**: Transcoding lossless audio assets (FLAC/WAV) to optimized bitrates, extracting high-resolution visual waveform peaks, and delivering high-throughput byte slices with sub-second latency.

This platform solves this challenge by decoupling responsibilities into an **Event-Driven Microservices Architecture**, keeping the user-facing API responsive while offloading multimedia pipelines to containerized background worker pools.

---

## 2. Core Functional Requirements

### 2.1. Ingress & Edge Protection
- A single API Gateway serves as the perimeter security boundary.
- Intercepts and validates JWT tokens, enforcing guest vs. authenticated member permissions.
- Enforces distributed sliding-window rate limiting per client IP backed by Redis.
- Injects and propagates an immutable `X-Correlation-ID` across all internal service calls.

### 2.2. Catalog Discovery & Instant Search
- Relational schema modeling artists, albums, tracks, and genre classifications.
- Redis-backed caching layer for high-frequency catalog listings with automatic cache eviction.
- Instant, debounced live multi-entity search across tracks, artists, and albums.

### 2.3. Asynchronous Multimedia Ingestion Pipeline
- Fast multipart audio upload endpoint responding immediately with `HTTP 202 Accepted`.
- Object storage persistence for uncompressed master files (MinIO S3).
- Decoupled job dispatch via RabbitMQ with manual acknowledgments and dead-letter queues (DLQ).
- Automated FFmpeg transcoding to 320 kbps web-streaming MP3 and extraction of **128 normalized amplitude peak floats** for client waveforms.

### 2.4. Low-Latency Media Delivery (HTTP 206)
- RFC 7233 byte-range audio streaming server delivering arbitrary media slices directly from object storage.
- Sub-200ms Time-To-First-Byte (TTFB) without loading entire audio files into browser memory.

### 2.5. Persistent Client-Side Audio Shell
- React 19 Single Page Application (SPA) with a root `<audio>` context mounted above dynamic routing.
- Guaranteed zero playback disruption across route transitions (`/browse`, `/search`, `/playlists`, `/upload`).
- Interactive `<WaveformVisualizer />` rendering the 128 amplitude peaks with hover preview and scrub-to-seek functionality.

---

## 3. Detailed Technical Documentation

For in-depth technical implementation, flow diagrams, and operating runbooks, see:

- **[System Architecture & Sequence Diagrams](architecture.md)** — Microservices topology, event queues, and security model.
- **[Setup & Runbook](setup-and-run.md)** — Step-by-step local setup, Docker compose, migrations, and turnkey seeding.
- **[API Reference](api-reference.md)** — Complete endpoint specifications, headers, and error codes.
- **[Verification & Benchmark Guide](verification.md)** — Automated test suites, manual verification curls, and latency benchmarks.
- **[Resume & Talking Points Guide](resume-guide.md)** — Architectural trade-offs and quantifiable resume metrics.

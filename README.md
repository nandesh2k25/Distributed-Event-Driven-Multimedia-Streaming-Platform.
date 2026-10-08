# Distributed-Event-Driven-Multimedia-Streaming-Platform.
A distributed, event-driven audio streaming platform featuring asynchronous FFmpeg ingestion, HTTP 206 partial-content streaming, and persistent client-side playback.

## Sytem Diagram
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Gateway as API Gateway
    participant Catalog as Catalog Service
    participant Playlist as Playlist Service
    participant Ingestion as Ingestion Service
    participant Worker as Worker (FFmpeg)
    participant CDN as Streaming / CDN

    Note over Gateway: API Gateway is the single entry point for all clients

    %% Flow 1: Browsing
    User->>Gateway: sends request (browse catalog)
    Gateway->>Catalog: routes request
    Catalog-->>Gateway: processes request & returns tracks
    Gateway-->>User: sends response (tracklist & waveforms)

    %% Flow 2: Playlist
    User->>Gateway: sends request (add to playlist)
    Gateway->>Playlist: routes request
    Playlist-->>Gateway: processes request & persists state
    Gateway-->>User: sends response (playlist updated)

    %% Flow 3: Asynchronous Upload & Transcoding
    User->>Gateway: sends request (upload raw audio)
    Gateway->>Ingestion: forwards upload
    Ingestion-->>Gateway: HTTP 202 Accepted (processing)
    Gateway-->>User: sends response (track queued)
    Ingestion->>Worker: queues transcoding task via broker
    Note over Worker: Runs FFmpeg (transcodes to MP3/AAC & extracts peaks)
    Worker->>Catalog: registers metadata & waveform peaks

    %% Flow 4: Audio Streaming
    User->>CDN: sends request (GET /stream with Range: bytes=0-1MB)
    CDN-->>User: HTTP 206 Partial Content (streams initial audio chunk)
```
[← Back to README](../README.md) · **[Overview](description.md)** · **[Architecture](architecture.md)** · **[Setup & Run](setup-and-run.md)** · **[API Reference](api-reference.md)** · **[Verification](verification.md)** · **[Resume Guide](resume-guide.md)**

---

# API Reference & Route Catalog

All requests enter via the **API Gateway** on port `8080`. Private microservices are not exposed publicly.

---

## 1. Response Envelope Conventions

All non-streaming endpoints adhere strictly to standardized envelopes from `@music/shared`.

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "details": []
  }
}
```

### Ingress Headers
- `X-Correlation-ID`: Generated UUIDv4 or propagated from incoming request.
- `X-RateLimit-Limit`: Maximum requests permitted per minute (e.g. `300`).
- `X-RateLimit-Remaining`: Remaining request capacity in sliding window.
- `Retry-After`: Returned with `HTTP 429 Too Many Requests`.

---

## 2. Route Specification

**Auth Requirement Keys**:
- `None`: Open to guest requests.
- `Member`: Requires `Authorization: Bearer <JWT>`.
- `Free/Member`: Free tracks stream without token; premium tracks require valid Bearer token.

### 2.1. Authentication Service (`/api/auth/*`)

| Method | Path | Auth | Description | Status Codes |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/auth/signup` | None | Create account. Body: `{ email, password, displayName }`. | `201`, `400`, `409` |
| `POST` | `/api/auth/login` | None | Authenticate with credentials. Body: `{ email, password }`. | `200`, `401` |
| `GET` | `/api/auth/me` | Member | Retrieve currently authenticated user profile. | `200`, `401` |

### 2.2. Catalog Service (`/api/*`)

| Method | Path | Auth | Description | Status Codes |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/tracks` | None | Paginated tracks. Query: `page`, `limit`, `genre`, `artistId`, `albumId`, `search`. | `200`, `400` |
| `GET` | `/api/tracks/:id` | None | Track details including 128 normalized amplitude peak floats. | `200`, `404` |
| `GET` | `/api/albums` | None | List albums with artist information. | `200` |
| `GET` | `/api/albums/:id` | None | Single album details with ordered tracklist. | `200`, `404` |
| `GET` | `/api/artists` | None | List artists with track & album counts. | `200` |
| `GET` | `/api/artists/:id` | None | Artist profile with top tracks and discography. | `200`, `404` |
| `GET` | `/api/genres` | None | List all available genres. | `200` |
| `GET` | `/api/search` | None | Live search across tracks, artists, and albums. Query: `q`. | `200` |

### 2.3. Media Streaming Edge (`/api/stream/*`)

| Method | Path | Auth | Description | Status Codes |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/stream/:trackId` | Free/Member | RFC 7233 partial content audio delivery. Honors `Range: bytes=<start>-<end>`. Accepts `?access_token=` for audio elements. | `206`, `200`, `401`, `404`, `416` |

### 2.4. Ingestion Service (`/api/ingest/*`)

| Method | Path | Auth | Description | Status Codes |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/ingest/upload` | Member | Multipart audio upload. Fields: `title`, `artistName`, `genre`, optional `albumTitle`, `file`. Dispatches async transcoding job. | `202`, `400`, `413` |

### 2.5. Playlist Service (`/api/playlists/*`, `/api/favorites/*`)

| Method | Path | Auth | Description | Status Codes |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/playlists` | Member | Fetch all playlists created by the authenticated user. | `200`, `401` |
| `POST` | `/api/playlists` | Member | Create a new playlist. Body: `{ title, description?, isPublic? }`. | `201`, `400`, `401` |
| `GET` | `/api/playlists/:id` | Member | Fetch playlist details with ordered track list. | `200`, `404` |
| `DELETE` | `/api/playlists/:id` | Member | Delete a playlist owned by the user. | `204`, `404` |
| `POST` | `/api/playlists/:id/tracks` | Member | Add a track to playlist. Body: `{ trackId }`. | `200`, `409` |
| `PUT` | `/api/playlists/:id/tracks/order` | Member | Drag-and-drop reorder playlist tracks. Body: `{ trackIds: string[] }`. | `200`, `400` |
| `DELETE` | `/api/playlists/:id/tracks/:trackId` | Member | Remove a track from playlist; automatically renumbers positions. | `204`, `404` |
| `GET` | `/api/favorites` | Member | List all favorited tracks for user. | `200`, `401` |
| `PUT` | `/api/favorites/:trackId` | Member | Mark track as favorite (idempotent). | `200`, `401` |
| `DELETE` | `/api/favorites/:trackId` | Member | Remove track from favorites (idempotent). | `204`, `401` |
| `POST` | `/api/favorites/:trackId/toggle` | Member | Toggle favorite state and return new state. | `200`, `401` |

### 2.6. Ingress Health Probe (`/health`)

| Method | Path | Auth | Description | Status Codes |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/health` | None | Aggregated live dependency status for PostgreSQL, Redis, RabbitMQ, and MinIO. | `200`, `503` |

---

## 3. Standard Error Codes Reference

| Error Code | HTTP Status | Description |
| :--- | :---: | :--- |
| `VALIDATION_ERROR` | `400` | Payload failed Zod schema validation. |
| `INVALID_FILE_TYPE` | `400` | Uploaded audio MIME type not supported. |
| `FILE_TOO_LARGE` | `413` | Upload payload exceeds 100MB limit. |
| `LOGIN_REQUIRED` | `401` | Accessing premium or member-only endpoint without token. |
| `TOKEN_INVALID` | `401` | Expired, malformed, or invalid signature on Bearer token. |
| `TRACK_NOT_FOUND` | `404` | Track ID does not exist in catalog or is not ready. |
| `DUPLICATE_TRACK` | `409` | Track is already added to playlist. |
| `RATE_LIMITED` | `429` | Client exceeded 300 requests/minute sliding window. |
| `CATALOG_UNAVAILABLE`| `502` | Downstream service could not reach Catalog Service. |
| `SERVICE_UNAVAILABLE`| `503` | API Gateway cannot reach target microservice. |

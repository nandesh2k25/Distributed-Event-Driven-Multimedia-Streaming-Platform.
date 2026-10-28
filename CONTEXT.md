# Domain language

Terms used in code, tests and reviews. Add a term here when a module is named after it.

## Catalog

**Catalog** — the Catalog Service and its PostgreSQL data: tracks, artists, albums, genres. Other services reach it only over HTTP.

**Catalog cache** — the Catalog's read cache (`services/catalog/src/cache`). Services read through `remember(scope, args, ttl, load)` and announce writes with `catalogChanged()`; key shapes are private to the module. Two adapters: Redis (production) and in-memory (tests), held to one contract suite.

**Generation** — the number embedded in every cached key. `catalogChanged()` increments it, which makes every earlier entry unreachable at once; old entries are left to expire by TTL. A read captures the generation *before* it loads, so a slow read that finishes after a write can never be served.

**Coarse invalidation** — any Catalog write invalidates every cached read. Chosen over per-write invalidation tables because writes are rare (an upload finishing, a find-or-create) and TTLs are short, and it removes the class of bug where a writer and a reader disagree about a key pattern.

## Cross-service access to the Catalog

**Catalog client** — the one interface other services use to talk to the Catalog (`@music/shared`, `src/catalog`). Operations are domain operations, not HTTP endpoints: `getTrack`, `getTracks`, `registerUpload`, `markTrackReady`, `markTrackFailed`. Callers receive it by injection and may depend on a narrow slice of it (the worker needs only the two `markTrack*` operations). It is uncached; callers cache if they need to (streaming keeps a 60-second storage-key cache).

**Catalog client adapters** — two satisfy the interface: the HTTP adapter (production; 5 s timeout, reads retried once, writes never retried) and the in-memory adapter (`@music/shared/testing`; used by every service's tests). Both run the same contract suite, the HTTP one against the real Catalog and database, which is what keeps the in-memory one honest.

**Register an upload** — `registerUpload` finds-or-creates the artist, album and genre (names match case-insensitively) and creates a `PROCESSING` placeholder track in one Catalog transaction. Replaced ingestion making four separate calls.

**CatalogUnavailableError** — the single failure for a Catalog call that did not complete (unreachable, timed out, 5xx, or a rejected request; it carries `status` when there is one). "Does not exist" is not an error: `getTrack` returns `null`, `getTracks` omits the id. Services map it to `502 CATALOG_UNAVAILABLE`.

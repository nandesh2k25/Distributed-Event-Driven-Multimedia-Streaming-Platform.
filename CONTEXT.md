# Domain language

Terms used in code, tests and reviews. Add a term here when a module is named after it.

## Catalog

**Catalog** — the Catalog Service and its PostgreSQL data: tracks, artists, albums, genres. Other services reach it only over HTTP.

**Catalog cache** — the Catalog's read cache (`services/catalog/src/cache`). Services read through `remember(scope, args, ttl, load)` and announce writes with `catalogChanged()`; key shapes are private to the module. Two adapters: Redis (production) and in-memory (tests), held to one contract suite.

**Generation** — the number embedded in every cached key. `catalogChanged()` increments it, which makes every earlier entry unreachable at once; old entries are left to expire by TTL. A read captures the generation *before* it loads, so a slow read that finishes after a write can never be served.

**Coarse invalidation** — any Catalog write invalidates every cached read. Chosen over per-write invalidation tables because writes are rare (an upload finishing, a find-or-create) and TTLs are short, and it removes the class of bug where a writer and a reader disagree about a key pattern.

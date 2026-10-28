import type { PrismaClient } from '@prisma/client';
import type { CatalogCache } from '../cache/catalog-cache.js';

/** What every catalog service is built from. Production wires Postgres + Redis; tests wire an in-memory cache. */
export interface CatalogDeps {
  prisma: PrismaClient;
  cache: CatalogCache;
}

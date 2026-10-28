/**
 * The Catalog's read cache. Callers describe *what* they read (a scope plus arguments) and
 * *that something changed*; key shapes and invalidation live behind this interface.
 *
 * Invalidation is deliberately coarse: any catalog write calls `catalogChanged()` and every
 * cached read becomes unreachable. Writes are rare and TTLs are short, so the lost warmth is
 * cheap, and there is no table of "which write invalidates which read" to get wrong.
 */
export interface CatalogCache {
  /**
   * Returns the cached value for (scope, args), or runs `load`, stores the result for
   * `ttlSeconds` and returns it. A failing `load` is never cached. Never throws because of the
   * cache itself: if the backing store is unavailable, `load` simply runs every time.
   *
   * A value computed while `catalogChanged()` runs is never served afterwards: results are
   * stored under the generation that was current when the read *started*.
   *
   * Hits are returned in their JSON form (e.g. Dates become ISO strings) in every adapter.
   */
  remember<T>(scope: string, args: readonly unknown[], ttlSeconds: number, load: () => Promise<T>): Promise<T>;

  /** Makes every cached read unreachable. Call after any write to catalog data. */
  catalogChanged(): Promise<void>;

  /** Whether the backing store is reachable; reported by the health endpoint. */
  health(): Promise<'up' | 'down' | 'error'>;

  close(): Promise<void>;
}

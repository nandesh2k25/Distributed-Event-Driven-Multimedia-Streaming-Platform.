export interface TrackResolver {
  /** Returns the storage key of a playable track, or null if unknown / not ready. */
  resolve(trackId: string, correlationId?: string): Promise<string | null>;
}

interface CacheEntry {
  key: string | null;
  expiresAt: number;
}

/** Looks tracks up in the Catalog Service over HTTP, with a short in-memory cache. */
export function createCatalogResolver(catalogUrl: string, ttlMs: number): TrackResolver {
  const cache = new Map<string, CacheEntry>();

  return {
    async resolve(trackId, correlationId) {
      const hit = cache.get(trackId);
      if (hit && hit.expiresAt > Date.now()) return hit.key;

      const res = await fetch(`${catalogUrl}/api/tracks/${encodeURIComponent(trackId)}`, {
        headers: correlationId ? { 'x-correlation-id': correlationId } : {}
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Catalog lookup failed (${res.status})`);

      const body = (await res.json()) as { data?: { storageKey?: string | null; status?: string } };
      const track = body.data;
      const key = track && track.status === 'READY' && track.storageKey ? track.storageKey : null;
      cache.set(trackId, { key, expiresAt: Date.now() + ttlMs });
      return key;
    }
  };
}

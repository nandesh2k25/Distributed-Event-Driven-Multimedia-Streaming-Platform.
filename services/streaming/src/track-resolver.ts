import type { CatalogClient } from '@music/shared';

export interface TrackResolver {
  /** Returns the storage key of a playable track, or null if unknown / not ready. */
  resolve(trackId: string, correlationId?: string): Promise<string | null>;
}

interface CacheEntry {
  key: string | null;
  expiresAt: number;
}

/**
 * Resolves a track to its storage key through the Catalog client. Every seek in the player
 * produces a Range request, so answers are cached briefly here; this is the only caller where a
 * short delay in seeing a track become READY is harmless, which is why the cache is not in the client.
 */
export function createCatalogResolver(catalog: CatalogClient, ttlMs: number, now: () => number = Date.now): TrackResolver {
  const cache = new Map<string, CacheEntry>();

  return {
    async resolve(trackId, correlationId) {
      const hit = cache.get(trackId);
      if (hit && hit.expiresAt > now()) return hit.key;

      const track = await catalog.getTrack(trackId, { correlationId });
      const key = track && track.status === 'READY' && track.storageKey ? track.storageKey : null;
      cache.set(trackId, { key, expiresAt: now() + ttlMs });
      return key;
    }
  };
}

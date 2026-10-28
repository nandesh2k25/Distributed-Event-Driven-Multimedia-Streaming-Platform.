import type { CatalogClient } from '@music/shared';

export interface PlayableTrack {
  storageKey: string;
  isFree: boolean;
}

export interface TrackResolver {
  /** Returns what is needed to serve a playable track, or null if unknown / not ready. */
  resolve(trackId: string, correlationId?: string): Promise<PlayableTrack | null>;
}

interface CacheEntry {
  track: PlayableTrack | null;
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
      if (hit && hit.expiresAt > now()) return hit.track;

      const track = await catalog.getTrack(trackId, { correlationId });
      const playable =
        track && track.status === 'READY' && track.storageKey
          ? { storageKey: track.storageKey, isFree: track.isFree !== false }
          : null;
      cache.set(trackId, { track: playable, expiresAt: now() + ttlMs });
      return playable;
    }
  };
}

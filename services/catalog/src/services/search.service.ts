import { TrackStatus } from '@prisma/client';
import { config } from '../config.js';
import type { CatalogDeps } from './deps.js';

export interface SearchResult {
  tracks: any[];
  artists: any[];
  albums: any[];
  query: string;
}

export function createSearchService({ prisma, cache }: CatalogDeps) {
  return {
    async search(query: string, limit: number = 10): Promise<SearchResult> {
      const trimmed = query.trim();
      if (!trimmed) return { tracks: [], artists: [], albums: [], query: '' };

      return cache.remember('search', [trimmed.toLowerCase(), limit], config.searchCacheTtlSeconds, async () => {
        const searchFilter = { contains: trimmed, mode: 'insensitive' as const };

        const [tracks, artists, albums] = await prisma.$transaction([
          prisma.track.findMany({
            where: {
              status: TrackStatus.READY,
              OR: [{ title: searchFilter }, { artist: { name: searchFilter } }, { genre: { name: searchFilter } }]
            },
            take: limit,
            orderBy: { playCount: 'desc' },
            include: { artist: true, album: true, genre: true }
          }),
          prisma.artist.findMany({
            where: { name: searchFilter },
            take: limit,
            include: { _count: { select: { tracks: true, albums: true } } }
          }),
          prisma.album.findMany({
            where: { OR: [{ title: searchFilter }, { artist: { name: searchFilter } }] },
            take: limit,
            include: { artist: true, _count: { select: { tracks: true } } }
          })
        ]);

        return {
          tracks: tracks.map((t) => ({ ...t, genre: t.genre?.name || 'Unknown' })),
          artists,
          albums,
          query: trimmed
        };
      });
    }
  };
}

export type SearchService = ReturnType<typeof createSearchService>;

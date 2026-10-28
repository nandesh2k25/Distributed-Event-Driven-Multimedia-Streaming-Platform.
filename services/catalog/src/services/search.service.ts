import { TrackStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getCache, setCache } from '../lib/redis.js';
import { config } from '../config.js';

export interface SearchResult {
  tracks: any[];
  artists: any[];
  albums: any[];
  query: string;
}

export class SearchService {
  async search(query: string, limit: number = 10): Promise<SearchResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { tracks: [], artists: [], albums: [], query: '' };
    }

    const cacheKey = `catalog:search:${trimmed.toLowerCase()}:${limit}`;
    const cached = await getCache<SearchResult>(cacheKey);
    if (cached) return cached;

    const searchFilter = { contains: trimmed, mode: 'insensitive' as const };

    const [tracks, artists, albums] = await prisma.$transaction([
      prisma.track.findMany({
        where: {
          status: TrackStatus.READY,
          OR: [
            { title: searchFilter },
            { artist: { name: searchFilter } },
            { genre: { name: searchFilter } }
          ]
        },
        take: limit,
        orderBy: { playCount: 'desc' },
        include: {
          artist: true,
          album: true,
          genre: true
        }
      }),
      prisma.artist.findMany({
        where: {
          name: searchFilter
        },
        take: limit,
        include: {
          _count: {
            select: { tracks: true, albums: true }
          }
        }
      }),
      prisma.album.findMany({
        where: {
          OR: [
            { title: searchFilter },
            { artist: { name: searchFilter } }
          ]
        },
        take: limit,
        include: {
          artist: true,
          _count: {
            select: { tracks: true }
          }
        }
      })
    ]);

    const formattedTracks = tracks.map((t) => ({
      ...t,
      genre: t.genre?.name || 'Unknown'
    }));

    const result: SearchResult = {
      tracks: formattedTracks,
      artists,
      albums,
      query: trimmed
    };

    await setCache(cacheKey, result, config.searchCacheTtlSeconds);
    return result;
  }
}

export const searchService = new SearchService();

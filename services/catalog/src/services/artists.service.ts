import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getCache, setCache } from '../lib/redis.js';

export class ArtistsService {
  async listArtists(search?: string) {
    const cacheKey = `catalog:artists:${search || ''}`;
    const cached = await getCache<any[]>(cacheKey);
    if (cached) return cached;

    const where: Prisma.ArtistWhereInput = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const artists = await prisma.artist.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            tracks: true,
            albums: true
          }
        }
      }
    });

    await setCache(cacheKey, artists, 180);
    return artists;
  }

  async getArtistById(id: string) {
    const cacheKey = `catalog:artist:${id}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) return cached;

    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        albums: {
          orderBy: { releaseYear: 'desc' },
          include: {
            _count: {
              select: { tracks: true }
            }
          }
        },
        tracks: {
          where: { status: 'READY' },
          orderBy: { playCount: 'desc' },
          take: 20,
          include: {
            album: true,
            genre: true
          }
        }
      }
    });

    if (!artist) return null;

    const formattedTracks = artist.tracks.map((t) => ({
      ...t,
      genre: t.genre?.name || 'Unknown'
    }));

    const result = {
      ...artist,
      tracks: formattedTracks
    };

    await setCache(cacheKey, result, 300);
    return result;
  }
}

export const artistsService = new ArtistsService();

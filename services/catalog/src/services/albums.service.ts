import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getCache, setCache } from '../lib/redis.js';

export class AlbumsService {
  async listAlbums(artistId?: string, search?: string) {
    const cacheKey = `catalog:albums:${artistId || ''}:${search || ''}`;
    const cached = await getCache<any[]>(cacheKey);
    if (cached) return cached;

    const where: Prisma.AlbumWhereInput = {};
    if (artistId) {
      where.artistId = artistId;
    }
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const albums = await prisma.album.findMany({
      where,
      orderBy: { releaseYear: 'desc' },
      include: {
        artist: true,
        _count: {
          select: { tracks: true }
        }
      }
    });

    await setCache(cacheKey, albums, 180);
    return albums;
  }

  async getAlbumById(id: string) {
    const cacheKey = `catalog:album:${id}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) return cached;

    const album = await prisma.album.findUnique({
      where: { id },
      include: {
        artist: true,
        tracks: {
          orderBy: { trackNumber: 'asc' },
          include: {
            genre: true,
            artist: true
          }
        }
      }
    });

    if (!album) return null;

    const formattedTracks = album.tracks.map((t) => ({
      ...t,
      genre: t.genre?.name || 'Unknown'
    }));

    const result = {
      ...album,
      tracks: formattedTracks
    };

    await setCache(cacheKey, result, 300);
    return result;
  }
}

export const albumsService = new AlbumsService();

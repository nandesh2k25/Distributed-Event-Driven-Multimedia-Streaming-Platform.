import { prisma } from '../lib/prisma.js';
import { getCache, setCache } from '../lib/redis.js';

export class GenresService {
  async listGenres() {
    const cacheKey = 'catalog:genres';
    const cached = await getCache<any[]>(cacheKey);
    if (cached) return cached;

    const genres = await prisma.genre.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { tracks: true }
        }
      }
    });

    await setCache(cacheKey, genres, 300);
    return genres;
  }
}

export const genresService = new GenresService();

import type { Prisma } from '@prisma/client';
import type { CatalogDeps } from './deps.js';

export function createArtistsService({ prisma, cache }: CatalogDeps) {
  return {
    listArtists(search?: string) {
      return cache.remember('artists', [search], 180, () => {
        const where: Prisma.ArtistWhereInput = {};
        if (search) where.name = { contains: search, mode: 'insensitive' };

        return prisma.artist.findMany({
          where,
          orderBy: { name: 'asc' },
          include: { _count: { select: { tracks: true, albums: true } } }
        });
      });
    },

    getArtistById(id: string) {
      return cache.remember('artist', [id], 300, async () => {
        const artist = await prisma.artist.findUnique({
          where: { id },
          include: {
            albums: {
              orderBy: { releaseYear: 'desc' },
              include: { _count: { select: { tracks: true } } }
            },
            tracks: {
              where: { status: 'READY' },
              orderBy: { playCount: 'desc' },
              take: 20,
              include: { album: true, genre: true }
            }
          }
        });
        if (!artist) return null;

        return {
          ...artist,
          tracks: artist.tracks.map((t) => ({ ...t, genre: t.genre?.name || 'Unknown' }))
        };
      });
    }
  };
}

export type ArtistsService = ReturnType<typeof createArtistsService>;

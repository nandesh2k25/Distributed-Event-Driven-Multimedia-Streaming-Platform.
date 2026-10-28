import type { Prisma } from '@prisma/client';
import type { CatalogDeps } from './deps.js';

export function createAlbumsService({ prisma, cache }: CatalogDeps) {
  return {
    listAlbums(artistId?: string, search?: string) {
      return cache.remember('albums', [artistId, search], 180, () => {
        const where: Prisma.AlbumWhereInput = {};
        if (artistId) where.artistId = artistId;
        if (search) where.title = { contains: search, mode: 'insensitive' };

        return prisma.album.findMany({
          where,
          orderBy: { releaseYear: 'desc' },
          include: { artist: true, _count: { select: { tracks: true } } }
        });
      });
    },

    getAlbumById(id: string) {
      return cache.remember('album', [id], 300, async () => {
        const album = await prisma.album.findUnique({
          where: { id },
          include: {
            artist: true,
            tracks: {
              orderBy: { trackNumber: 'asc' },
              include: { genre: true, artist: true }
            }
          }
        });
        if (!album) return null;

        return {
          ...album,
          tracks: album.tracks.map((t) => ({ ...t, genre: t.genre?.name || 'Unknown' }))
        };
      });
    }
  };
}

export type AlbumsService = ReturnType<typeof createAlbumsService>;

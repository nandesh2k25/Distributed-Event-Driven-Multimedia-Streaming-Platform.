import type { CatalogDeps } from './deps.js';

export function createGenresService({ prisma, cache }: CatalogDeps) {
  return {
    listGenres() {
      return cache.remember('genres', [], 300, () =>
        prisma.genre.findMany({
          orderBy: { name: 'asc' },
          include: { _count: { select: { tracks: true } } }
        })
      );
    }
  };
}

export type GenresService = ReturnType<typeof createGenresService>;

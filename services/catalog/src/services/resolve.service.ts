import type { CatalogDeps } from './deps.js';

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

/** Find-or-create helpers used by the Ingestion Service (names are matched case-insensitively). */
export function createResolveService({ prisma, cache }: CatalogDeps) {
  return {
    async resolveArtist(name: string) {
      const existing = await prisma.artist.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (existing) return existing;
      const artist = await prisma.artist.create({ data: { name } });
      await cache.catalogChanged();
      return artist;
    },

    async resolveGenre(name: string) {
      const genre = await prisma.genre.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name, slug: slugify(name) }
      });
      await cache.catalogChanged();
      return genre;
    },

    async resolveAlbum(title: string, artistId: string) {
      const existing = await prisma.album.findFirst({
        where: { artistId, title: { equals: title, mode: 'insensitive' } }
      });
      if (existing) return existing;
      const album = await prisma.album.create({ data: { title, artistId } });
      await cache.catalogChanged();
      return album;
    }
  };
}

export type ResolveService = ReturnType<typeof createResolveService>;

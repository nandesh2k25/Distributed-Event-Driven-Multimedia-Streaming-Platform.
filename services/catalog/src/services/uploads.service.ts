import { TrackStatus } from '@prisma/client';
import type { RegisterUploadBody } from '@music/shared';
import type { CatalogDeps } from './deps.js';

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

export function createUploadsService({ prisma, cache }: CatalogDeps) {
  return {
    /**
     * Finds-or-creates the artist, album and genre (names match case-insensitively) and creates a
     * PROCESSING placeholder track, all in one transaction. Registrations are serialised with an
     * advisory lock so concurrent uploads for a brand-new artist cannot each create it.
     */
    async registerUpload(input: RegisterUploadBody): Promise<{ trackId: string }> {
      const trackId = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('catalog:register-upload'))`;

        const artist =
          (await tx.artist.findFirst({ where: { name: { equals: input.artistName, mode: 'insensitive' } } })) ??
          (await tx.artist.create({ data: { name: input.artistName } }));

        const genre = await tx.genre.upsert({
          where: { slug: slugify(input.genre) },
          update: {},
          create: { name: input.genre, slug: slugify(input.genre) }
        });

        let albumId: string | undefined;
        if (input.albumTitle) {
          const album =
            (await tx.album.findFirst({ where: { artistId: artist.id, title: { equals: input.albumTitle, mode: 'insensitive' } } })) ??
            (await tx.album.create({ data: { title: input.albumTitle, artistId: artist.id } }));
          albumId = album.id;
        }

        const track = await tx.track.create({
          data: {
            title: input.title,
            artistId: artist.id,
            albumId,
            genreId: genre.id,
            originalFormat: input.originalFormat,
            rawStorageKey: input.rawStorageKey,
            format: 'mp3',
            status: TrackStatus.PROCESSING
          }
        });
        return track.id;
      });

      await cache.catalogChanged();
      return { trackId };
    }
  };
}

export type UploadsService = ReturnType<typeof createUploadsService>;

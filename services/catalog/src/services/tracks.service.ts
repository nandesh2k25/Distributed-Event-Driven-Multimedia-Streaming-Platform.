import { Prisma, TrackStatus } from '@prisma/client';
import type { TrackQuery } from '@music/shared';
import type { CatalogDeps } from './deps.js';

export interface ListTracksOptions extends TrackQuery {
  status?: TrackStatus;
}

export interface CreateTrackData {
  title: string;
  artistId: string;
  albumId?: string | null;
  genreId?: string | null;
  duration?: number;
  bitrate?: number;
  format?: string;
  originalFormat?: string;
  rawStorageKey?: string;
  storageKey?: string;
  waveformPeaks?: number[];
  variants?: any;
  status?: TrackStatus;
}

const withRelations = { artist: true, album: true, genre: true } as const;

export function createTracksService({ prisma, cache }: CatalogDeps) {
  return {
    async listTracks(options: ListTracksOptions) {
      const page = options.page || 1;
      const limit = Math.min(options.limit || 20, 100);
      const skip = (page - 1) * limit;

      const listing = await cache.remember(
        'tracks',
        [page, limit, options.search, options.genre, options.artistId, options.albumId, options.status],
        120,
        async () => {
          const where: Prisma.TrackWhereInput = { status: options.status ?? TrackStatus.READY };
          if (options.artistId) where.artistId = options.artistId;
          if (options.albumId) where.albumId = options.albumId;

          if (options.genre) {
            where.OR = [
              { genre: { slug: { equals: options.genre, mode: 'insensitive' } } },
              { genre: { name: { equals: options.genre, mode: 'insensitive' } } },
              { genreId: options.genre }
            ];
          }

          if (options.search) {
            const searchFilter = { contains: options.search, mode: 'insensitive' as const };
            where.AND = [{ OR: [{ title: searchFilter }, { artist: { name: searchFilter } }] }];
          }

          const [total, tracks] = await prisma.$transaction([
            prisma.track.count({ where }),
            prisma.track.findMany({
              where,
              skip,
              take: limit,
              orderBy: [{ playCount: 'desc' }, { createdAt: 'desc' }],
              include: withRelations
            })
          ]);

          return {
            tracks: tracks.map((track) => ({ ...track, genre: track.genre?.name || 'Unknown' })),
            total,
            totalPages: Math.ceil(total / limit)
          };
        }
      );

      return { ...listing, page, limit };
    },

    getTrackById(id: string) {
      return cache.remember('track', [id], 300, async () => {
        const track = await prisma.track.findUnique({ where: { id }, include: withRelations });
        return track ? { ...track, genre: track.genre?.name || 'Unknown' } : null;
      });
    },

    /** Fetches many tracks in one round-trip (used by the Playlist Service); order is not guaranteed. */
    getTracksByIds(ids: string[]) {
      return prisma.track.findMany({ where: { id: { in: ids } }, include: withRelations });
    },

    async createTrack(data: CreateTrackData) {
      const track = await prisma.track.create({
        data: {
          title: data.title,
          artistId: data.artistId,
          albumId: data.albumId,
          genreId: data.genreId,
          duration: data.duration || 0,
          bitrate: data.bitrate,
          format: data.format || 'mp3',
          originalFormat: data.originalFormat || 'mp3',
          rawStorageKey: data.rawStorageKey,
          storageKey: data.storageKey,
          waveformPeaks: data.waveformPeaks || [],
          variants: data.variants || [],
          status: data.status || TrackStatus.PENDING
        },
        include: withRelations
      });

      await cache.catalogChanged();
      return track;
    },

    async updateTrack(id: string, data: Prisma.TrackUpdateInput) {
      const track = await prisma.track.update({ where: { id }, data, include: withRelations });
      await cache.catalogChanged();
      return track;
    }
  };
}

export type TracksService = ReturnType<typeof createTracksService>;

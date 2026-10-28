import { Prisma, TrackStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getCache, setCache, delCache, delCachePattern } from '../lib/redis.js';
import { TrackQuery } from '@music/shared';

export interface ListTracksOptions extends TrackQuery {
  status?: TrackStatus;
}

export class TracksService {
  async listTracks(options: ListTracksOptions) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const cacheKey = `catalog:tracks:${page}:${limit}:${options.search || ''}:${options.genre || ''}:${options.artistId || ''}:${options.albumId || ''}:${options.status || ''}`;
    const cached = await getCache<{ tracks: any[]; total: number; totalPages: number }>(cacheKey);
    if (cached) {
      return { ...cached, page, limit };
    }

    const where: Prisma.TrackWhereInput = {};

    if (options.status) {
      where.status = options.status;
    } else {
      where.status = TrackStatus.READY;
    }

    if (options.artistId) {
      where.artistId = options.artistId;
    }

    if (options.albumId) {
      where.albumId = options.albumId;
    }

    if (options.genre) {
      where.OR = [
        { genre: { slug: { equals: options.genre, mode: 'insensitive' } } },
        { genre: { name: { equals: options.genre, mode: 'insensitive' } } },
        { genreId: options.genre }
      ];
    }

    if (options.search) {
      const searchFilter = { contains: options.search, mode: 'insensitive' as const };
      where.AND = [
        ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
        {
          OR: [
            { title: searchFilter },
            { artist: { name: searchFilter } }
          ]
        }
      ];
    }

    const [total, tracks] = await prisma.$transaction([
      prisma.track.count({ where }),
      prisma.track.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ playCount: 'desc' }, { createdAt: 'desc' }],
        include: {
          artist: true,
          album: true,
          genre: true
        }
      })
    ]);

    const formattedTracks = tracks.map((track) => ({
      ...track,
      genre: track.genre?.name || 'Unknown'
    }));

    const totalPages = Math.ceil(total / limit);
    const result = { tracks: formattedTracks, total, totalPages, page, limit };

    await setCache(cacheKey, { tracks: formattedTracks, total, totalPages }, 120);

    return result;
  }

  async getTrackById(id: string) {
    const cacheKey = `catalog:track:${id}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) return cached;

    const track = await prisma.track.findUnique({
      where: { id },
      include: {
        artist: true,
        album: true,
        genre: true
      }
    });

    if (!track) return null;

    const formatted = {
      ...track,
      genre: track.genre?.name || 'Unknown'
    };

    await setCache(cacheKey, formatted, 300);
    return formatted;
  }

  /** Fetches many tracks in one round-trip (used by the Playlist Service); order is not guaranteed. */
  async getTracksByIds(ids: string[]) {
    return prisma.track.findMany({
      where: { id: { in: ids } },
      include: { artist: true, album: true, genre: true }
    });
  }

  async createTrack(data: {
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
  }) {
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
      include: {
        artist: true,
        album: true,
        genre: true
      }
    });

    await delCachePattern('catalog:tracks:*');
    await delCachePattern('catalog:search:*');
    return track;
  }

  async updateTrack(id: string, data: Prisma.TrackUpdateInput) {
    const track = await prisma.track.update({
      where: { id },
      data,
      include: {
        artist: true,
        album: true,
        genre: true
      }
    });

    await delCache(`catalog:track:${id}`);
    await delCachePattern('catalog:artist:*');
    await delCachePattern('catalog:album:*');
    await delCachePattern('catalog:tracks:*');
    await delCachePattern('catalog:search:*');
    return track;
  }
}

export const tracksService = new TracksService();

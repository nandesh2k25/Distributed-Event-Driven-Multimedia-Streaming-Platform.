import type { AddTrackToPlaylistInput, CreatePlaylistInput, UpdatePlaylistInput } from '@music/shared';
import type { Playlist, PlaylistTrack, Prisma, PrismaClient } from '../generated/client/index.js';
import type { CatalogClient } from '@music/shared';
import { AppError } from '../http.js';

type Tx = Prisma.TransactionClient;

/** Larger than any real playlist; used to move every row out of the way before renumbering. */
const POSITION_OFFSET = 1_000_000;

export function createPlaylistsService(prisma: PrismaClient, catalog: CatalogClient) {
  /** Serialises writers on one playlist so concurrent adds/reorders cannot interleave. */
  async function lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM playlists WHERE id = ${id} FOR UPDATE`;
  }

  function assertReadable(playlist: Playlist | null, userId: string): Playlist {
    if (!playlist || (playlist.userId !== userId && !playlist.isPublic)) {
      throw new AppError(404, 'PLAYLIST_NOT_FOUND', 'Playlist not found');
    }
    return playlist;
  }

  function assertWritable(playlist: Playlist | null, userId: string): Playlist {
    const readable = assertReadable(playlist, userId);
    if (readable.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'You can only modify your own playlists');
    return readable;
  }

  /**
   * Rewrites positions to 0..n-1 following `orderedRowIds`. (playlistId, position) is unique and
   * Postgres checks it per row, so rows are first lifted clear of the target range; this makes a
   * swap or an insert-in-the-middle safe inside a single transaction.
   */
  async function renumber(tx: Tx, playlistId: string, orderedRowIds: string[]) {
    if (orderedRowIds.length === 0) return;
    await tx.playlistTrack.updateMany({ where: { playlistId }, data: { position: { increment: POSITION_OFFSET } } });
    for (const [position, id] of orderedRowIds.entries()) {
      await tx.playlistTrack.update({ where: { id }, data: { position } });
    }
  }

  const touch = (tx: Tx, id: string) => tx.playlist.update({ where: { id }, data: { updatedAt: new Date() } });

  async function hydrate(rows: PlaylistTrack[], correlationId?: string) {
    const tracks = await catalog.getTracks(rows.map((r) => r.trackId), { correlationId });
    const byId = new Map(tracks.map((t) => [t.id, t]));
    // `track: null` means the catalog no longer has it; the entry stays so it can still be removed.
    return rows.map((r) => ({ trackId: r.trackId, position: r.position, addedAt: r.addedAt, track: byId.get(r.trackId) ?? null }));
  }

  return {
    async list(userId: string) {
      const playlists = await prisma.playlist.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { tracks: true } } }
      });
      return playlists.map(({ _count, ...p }) => ({ ...p, trackCount: _count.tracks }));
    },

    create(userId: string, input: CreatePlaylistInput) {
      return prisma.playlist.create({ data: { ...input, userId } });
    },

    async get(id: string, userId: string, correlationId?: string) {
      const playlist = assertReadable(await prisma.playlist.findUnique({ where: { id } }), userId);
      const rows = await prisma.playlistTrack.findMany({ where: { playlistId: id }, orderBy: { position: 'asc' } });
      return { ...playlist, isOwner: playlist.userId === userId, tracks: await hydrate(rows, correlationId) };
    },

    async update(id: string, userId: string, input: UpdatePlaylistInput) {
      assertWritable(await prisma.playlist.findUnique({ where: { id } }), userId);
      return prisma.playlist.update({ where: { id }, data: input });
    },

    async remove(id: string, userId: string) {
      assertWritable(await prisma.playlist.findUnique({ where: { id } }), userId);
      await prisma.playlist.delete({ where: { id } }); // PlaylistTrack rows cascade
    },

    async addTrack(id: string, userId: string, input: AddTrackToPlaylistInput, correlationId?: string) {
      const found = await catalog.getTracks([input.trackId], { correlationId });
      if (found.length === 0) throw new AppError(404, 'TRACK_NOT_FOUND', `Track '${input.trackId}' does not exist`);

      return prisma.$transaction(async (tx) => {
        await lock(tx, id);
        assertWritable(await tx.playlist.findUnique({ where: { id } }), userId);

        const rows = await tx.playlistTrack.findMany({ where: { playlistId: id }, orderBy: { position: 'asc' } });
        if (rows.some((r) => r.trackId === input.trackId)) {
          throw new AppError(409, 'DUPLICATE_TRACK', 'Track is already in this playlist');
        }

        const created = await tx.playlistTrack.create({
          data: { playlistId: id, trackId: input.trackId, position: rows.length }
        });

        const target = input.position;
        if (target !== undefined && target < rows.length) {
          const ordered = rows.map((r) => r.id);
          ordered.splice(target, 0, created.id);
          await renumber(tx, id, ordered);
        }
        await touch(tx, id);
        return tx.playlistTrack.findUniqueOrThrow({ where: { id: created.id } });
      });
    },

    async removeTrack(id: string, userId: string, trackId: string) {
      await prisma.$transaction(async (tx) => {
        await lock(tx, id);
        assertWritable(await tx.playlist.findUnique({ where: { id } }), userId);

        const rows = await tx.playlistTrack.findMany({ where: { playlistId: id }, orderBy: { position: 'asc' } });
        const target = rows.find((r) => r.trackId === trackId);
        if (!target) throw new AppError(404, 'TRACK_NOT_IN_PLAYLIST', 'Track is not in this playlist');

        await tx.playlistTrack.delete({ where: { id: target.id } });
        await renumber(tx, id, rows.filter((r) => r.id !== target.id).map((r) => r.id)); // close the gap
        await touch(tx, id);
      });
    },

    async reorder(id: string, userId: string, trackIds: string[]) {
      await prisma.$transaction(async (tx) => {
        await lock(tx, id);
        assertWritable(await tx.playlist.findUnique({ where: { id } }), userId);

        const rows = await tx.playlistTrack.findMany({ where: { playlistId: id } });
        const byTrack = new Map(rows.map((r) => [r.trackId, r.id]));
        const requested = new Set(trackIds);
        const isPermutation =
          trackIds.length === rows.length && requested.size === trackIds.length && trackIds.every((t) => byTrack.has(t));
        if (!isPermutation) {
          throw new AppError(400, 'INVALID_ORDER', 'trackIds must list every track in the playlist exactly once');
        }

        await renumber(tx, id, trackIds.map((t) => byTrack.get(t)!));
        await touch(tx, id);
      });
    }
  };
}

export type PlaylistsService = ReturnType<typeof createPlaylistsService>;

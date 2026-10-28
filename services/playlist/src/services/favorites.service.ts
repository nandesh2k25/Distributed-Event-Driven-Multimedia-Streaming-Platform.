import type { PrismaClient } from '../generated/client/index.js';
import type { CatalogClient } from '@music/shared';
import { AppError } from '../http.js';

export function createFavoritesService(prisma: PrismaClient, catalog: CatalogClient) {
  async function assertTrackExists(trackId: string, correlationId?: string) {
    const found = await catalog.getTracks([trackId], { correlationId });
    if (found.length === 0) throw new AppError(404, 'TRACK_NOT_FOUND', `Track '${trackId}' does not exist`);
  }

  return {
    async ids(userId: string): Promise<string[]> {
      const rows = await prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { trackId: true } });
      return rows.map((r) => r.trackId);
    },

    async list(userId: string, correlationId?: string) {
      const rows = await prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
      const tracks = await catalog.getTracks(rows.map((r) => r.trackId), { correlationId });
      const byId = new Map(tracks.map((t) => [t.id, t]));
      return rows.flatMap((r) => (byId.has(r.trackId) ? [{ favoritedAt: r.createdAt, track: byId.get(r.trackId)! }] : []));
    },

    /** Idempotent: favoriting an already-favorited track succeeds. */
    async add(userId: string, trackId: string, correlationId?: string) {
      await assertTrackExists(trackId, correlationId);
      await prisma.favorite.upsert({
        where: { userId_trackId: { userId, trackId } },
        update: {},
        create: { userId, trackId }
      });
      return { trackId, favorited: true };
    },

    /** Idempotent: removing a track that is not a favorite succeeds. */
    async remove(userId: string, trackId: string) {
      await prisma.favorite.deleteMany({ where: { userId, trackId } });
      return { trackId, favorited: false };
    },

    async toggle(userId: string, trackId: string, correlationId?: string) {
      const existing = await prisma.favorite.findUnique({ where: { userId_trackId: { userId, trackId } } });
      return existing ? this.remove(userId, trackId) : this.add(userId, trackId, correlationId);
    }
  };
}

export type FavoritesService = ReturnType<typeof createFavoritesService>;

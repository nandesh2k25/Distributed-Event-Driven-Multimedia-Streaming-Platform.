import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createHttpCatalogClient } from '@music/shared';
import { describeCatalogClientContract } from '@music/shared/testing';
import { createApp } from './app.js';
import { createMemoryCache } from './cache/memory-cache.js';
import { prisma } from './lib/prisma.js';

// The same contract the in-memory adapter passes, run through the HTTP adapter against the real
// Catalog app and database. This is what keeps the in-memory adapter honest.
const cache = createMemoryCache();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp({ prisma, cache }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describeCatalogClientContract({ describe, it, expect }, 'HTTP adapter against the real Catalog', async () => {
  const seededArtist = await prisma.artist.create({ data: { name: `Contract Seed ${randomUUID()}` } });

  return {
    client: createHttpCatalogClient({ baseUrl }),

    seedTrack: async ({ title, status, storageKey }) => {
      const track = await prisma.track.create({
        data: { title, artistId: seededArtist.id, status: status ?? 'READY', storageKey, format: 'mp3' }
      });
      await cache.catalogChanged(); // rows were written behind the Catalog's back
      return track.id;
    },

    // Remove everything this run created: tracks first (artists/albums are Restrict-linked).
    cleanup: async () => {
      const artists = { OR: [{ name: { startsWith: 'Contract Artist' } }, { id: seededArtist.id }] };
      await prisma.track.deleteMany({ where: { artist: artists } });
      await prisma.album.deleteMany({ where: { artist: artists } });
      await prisma.artist.deleteMany({ where: artists });
      await prisma.genre.deleteMany({ where: { slug: 'contract-genre', tracks: { none: {} } } });
      await cache.catalogChanged();
    }
  };
});

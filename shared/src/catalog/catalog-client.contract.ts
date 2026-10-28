import type { describe as Describe, expect as Expect, it as It } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CatalogUnavailableError, type CatalogClient, type TrackReadyData } from './types.js';

/** The test runner's primitives, passed in so this module never imports vitest at runtime. */
export interface TestApi {
  describe: typeof Describe;
  it: typeof It;
  expect: typeof Expect;
}

export interface CatalogHarness {
  client: CatalogClient;
  /** Puts a track in the catalog out-of-band and returns its id. */
  seedTrack(track: { title: string; status?: 'READY' | 'PROCESSING' | 'FAILED'; storageKey?: string }): Promise<string>;
  cleanup?(): Promise<void>;
}

const peaks = Array.from({ length: 128 }, (_, i) => i / 127);
const ready = (storageKey: string): TrackReadyData => ({
  duration: 187.5,
  waveformPeaks: peaks,
  storageKey,
  bitrate: 320,
  format: 'mp3',
  variants: [{ bitrate: 320, codec: 'mp3', s3Key: storageKey, fileSize: 4096 }]
});

/**
 * Behaviour every CatalogClient adapter must have. It runs against the in-memory adapter and
 * against the HTTP adapter talking to the real Catalog, which is what keeps the two honest.
 */
export function describeCatalogClientContract(
  { describe, it, expect }: TestApi,
  name: string,
  make: () => Promise<CatalogHarness>
) {
  describe(`CatalogClient contract: ${name}`, () => {
    const upload = (artistName: string, extra: Record<string, string> = {}) => ({
      title: 'Contract Song',
      artistName,
      genre: 'Contract Genre',
      originalFormat: 'flac',
      rawStorageKey: `raw/${randomUUID()}.flac`,
      ...extra
    });

    async function withHarness(run: (h: CatalogHarness) => Promise<void>) {
      const harness = await make();
      try {
        await run(harness);
      } finally {
        await harness.cleanup?.();
      }
    }

    it('getTrack returns a track in any status, and null for an unknown id', () =>
      withHarness(async ({ client, seedTrack }) => {
        const id = await seedTrack({ title: 'Seeded', status: 'READY', storageKey: 'processed/seeded.mp3' });

        expect(await client.getTrack(id)).toMatchObject({ id, title: 'Seeded', status: 'READY', storageKey: 'processed/seeded.mp3' });
        expect(await client.getTrack(`missing-${randomUUID()}`)).toBeNull();
      }));

    it('getTracks returns the tracks that exist, ignoring unknown and duplicate ids', () =>
      withHarness(async ({ client, seedTrack }) => {
        const a = await seedTrack({ title: 'A' });
        const b = await seedTrack({ title: 'B' });

        const found = await client.getTracks([a, b, a, `missing-${randomUUID()}`]);
        expect(found.map((t) => t.id).sort()).toEqual([a, b].sort());
        expect(await client.getTracks([])).toEqual([]);
        expect(await client.getTracks([`missing-${randomUUID()}`])).toEqual([]);
      }));

    it('registerUpload creates a PROCESSING placeholder with its artist, album and genre', () =>
      withHarness(async ({ client }) => {
        const artistName = `Contract Artist ${randomUUID()}`;
        const { trackId } = await client.registerUpload(upload(artistName, { albumTitle: 'Contract Album' }));

        const track = await client.getTrack(trackId);
        expect(track).toMatchObject({ id: trackId, title: 'Contract Song', status: 'PROCESSING', rawStorageKey: expect.stringMatching(/^raw\//) });
        expect((track as any).artist.name).toBe(artistName);
        expect((track as any).album.title).toBe('Contract Album');
      }));

    it('registerUpload reuses artist, album and genre regardless of case and spacing', () =>
      withHarness(async ({ client }) => {
        const artistName = `Contract Artist ${randomUUID()}`;
        const first = await client.registerUpload(upload(artistName, { albumTitle: 'Same Album' }));
        const second = await client.registerUpload(upload(artistName.toUpperCase(), { albumTitle: 'SAME album', genre: 'contract  genre' }));

        const [a, b] = [await client.getTrack(first.trackId), await client.getTrack(second.trackId)] as any[];
        expect(first.trackId).not.toBe(second.trackId);
        expect(b.artist.id).toBe(a.artist.id);
        expect(b.album.id).toBe(a.album.id);
      }));

    it('registerUpload stays consistent when many uploads for a new artist arrive at once', () =>
      withHarness(async ({ client }) => {
        const artistName = `Contract Artist ${randomUUID()}`;
        const results = await Promise.all(Array.from({ length: 5 }, () => client.registerUpload(upload(artistName))));

        const tracks = (await Promise.all(results.map((r) => client.getTrack(r.trackId)))) as any[];
        expect(new Set(results.map((r) => r.trackId)).size).toBe(5);
        expect(new Set(tracks.map((t) => t.artist.id)).size).toBe(1); // exactly one artist was created
      }));

    it('markTrackReady makes the track READY with its duration, peaks and storage key', () =>
      withHarness(async ({ client }) => {
        const { trackId } = await client.registerUpload(upload(`Contract Artist ${randomUUID()}`));
        expect((await client.getTrack(trackId))?.status).toBe('PROCESSING'); // warms any read cache

        await client.markTrackReady(trackId, ready('processed/contract.mp3'));

        const track = (await client.getTrack(trackId)) as any;
        expect(track).toMatchObject({ status: 'READY', duration: 187.5, storageKey: 'processed/contract.mp3', bitrate: 320 });
        expect(track.waveformPeaks).toHaveLength(128);
        expect((await client.getTracks([trackId]))[0]?.status).toBe('READY');
      }));

    it('markTrackFailed makes the track FAILED', () =>
      withHarness(async ({ client }) => {
        const { trackId } = await client.registerUpload(upload(`Contract Artist ${randomUUID()}`));
        await client.markTrackFailed(trackId);
        expect((await client.getTrack(trackId))?.status).toBe('FAILED');
      }));

    it('rejects writes to a track that does not exist with CatalogUnavailableError', () =>
      withHarness(async ({ client }) => {
        const missing = `missing-${randomUUID()}`;
        await expect(client.markTrackFailed(missing)).rejects.toBeInstanceOf(CatalogUnavailableError);
        await expect(client.markTrackReady(missing, ready('processed/x.mp3'))).rejects.toBeInstanceOf(CatalogUnavailableError);
      }));
  });
}

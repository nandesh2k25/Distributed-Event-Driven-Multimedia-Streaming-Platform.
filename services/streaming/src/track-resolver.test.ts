import { describe, expect, it, vi } from 'vitest';
import { CatalogUnavailableError, type CatalogClient } from '@music/shared';
import { createInMemoryCatalog } from '@music/shared/testing';
import { createCatalogResolver } from './track-resolver.js';

function setup(ttlMs = 60_000) {
  const catalog = createInMemoryCatalog();
  catalog.addTrack({ id: 'ready', status: 'READY', storageKey: 'processed/ready.mp3' });
  catalog.addTrack({ id: 'processing', status: 'PROCESSING', storageKey: null });
  catalog.addTrack({ id: 'no-key', status: 'READY', storageKey: null });

  const getTrack = vi.fn(catalog.getTrack);
  let now = 1_000;
  const resolver = createCatalogResolver({ ...catalog, getTrack } as CatalogClient, ttlMs, () => now);
  return { resolver, getTrack, catalog, advance: (ms: number) => (now += ms) };
}

describe('catalog track resolver', () => {
  it('returns the storage key only for READY tracks that have one', async () => {
    const { resolver } = setup();
    expect(await resolver.resolve('ready')).toEqual({ storageKey: 'processed/ready.mp3', isFree: true });
    expect(await resolver.resolve('processing')).toBeNull();
    expect(await resolver.resolve('no-key')).toBeNull();
    expect(await resolver.resolve('missing')).toBeNull();
  });

  it('forwards the correlation id to the catalog', async () => {
    const { resolver, getTrack } = setup();
    await resolver.resolve('ready', 'cid-7');
    expect(getTrack).toHaveBeenCalledWith('ready', { correlationId: 'cid-7' });
  });

  it('caches answers, including "not playable", until the TTL passes', async () => {
    const { resolver, getTrack, catalog, advance } = setup(60_000);

    await resolver.resolve('ready');
    await resolver.resolve('ready');
    await resolver.resolve('processing');
    await resolver.resolve('processing');
    expect(getTrack).toHaveBeenCalledTimes(2); // one lookup per track

    await catalog.markTrackReady('processing', { duration: 1, waveformPeaks: [], storageKey: 'processed/p.mp3', bitrate: 320, format: 'mp3', variants: [] });
    expect(await resolver.resolve('processing')).toBeNull(); // still the cached answer

    advance(60_001);
    expect(await resolver.resolve('processing')).toMatchObject({ storageKey: 'processed/p.mp3' });
  });

  it('does not cache a catalog outage and lets the error through', async () => {
    const unavailable = vi.fn().mockRejectedValueOnce(new CatalogUnavailableError('down')).mockResolvedValue({ id: 't', title: 't', status: 'READY', duration: 1, storageKey: 'k' });
    const resolver = createCatalogResolver({ getTrack: unavailable } as unknown as CatalogClient, 60_000);

    await expect(resolver.resolve('t')).rejects.toBeInstanceOf(CatalogUnavailableError);
    expect(await resolver.resolve('t')).toEqual({ storageKey: 'k', isFree: true });
  });

  it('reports a track as premium only when the catalog says isFree is false', async () => {
    const { resolver, catalog } = setup();
    catalog.addTrack({ id: 'premium', status: 'READY', storageKey: 'processed/premium.mp3', isFree: false });
    expect((await resolver.resolve('premium'))?.isFree).toBe(false);
  });
});

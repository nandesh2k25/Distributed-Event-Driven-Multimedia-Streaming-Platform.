import { describe, expect, it, vi } from 'vitest';
import { createHttpCatalogClient } from './http-catalog-client.js';
import { CatalogUnavailableError } from './types.js';

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const ok = (data: unknown) => reply(200, { success: true, data });

function client(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, timeoutMs = 50) {
  const fetchMock = vi.fn(fetchImpl);
  return { fetchMock, catalog: createHttpCatalogClient({ baseUrl: 'http://catalog:3001/', timeoutMs, fetch: fetchMock as unknown as typeof fetch }) };
}

describe('HTTP catalog client: request shape', () => {
  it('uses the Catalog paths, forwards the correlation id and unwraps the envelope', async () => {
    const { catalog, fetchMock } = client(async () => ok({ id: 't1', title: 'One', status: 'READY' }));

    expect(await catalog.getTrack('t/1', { correlationId: 'cid-9' })).toMatchObject({ id: 't1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://catalog:3001/api/tracks/t%2F1');
    expect((init.headers as Record<string, string>)['x-correlation-id']).toBe('cid-9');
  });

  it('sends one de-duplicated batch request and skips the call for an empty list', async () => {
    const { catalog, fetchMock } = client(async () => ok([]));

    await catalog.getTracks(['a', 'b', 'a']);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ ids: ['a', 'b'] });

    await catalog.getTracks([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks tracks via PATCH', async () => {
    const { catalog, fetchMock } = client(async () => ok({}));
    await catalog.markTrackFailed('t1');
    expect(fetchMock).toHaveBeenCalledWith('http://catalog:3001/api/tracks/t1', expect.objectContaining({ method: 'PATCH', body: '{"status":"FAILED"}' }));
  });
});

describe('HTTP catalog client: failure model', () => {
  it('treats 404 as "does not exist", not as a failure', async () => {
    const { catalog } = client(async () => reply(404, { success: false }));
    expect(await catalog.getTrack('nope')).toBeNull();
  });

  it('retries a read once after a 5xx and succeeds', async () => {
    let calls = 0;
    const { catalog, fetchMock } = client(async () => (++calls === 1 ? reply(503) : ok({ id: 't1', title: 'One', status: 'READY' })));

    expect(await catalog.getTrack('t1')).toMatchObject({ id: 't1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a read once after a network error, then throws CatalogUnavailableError', async () => {
    const { catalog, fetchMock } = client(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(catalog.getTrack('t1')).rejects.toBeInstanceOf(CatalogUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out a hung request instead of waiting forever', async () => {
    const { catalog } = client((_url, init) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))), 30);
    const started = Date.now();

    await expect(catalog.getTracks(['a'])).rejects.toBeInstanceOf(CatalogUnavailableError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('never retries writes', async () => {
    const { catalog, fetchMock } = client(async () => reply(503));

    await expect(catalog.markTrackReady('t1', { duration: 1, waveformPeaks: [], storageKey: 'k', bitrate: 320, format: 'mp3', variants: [] })).rejects.toBeInstanceOf(CatalogUnavailableError);
    await expect(catalog.registerUpload({ title: 't', artistName: 'a', genre: 'g', originalFormat: 'mp3', rawStorageKey: 'raw/x' })).rejects.toBeInstanceOf(CatalogUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one attempt each
  });

  it('surfaces a rejected request (4xx) as CatalogUnavailableError carrying the status', async () => {
    const { catalog } = client(async () => reply(400, { success: false }));
    await expect(catalog.registerUpload({ title: '', artistName: 'a', genre: 'g', originalFormat: 'mp3', rawStorageKey: 'raw/x' })).rejects.toMatchObject({
      name: 'CatalogUnavailableError',
      status: 400
    });
  });
});

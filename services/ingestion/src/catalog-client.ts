import type { CatalogClient } from './ports.js';

export function createHttpCatalogClient(baseUrl: string): CatalogClient {
  async function call<T>(method: string, path: string, correlationId: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Catalog ${method} ${path} failed (${res.status})`);
    return ((await res.json()) as { data: T }).data;
  }

  return {
    resolveArtist: (name, cid) => call('POST', '/artists/resolve', cid, { name }),
    resolveGenre: (name, cid) => call('POST', '/genres/resolve', cid, { name }),
    resolveAlbum: (title, artistId, cid) => call('POST', '/albums/resolve', cid, { title, artistId }),
    createPlaceholder: (data, cid) =>
      call('POST', '/tracks', cid, { ...data, format: 'mp3', status: 'PROCESSING' }),
    async markFailed(trackId, cid) {
      await call('PATCH', `/tracks/${encodeURIComponent(trackId)}`, cid, { status: 'FAILED' });
    }
  };
}

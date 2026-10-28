import { AppError } from './http.js';

export interface CatalogTrack {
  id: string;
  [key: string]: unknown;
}

export interface CatalogClient {
  /** Returns the tracks that exist; unknown ids are simply absent from the result. */
  getTracks(ids: string[], correlationId?: string): Promise<CatalogTrack[]>;
}

export function createHttpCatalogClient(baseUrl: string): CatalogClient {
  return {
    async getTracks(ids, correlationId) {
      if (ids.length === 0) return [];
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/tracks/batch`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(correlationId ? { 'x-correlation-id': correlationId } : {}) },
          body: JSON.stringify({ ids })
        });
      } catch {
        throw new AppError(502, 'CATALOG_UNAVAILABLE', 'Catalog Service is unreachable');
      }
      if (!res.ok) throw new AppError(502, 'CATALOG_ERROR', `Catalog Service responded with ${res.status}`);
      return ((await res.json()) as { data: CatalogTrack[] }).data;
    }
  };
}

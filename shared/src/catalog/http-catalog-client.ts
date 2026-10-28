import {
  CatalogUnavailableError,
  type CatalogCallContext,
  type CatalogClient,
  type CatalogTrack
} from './types.js';

export interface HttpCatalogClientOptions {
  baseUrl: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 5000;

export function createHttpCatalogClient(options: HttpCatalogClientOptions): CatalogClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetch ?? fetch;

  /**
   * Sends the request. Network errors, timeouts and 5xx responses are "unavailable"; with
   * `retryOnce` they get a second attempt. Any other response is returned for the caller to read.
   */
  async function send(
    method: string,
    path: string,
    body: unknown,
    ctx: CatalogCallContext | undefined,
    retryOnce: boolean
  ): Promise<Response> {
    let failure: CatalogUnavailableError | undefined;

    for (let attempt = 0; attempt < (retryOnce ? 2 : 1); attempt++) {
      try {
        const res = await doFetch(`${baseUrl}/api${path}`, {
          method,
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(ctx?.correlationId ? { 'x-correlation-id': ctx.correlationId } : {})
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (res.status < 500) return res;
        failure = new CatalogUnavailableError(`Catalog ${method} ${path} failed (${res.status})`, res.status);
      } catch (err) {
        failure = new CatalogUnavailableError(`Catalog unreachable for ${method} ${path}: ${(err as Error).message}`);
      }
    }
    throw failure!;
  }

  async function data<T>(res: Response, method: string, path: string): Promise<T> {
    if (!res.ok) throw new CatalogUnavailableError(`Catalog ${method} ${path} was rejected (${res.status})`, res.status);
    return ((await res.json()) as { data: T }).data;
  }

  return {
    async getTrack(id, ctx) {
      const path = `/tracks/${encodeURIComponent(id)}`;
      const res = await send('GET', path, undefined, ctx, true);
      if (res.status === 404) return null;
      return data<CatalogTrack>(res, 'GET', path);
    },

    async getTracks(ids, ctx) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return [];
      const res = await send('POST', '/tracks/batch', { ids: unique }, ctx, true);
      return data<CatalogTrack[]>(res, 'POST', '/tracks/batch');
    },

    async registerUpload(input, ctx) {
      const res = await send('POST', '/tracks/uploads', input, ctx, false);
      return data<{ trackId: string }>(res, 'POST', '/tracks/uploads');
    },

    async markTrackReady(trackId, ready, ctx) {
      const path = `/tracks/${encodeURIComponent(trackId)}`;
      const res = await send('PATCH', path, { status: 'READY', ...ready }, ctx, false);
      await data<unknown>(res, 'PATCH', path);
    },

    async markTrackFailed(trackId, ctx) {
      const path = `/tracks/${encodeURIComponent(trackId)}`;
      const res = await send('PATCH', path, { status: 'FAILED' }, ctx, false);
      await data<unknown>(res, 'PATCH', path);
    }
  };
}

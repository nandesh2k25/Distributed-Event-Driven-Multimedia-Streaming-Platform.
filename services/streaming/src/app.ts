import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { pipeline } from 'node:stream';
import { CatalogUnavailableError, RangeNotSatisfiableError, createErrorResponse, parseRangeHeader } from '@music/shared';
import type { ObjectStorage } from './storage.js';
import type { TrackResolver } from './track-resolver.js';

export interface StreamingDeps {
  storage: ObjectStorage;
  resolver: TrackResolver;
}

export function createApp({ storage, resolver }: StreamingDeps): Express {
  const app: Express = express();
  const logger = pino({ name: 'streaming-service' });

  app.use(cors({ exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'X-Correlation-ID'] }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-correlation-id'] as string) || 'internal'
    })
  );

  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'healthy', service: 'streaming' } });
  });

  const streamHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trackId = req.params.trackId as string;
      const correlationId = req.headers['x-correlation-id'] as string | undefined;

      const key = await resolver.resolve(trackId, correlationId);
      if (!key) {
        res.status(404).json(createErrorResponse('TRACK_NOT_FOUND', `Track '${trackId}' is not available`));
        return;
      }

      const meta = await storage.head(key);
      if (!meta) {
        res.status(404).json(createErrorResponse('AUDIO_NOT_FOUND', 'Audio asset is missing from storage'));
        return;
      }

      let range;
      try {
        range = parseRangeHeader(req.headers.range, meta.size);
      } catch (err) {
        if (err instanceof RangeNotSatisfiableError) {
          res.setHeader('Content-Range', `bytes */${meta.size}`);
          res.status(416).json(createErrorResponse('RANGE_NOT_SATISFIABLE', err.message));
          return;
        }
        throw err;
      }

      const start = range?.start ?? 0;
      const end = range?.end ?? meta.size - 1;

      res.status(range ? 206 : 200);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', meta.contentType);
      res.setHeader('Content-Length', String(end - start + 1));
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      if (range) res.setHeader('Content-Range', range.contentRange);

      if (req.method === 'HEAD' || meta.size === 0) {
        res.end();
        return;
      }

      // Fetch only the requested slice from object storage; skipped bytes are never read.
      const body = await storage.getRange(key, start, end);
      res.on('close', () => body.destroy());
      pipeline(body, res, (err) => {
        if (err && !res.writableEnded) req.log?.warn({ err }, 'Stream interrupted');
      });
    } catch (err) {
      next(err);
    }
  };

  app.get('/api/stream/:trackId', streamHandler);
  app.get('/stream/:trackId', streamHandler);

  app.use((_req, res) => {
    res.status(404).json(createErrorResponse('NOT_FOUND', 'Requested streaming route not found'));
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      req.log?.error({ err }, 'Streaming failed mid-response');
      res.destroy();
      return;
    }
    if (err instanceof CatalogUnavailableError) {
      req.log?.error({ err }, 'Catalog unavailable while resolving track');
      res.status(502).json(createErrorResponse('CATALOG_UNAVAILABLE', 'The catalog is unavailable, please retry'));
      return;
    }
    req.log?.error({ err }, 'Unhandled streaming exception');
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to stream audio'));
  });

  return app;
}

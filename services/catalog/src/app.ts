import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { tracksRouter } from './routes/tracks.routes.js';
import { artistsRouter } from './routes/artists.routes.js';
import { albumsRouter } from './routes/albums.routes.js';
import { genresRouter } from './routes/genres.routes.js';
import { searchRouter } from './routes/search.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createErrorResponse } from '@music/shared';

export function createApp(): Express {
  const app: Express = express();
  const logger = pino({ name: 'catalog-service' });

  app.use(cors());
  app.use(express.json());

  // Correlation ID & Structured Logger
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-correlation-id'] as string) || req.id || 'internal',
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      }
    })
  );

  // Health check
  app.use('/health', healthRouter);

  // Core router combining all sub-routes
  const apiRouter = express.Router();
  apiRouter.use('/tracks', tracksRouter);
  apiRouter.use('/artists', artistsRouter);
  apiRouter.use('/albums', albumsRouter);
  apiRouter.use('/genres', genresRouter);
  apiRouter.use('/search', searchRouter);

  // Mount at root and prefix paths to support transparent gateway reverse proxying
  app.use(apiRouter);
  app.use('/api/catalog', apiRouter);
  app.use('/api', apiRouter);
  app.use('/catalog', apiRouter);

  // 404 Handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json(createErrorResponse('NOT_FOUND', 'Requested catalog route not found'));
  });

  // Global Error Handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, 'Unhandled catalog service exception');
    res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred in Catalog Service', [
        { message: err.message }
      ])
    );
  });

  return app;
}

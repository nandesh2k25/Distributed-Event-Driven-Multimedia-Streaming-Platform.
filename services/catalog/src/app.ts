import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { createErrorResponse } from '@music/shared';
import type { CatalogDeps } from './services/deps.js';
import { createTracksService } from './services/tracks.service.js';
import { createArtistsService } from './services/artists.service.js';
import { createAlbumsService } from './services/albums.service.js';
import { createGenresService } from './services/genres.service.js';
import { createSearchService } from './services/search.service.js';
import { createResolveService } from './services/resolve.service.js';
import { createTracksController } from './controllers/tracks.controller.js';
import { createArtistsController } from './controllers/artists.controller.js';
import { createAlbumsController } from './controllers/albums.controller.js';
import { createGenresController } from './controllers/genres.controller.js';
import { createSearchController } from './controllers/search.controller.js';
import { createResolveController } from './controllers/resolve.controller.js';
import { createTracksRouter } from './routes/tracks.routes.js';
import { createArtistsRouter } from './routes/artists.routes.js';
import { createAlbumsRouter } from './routes/albums.routes.js';
import { createGenresRouter } from './routes/genres.routes.js';
import { createSearchRouter } from './routes/search.routes.js';
import { createHealthRouter } from './routes/health.routes.js';

export function createApp(deps: CatalogDeps): Express {
  const app: Express = express();
  const logger = pino({ name: 'catalog-service' });

  const tracks = createTracksController(createTracksService(deps));
  const artists = createArtistsController(createArtistsService(deps));
  const albums = createAlbumsController(createAlbumsService(deps));
  const genres = createGenresController(createGenresService(deps));
  const search = createSearchController(createSearchService(deps));
  const resolve = createResolveController(createResolveService(deps));

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
  app.use('/health', createHealthRouter(deps));

  // Core router combining all sub-routes
  const apiRouter = express.Router();
  apiRouter.use('/tracks', createTracksRouter(tracks));
  apiRouter.use('/artists', createArtistsRouter(artists, resolve));
  apiRouter.use('/albums', createAlbumsRouter(albums, resolve));
  apiRouter.use('/genres', createGenresRouter(genres, resolve));
  apiRouter.use('/search', createSearchRouter(search));

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

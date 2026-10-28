import express, { Express, NextFunction, Request, Response, Router } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import {
  AddTrackToPlaylistSchema,
  CatalogUnavailableError,
  type CatalogClient,
  CreatePlaylistSchema,
  ReorderPlaylistTracksSchema,
  UpdatePlaylistSchema,
  createErrorResponse,
  createSuccessResponse
} from '@music/shared';
import type { PrismaClient } from './generated/client/index.js';
import { AppError, asyncHandler, correlationIdOf, parse, userIdOf } from './http.js';
import { createFavoritesService } from './services/favorites.service.js';
import { createPlaylistsService } from './services/playlists.service.js';

export interface PlaylistDeps {
  prisma: PrismaClient;
  catalog: CatalogClient;
}

export function createApp({ prisma, catalog }: PlaylistDeps): Express {
  const app: Express = express();
  const logger = pino({ name: 'playlist-service' });
  const playlists = createPlaylistsService(prisma, catalog);
  const favorites = createFavoritesService(prisma, catalog);

  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger, genReqId: (req) => (req.headers['x-correlation-id'] as string) || randomUUID() }));

  app.get('/health', asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, data: { status: 'healthy', service: 'playlist' } });
  }));

  const playlistsRouter = Router();
  playlistsRouter.get('/', asyncHandler(async (req, res) => {
    res.json(createSuccessResponse(await playlists.list(userIdOf(req))));
  }));
  playlistsRouter.post('/', asyncHandler(async (req, res) => {
    const input = parse(CreatePlaylistSchema, req.body);
    res.status(201).json(createSuccessResponse(await playlists.create(userIdOf(req), input)));
  }));
  playlistsRouter.get('/:id', asyncHandler(async (req, res) => {
    res.json(createSuccessResponse(await playlists.get(req.params.id!, userIdOf(req), correlationIdOf(req))));
  }));
  playlistsRouter.patch('/:id', asyncHandler(async (req, res) => {
    const input = parse(UpdatePlaylistSchema, req.body);
    res.json(createSuccessResponse(await playlists.update(req.params.id!, userIdOf(req), input)));
  }));
  playlistsRouter.delete('/:id', asyncHandler(async (req, res) => {
    await playlists.remove(req.params.id!, userIdOf(req));
    res.status(204).end();
  }));
  playlistsRouter.post('/:id/tracks', asyncHandler(async (req, res) => {
    const input = parse(AddTrackToPlaylistSchema, req.body);
    const row = await playlists.addTrack(req.params.id!, userIdOf(req), input, correlationIdOf(req));
    res.status(201).json(createSuccessResponse(row));
  }));
  playlistsRouter.put('/:id/tracks/order', asyncHandler(async (req, res) => {
    const { trackIds } = parse(ReorderPlaylistTracksSchema, req.body);
    await playlists.reorder(req.params.id!, userIdOf(req), trackIds);
    res.json(createSuccessResponse({ trackIds }));
  }));
  playlistsRouter.delete('/:id/tracks/:trackId', asyncHandler(async (req, res) => {
    await playlists.removeTrack(req.params.id!, userIdOf(req), req.params.trackId!);
    res.status(204).end();
  }));

  const favoritesRouter = Router();
  favoritesRouter.get('/', asyncHandler(async (req, res) => {
    res.json(createSuccessResponse(await favorites.list(userIdOf(req), correlationIdOf(req))));
  }));
  favoritesRouter.get('/ids', asyncHandler(async (req, res) => {
    res.json(createSuccessResponse(await favorites.ids(userIdOf(req))));
  }));
  favoritesRouter.put('/:trackId', asyncHandler(async (req, res) => {
    res.json(createSuccessResponse(await favorites.add(userIdOf(req), req.params.trackId!, correlationIdOf(req))));
  }));
  favoritesRouter.delete('/:trackId', asyncHandler(async (req, res) => {
    res.json(createSuccessResponse(await favorites.remove(userIdOf(req), req.params.trackId!)));
  }));
  favoritesRouter.post('/:trackId/toggle', asyncHandler(async (req, res) => {
    res.json(createSuccessResponse(await favorites.toggle(userIdOf(req), req.params.trackId!, correlationIdOf(req))));
  }));

  // Mounted bare and under /api so it works behind the gateway and when called directly.
  for (const prefix of ['/api/playlists', '/playlists']) app.use(prefix, playlistsRouter);
  for (const prefix of ['/api/favorites', '/favorites']) app.use(prefix, favoritesRouter);

  app.use((_req, res) => {
    res.status(404).json(createErrorResponse('NOT_FOUND', 'Requested playlist route not found'));
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json(createErrorResponse(err.code, err.message, err.details));
      return;
    }
    if (err instanceof CatalogUnavailableError) {
      req.log?.error({ err }, 'Catalog unavailable');
      res.status(502).json(createErrorResponse('CATALOG_UNAVAILABLE', 'The catalog is unavailable, please retry'));
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json(createErrorResponse('INVALID_JSON', 'Request body is not valid JSON'));
      return;
    }
    req.log?.error({ err }, 'Unhandled playlist service exception');
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred in Playlist Service'));
  });

  return app;
}

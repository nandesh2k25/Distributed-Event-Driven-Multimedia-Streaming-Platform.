import { Router, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config.js';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.js';
import { createErrorResponse } from '@music/shared';

export const proxyRouter: Router = Router();

function createServiceProxy(targetUrl: string, pathPrefix: string) {
  return createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    ws: false,
    // Express strips the mount path from req.url; restore it so downstream services see /api/<resource>
    pathRewrite: (path) => `${pathPrefix}${path}`,
    on: {
      proxyReq: (proxyReq, req) => {
        const correlationId = (req as Request).correlationId;
        if (correlationId) {
          proxyReq.setHeader(CORRELATION_ID_HEADER, correlationId);
        }
      },
      error: (err, req, res) => {
        const expressReq = req as Request;
        const expressRes = res as Response;
        if (expressReq.log) {
          expressReq.log.error({ err, path: req.url, targetUrl }, 'Proxy request failed');
        }
        if (!expressRes.headersSent) {
          expressRes.status(503).json(
            createErrorResponse(
              'SERVICE_UNAVAILABLE',
              `Upstream service for ${pathPrefix} is currently unavailable`,
              [{ message: err.message }]
            )
          );
        }
      }
    }
  });
}

// Mount microservice proxies
// Catalog Service: /api/catalog, /api/albums, /api/artists, /api/tracks, /api/genres, /api/search
proxyRouter.use('/catalog', createServiceProxy(config.services.catalog, '/api/catalog'));
proxyRouter.use('/albums', createServiceProxy(config.services.catalog, '/api/albums'));
proxyRouter.use('/artists', createServiceProxy(config.services.catalog, '/api/artists'));
proxyRouter.use('/tracks', createServiceProxy(config.services.catalog, '/api/tracks'));
proxyRouter.use('/genres', createServiceProxy(config.services.catalog, '/api/genres'));
proxyRouter.use('/search', createServiceProxy(config.services.catalog, '/api/search'));

// Playlist Service: /api/playlists, /api/favorites
proxyRouter.use('/playlists', createServiceProxy(config.services.playlist, '/api/playlists'));
proxyRouter.use('/favorites', createServiceProxy(config.services.playlist, '/api/favorites'));

// Ingestion Service: /api/ingest
proxyRouter.use('/ingest', createServiceProxy(config.services.ingestion, '/api/ingest'));

// Streaming Service: /api/stream
proxyRouter.use('/stream', createServiceProxy(config.services.streaming, '/api/stream'));

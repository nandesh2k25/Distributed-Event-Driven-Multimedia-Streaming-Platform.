import { Router } from 'express';
import type { createAlbumsController } from '../controllers/albums.controller.js';
import type { createResolveController } from '../controllers/resolve.controller.js';

export function createAlbumsRouter(
  c: ReturnType<typeof createAlbumsController>,
  resolve: ReturnType<typeof createResolveController>
): Router {
  const router = Router();
  router.post('/resolve', resolve.resolveAlbum);
  router.get('/', c.listAlbums);
  router.get('/:id', c.getAlbumById);
  return router;
}

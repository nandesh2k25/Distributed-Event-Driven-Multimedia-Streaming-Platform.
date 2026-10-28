import { Router } from 'express';
import type { createAlbumsController } from '../controllers/albums.controller.js';

export function createAlbumsRouter(
  c: ReturnType<typeof createAlbumsController>
): Router {
  const router = Router();
  router.get('/', c.listAlbums);
  router.get('/:id', c.getAlbumById);
  return router;
}

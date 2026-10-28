import { Router } from 'express';
import type { createArtistsController } from '../controllers/artists.controller.js';

export function createArtistsRouter(
  c: ReturnType<typeof createArtistsController>
): Router {
  const router = Router();
  router.get('/', c.listArtists);
  router.get('/:id', c.getArtistById);
  return router;
}

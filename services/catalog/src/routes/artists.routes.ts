import { Router } from 'express';
import type { createArtistsController } from '../controllers/artists.controller.js';
import type { createResolveController } from '../controllers/resolve.controller.js';

export function createArtistsRouter(
  c: ReturnType<typeof createArtistsController>,
  resolve: ReturnType<typeof createResolveController>
): Router {
  const router = Router();
  router.post('/resolve', resolve.resolveArtist);
  router.get('/', c.listArtists);
  router.get('/:id', c.getArtistById);
  return router;
}

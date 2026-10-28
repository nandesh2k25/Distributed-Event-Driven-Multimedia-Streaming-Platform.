import { Router } from 'express';
import type { createGenresController } from '../controllers/genres.controller.js';
import type { createResolveController } from '../controllers/resolve.controller.js';

export function createGenresRouter(
  c: ReturnType<typeof createGenresController>,
  resolve: ReturnType<typeof createResolveController>
): Router {
  const router = Router();
  router.post('/resolve', resolve.resolveGenre);
  router.get('/', c.listGenres);
  return router;
}

import { Router } from 'express';
import type { createGenresController } from '../controllers/genres.controller.js';

export function createGenresRouter(
  c: ReturnType<typeof createGenresController>
): Router {
  const router = Router();
  router.get('/', c.listGenres);
  return router;
}

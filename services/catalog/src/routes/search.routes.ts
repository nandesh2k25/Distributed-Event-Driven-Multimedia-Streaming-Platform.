import { Router } from 'express';
import type { createSearchController } from '../controllers/search.controller.js';

export function createSearchRouter(c: ReturnType<typeof createSearchController>): Router {
  const router = Router();
  router.get('/', c.searchCatalog);
  return router;
}

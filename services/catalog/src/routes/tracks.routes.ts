import { Router } from 'express';
import type { createTracksController } from '../controllers/tracks.controller.js';

export function createTracksRouter(c: ReturnType<typeof createTracksController>): Router {
  const router = Router();
  router.get('/', c.listTracks);
  router.post('/batch', c.getTracksBatch);
  router.get('/:id', c.getTrackById);
  router.post('/', c.createTrack);
  router.patch('/:id', c.updateTrack);
  return router;
}

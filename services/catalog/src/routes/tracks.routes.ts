import { Router } from 'express';
import type { createTracksController } from '../controllers/tracks.controller.js';
import type { createUploadsController } from '../controllers/uploads.controller.js';

export function createTracksRouter(
  c: ReturnType<typeof createTracksController>,
  uploads: ReturnType<typeof createUploadsController>
): Router {
  const router = Router();
  router.get('/', c.listTracks);
  router.post('/batch', c.getTracksBatch);
  router.post('/uploads', uploads.registerUpload);
  router.get('/:id', c.getTrackById);
  router.post('/', c.createTrack);
  router.patch('/:id', c.updateTrack);
  return router;
}

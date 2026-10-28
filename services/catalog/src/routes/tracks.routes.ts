import { Router } from 'express';
import { listTracks, getTrackById, getTracksBatch, createTrack, updateTrack } from '../controllers/tracks.controller.js';

export const tracksRouter: Router = Router();

tracksRouter.get('/', listTracks);
tracksRouter.post('/batch', getTracksBatch);
tracksRouter.get('/:id', getTrackById);
tracksRouter.post('/', createTrack);
tracksRouter.patch('/:id', updateTrack);

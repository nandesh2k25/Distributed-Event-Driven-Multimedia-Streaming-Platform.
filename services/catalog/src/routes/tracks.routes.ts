import { Router } from 'express';
import { listTracks, getTrackById, createTrack, updateTrack } from '../controllers/tracks.controller.js';

export const tracksRouter: Router = Router();

tracksRouter.get('/', listTracks);
tracksRouter.get('/:id', getTrackById);
tracksRouter.post('/', createTrack);
tracksRouter.patch('/:id', updateTrack);

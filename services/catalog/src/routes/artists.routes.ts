import { Router } from 'express';
import { resolveArtist } from '../controllers/resolve.controller.js';
import { listArtists, getArtistById } from '../controllers/artists.controller.js';

export const artistsRouter: Router = Router();

artistsRouter.post('/resolve', resolveArtist);
artistsRouter.get('/', listArtists);
artistsRouter.get('/:id', getArtistById);

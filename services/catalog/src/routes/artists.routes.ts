import { Router } from 'express';
import { listArtists, getArtistById } from '../controllers/artists.controller.js';

export const artistsRouter: Router = Router();

artistsRouter.get('/', listArtists);
artistsRouter.get('/:id', getArtistById);

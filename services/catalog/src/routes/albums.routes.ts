import { Router } from 'express';
import { resolveAlbum } from '../controllers/resolve.controller.js';
import { listAlbums, getAlbumById } from '../controllers/albums.controller.js';

export const albumsRouter: Router = Router();

albumsRouter.post('/resolve', resolveAlbum);
albumsRouter.get('/', listAlbums);
albumsRouter.get('/:id', getAlbumById);

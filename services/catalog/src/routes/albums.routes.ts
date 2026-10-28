import { Router } from 'express';
import { listAlbums, getAlbumById } from '../controllers/albums.controller.js';

export const albumsRouter: Router = Router();

albumsRouter.get('/', listAlbums);
albumsRouter.get('/:id', getAlbumById);

import { Router } from 'express';
import { resolveGenre } from '../controllers/resolve.controller.js';
import { listGenres } from '../controllers/genres.controller.js';

export const genresRouter: Router = Router();

genresRouter.post('/resolve', resolveGenre);
genresRouter.get('/', listGenres);

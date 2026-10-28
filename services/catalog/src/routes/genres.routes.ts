import { Router } from 'express';
import { listGenres } from '../controllers/genres.controller.js';

export const genresRouter: Router = Router();

genresRouter.get('/', listGenres);

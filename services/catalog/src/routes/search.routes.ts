import { Router } from 'express';
import { searchCatalog } from '../controllers/search.controller.js';

export const searchRouter: Router = Router();

searchRouter.get('/', searchCatalog);

import { Request, Response } from 'express';
import { genresService } from '../services/genres.service.js';
import { createSuccessResponse, createErrorResponse } from '@music/shared';

export async function listGenres(req: Request, res: Response) {
  try {
    const genres = await genresService.listGenres();
    return res.status(200).json(createSuccessResponse(genres));
  } catch (err: any) {
    req.log?.error({ err }, 'Failed to list genres');
    return res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve genres from catalog')
    );
  }
}

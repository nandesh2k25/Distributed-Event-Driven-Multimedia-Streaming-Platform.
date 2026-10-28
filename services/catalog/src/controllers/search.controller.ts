import { Request, Response } from 'express';
import type { SearchService } from '../services/search.service.js';
import { createSuccessResponse, createErrorResponse } from '@music/shared';

export function createSearchController(searchService: SearchService) {
  async function searchCatalog(req: Request, res: Response) {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

      const result = await searchService.search(query, isNaN(limit) ? 10 : limit);
      return res.status(200).json(createSuccessResponse(result));
    } catch (err: any) {
      req.log?.error({ err, q: req.query.q }, 'Failed to search catalog');
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to perform catalog search')
      );
    }
  }

  return { searchCatalog };
}

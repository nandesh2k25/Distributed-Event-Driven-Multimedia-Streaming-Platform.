import { Request, Response } from 'express';
import type { ArtistsService } from '../services/artists.service.js';
import { createSuccessResponse, createErrorResponse } from '@music/shared';

export function createArtistsController(artistsService: ArtistsService) {
  async function listArtists(req: Request, res: Response) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const artists = await artistsService.listArtists(search);
      return res.status(200).json(createSuccessResponse(artists));
    } catch (err: any) {
      req.log?.error({ err }, 'Failed to list artists');
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve artists from catalog')
      );
    }
  }

  async function getArtistById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Artist ID is required'));
      }

      const artist = await artistsService.getArtistById(id);
      if (!artist) {
        return res.status(404).json(createErrorResponse('ARTIST_NOT_FOUND', `Artist with ID '${id}' not found`));
      }

      return res.status(200).json(createSuccessResponse(artist));
    } catch (err: any) {
      req.log?.error({ err, id: req.params.id }, 'Failed to get artist');
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve artist details')
      );
    }
  }

  return { listArtists, getArtistById };
}

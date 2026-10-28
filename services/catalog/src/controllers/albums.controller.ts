import { Request, Response } from 'express';
import { albumsService } from '../services/albums.service.js';
import { createSuccessResponse, createErrorResponse } from '@music/shared';

export async function listAlbums(req: Request, res: Response) {
  try {
    const artistId = typeof req.query.artistId === 'string' ? req.query.artistId : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const albums = await albumsService.listAlbums(artistId, search);
    return res.status(200).json(createSuccessResponse(albums));
  } catch (err: any) {
    req.log?.error({ err }, 'Failed to list albums');
    return res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve albums from catalog')
    );
  }
}

export async function getAlbumById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Album ID is required'));
    }

    const album = await albumsService.getAlbumById(id);
    if (!album) {
      return res.status(404).json(createErrorResponse('ALBUM_NOT_FOUND', `Album with ID '${id}' not found`));
    }

    return res.status(200).json(createSuccessResponse(album));
  } catch (err: any) {
    req.log?.error({ err, id: req.params.id }, 'Failed to get album');
    return res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve album details')
    );
  }
}

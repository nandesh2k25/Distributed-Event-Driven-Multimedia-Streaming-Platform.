import { Request, Response } from 'express';
import { ResolveAlbumSchema, ResolveNameSchema, createErrorResponse, createSuccessResponse } from '@music/shared';
import { resolveService } from '../services/resolve.service.js';

function invalid(res: Response, error: { errors: { path: (string | number)[]; message: string }[] }) {
  return res.status(400).json(
    createErrorResponse(
      'VALIDATION_ERROR',
      'Invalid request body',
      error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
    )
  );
}

export async function resolveArtist(req: Request, res: Response) {
  const parsed = ResolveNameSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    return res.status(200).json(createSuccessResponse(await resolveService.resolveArtist(parsed.data.name)));
  } catch (err) {
    req.log?.error({ err }, 'Failed to resolve artist');
    return res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to resolve artist'));
  }
}

export async function resolveGenre(req: Request, res: Response) {
  const parsed = ResolveNameSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    return res.status(200).json(createSuccessResponse(await resolveService.resolveGenre(parsed.data.name)));
  } catch (err) {
    req.log?.error({ err }, 'Failed to resolve genre');
    return res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to resolve genre'));
  }
}

export async function resolveAlbum(req: Request, res: Response) {
  const parsed = ResolveAlbumSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { title, artistId } = parsed.data;
    return res.status(200).json(createSuccessResponse(await resolveService.resolveAlbum(title, artistId)));
  } catch (err) {
    req.log?.error({ err }, 'Failed to resolve album');
    return res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to resolve album'));
  }
}

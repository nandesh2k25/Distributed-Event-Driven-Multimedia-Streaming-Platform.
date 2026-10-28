import { Request, Response } from 'express';
import { tracksService } from '../services/tracks.service.js';
import type { Prisma } from '@prisma/client';
import { BatchTrackIdsSchema, TrackQuerySchema, UpdateTrackSchema, createSuccessResponse, createErrorResponse } from '@music/shared';

export async function listTracks(req: Request, res: Response) {
  try {
    const parsed = TrackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(
        createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid track query parameters',
          parsed.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
        )
      );
    }

    const result = await tracksService.listTracks(parsed.data);
    return res.status(200).json(
      createSuccessResponse(result.tracks, {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      })
    );
  } catch (err: any) {
    req.log?.error({ err }, 'Failed to list tracks');
    return res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve tracks from catalog')
    );
  }
}

export async function getTracksBatch(req: Request, res: Response) {
  const parsed = BatchTrackIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid batch request',
        parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
      )
    );
  }
  try {
    const tracks = await tracksService.getTracksByIds([...new Set(parsed.data.ids)]);
    return res.status(200).json(createSuccessResponse(tracks));
  } catch (err) {
    req.log?.error({ err }, 'Failed to batch-fetch tracks');
    return res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve tracks'));
  }
}

export async function getTrackById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Track ID is required'));
    }

    const track = await tracksService.getTrackById(id);
    if (!track) {
      return res.status(404).json(createErrorResponse('TRACK_NOT_FOUND', `Track with ID '${id}' not found`));
    }

    return res.status(200).json(createSuccessResponse(track));
  } catch (err: any) {
    req.log?.error({ err, id: req.params.id }, 'Failed to get track');
    return res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve track details')
    );
  }
}

export async function createTrack(req: Request, res: Response) {
  try {
    const { title, artistId, albumId, genreId, duration, bitrate, format, originalFormat, rawStorageKey, storageKey, waveformPeaks, variants, status } = req.body;
    if (!title || !artistId) {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Title and artistId are required'));
    }

    const track = await tracksService.createTrack({
      title,
      artistId,
      albumId,
      genreId,
      duration,
      bitrate,
      format,
      originalFormat,
      rawStorageKey,
      storageKey,
      waveformPeaks,
      variants,
      status
    });

    return res.status(201).json(createSuccessResponse(track));
  } catch (err: any) {
    req.log?.error({ err }, 'Failed to create track');
    return res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to create track in catalog')
    );
  }
}

export async function updateTrack(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Track ID is required'));
    }

    const parsed = UpdateTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(
        createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid track update',
          parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
        )
      );
    }

    const track = await tracksService.updateTrack(id, parsed.data as Prisma.TrackUpdateInput);
    return res.status(200).json(createSuccessResponse(track));
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return res.status(404).json(createErrorResponse('TRACK_NOT_FOUND', 'Track not found'));
    }
    req.log?.error({ err, id: req.params.id }, 'Failed to update track');
    return res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to update track')
    );
  }
}

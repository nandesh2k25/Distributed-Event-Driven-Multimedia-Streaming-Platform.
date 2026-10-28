import { Request, Response } from 'express';
import { RegisterUploadSchema, createErrorResponse, createSuccessResponse } from '@music/shared';
import type { UploadsService } from '../services/uploads.service.js';

export function createUploadsController(uploadsService: UploadsService) {
  async function registerUpload(req: Request, res: Response) {
    const parsed = RegisterUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(
        createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid upload registration',
          parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
        )
      );
    }

    try {
      return res.status(201).json(createSuccessResponse(await uploadsService.registerUpload(parsed.data)));
    } catch (err) {
      req.log?.error({ err }, 'Failed to register upload');
      return res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to register upload'));
    }
  }

  return { registerUpload };
}

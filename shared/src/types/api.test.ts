import { describe, it, expect } from 'vitest';
import { createSuccessResponse, createErrorResponse } from './api.js';

describe('API response envelopes', () => {
  it('creates standard success response without pagination', () => {
    const data = { id: 'track-123', title: 'Midnight Groove' };
    const res = createSuccessResponse(data);
    expect(res).toEqual({
      success: true,
      data: { id: 'track-123', title: 'Midnight Groove' }
    });
  });

  it('creates standard success response with pagination meta', () => {
    const data = [{ id: '1' }, { id: '2' }];
    const res = createSuccessResponse(data, { page: 1, limit: 20, total: 2 });
    expect(res).toEqual({
      success: true,
      data: [{ id: '1' }, { id: '2' }],
      meta: {
        page: 1,
        limit: 20,
        total: 2
      }
    });
  });

  it('creates standard error response without details', () => {
    const res = createErrorResponse('NOT_FOUND', 'Track not found');
    expect(res).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Track not found'
      }
    });
  });

  it('creates standard error response with validation details', () => {
    const details = [{ field: 'title', message: 'Title is required', code: 'too_small' }];
    const res = createErrorResponse('VALIDATION_ERROR', 'Invalid request body', details);
    expect(res).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: [{ field: 'title', message: 'Title is required', code: 'too_small' }]
      }
    });
  });
});

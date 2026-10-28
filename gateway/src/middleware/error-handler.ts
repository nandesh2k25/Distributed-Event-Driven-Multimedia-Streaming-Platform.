import { Request, Response, NextFunction } from 'express';
import { createErrorResponse } from '@music/shared';

export function notFoundHandler(req: Request, res: Response): void {
  const response = createErrorResponse(
    'NOT_FOUND',
    `Resource not found: ${req.method} ${req.originalUrl}`
  );
  res.status(404).json(response);
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  void _next;
  const statusCode = err.status || err.statusCode || 500;
  const errorCode = err.code || (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');
  const message = err.message || 'An unexpected error occurred';

  if (req.log) {
    req.log.error({ err, statusCode, errorCode }, 'Request error encountered');
  }

  const response = createErrorResponse(errorCode, message, err.details);
  res.status(statusCode).json(response);
}

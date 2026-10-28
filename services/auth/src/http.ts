import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { field?: string; message: string }[]
  ) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/** Validates a request payload at the route boundary, before any business logic runs. */
export function parse<T>(schema: ZodType<T, any, any>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new AppError(
    400,
    'VALIDATION_ERROR',
    'Invalid request',
    result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
  );
}

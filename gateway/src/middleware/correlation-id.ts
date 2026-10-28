import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { createChildLogger } from '../logger.js';
import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      log: Logger;
    }
  }
}

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers[CORRELATION_ID_HEADER] as string | undefined;

  // Use provided correlation ID if valid UUID, otherwise generate new v4 UUID
  const correlationId = incomingId && uuidValidate(incomingId) ? incomingId : uuidv4();

  req.correlationId = correlationId;
  req.log = createChildLogger(correlationId);

  // Set correlation header on the outbound response
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
}

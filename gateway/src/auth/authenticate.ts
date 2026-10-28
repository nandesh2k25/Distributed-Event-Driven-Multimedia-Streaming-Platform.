import type { NextFunction, Request, Response } from 'express';
import { bearerToken, createErrorResponse, verifyToken } from '@music/shared';

const USER_ID_HEADER = 'x-user-id';

/**
 * Browsers cannot attach headers to an <audio> element, so the stream route (and only that route)
 * also accepts the token as `?access_token=`.
 */
function streamQueryToken(req: Request): string | null {
  const value = req.query.access_token;
  return req.path.startsWith('/stream/') && typeof value === 'string' && value ? value : null;
}

/**
 * The gateway is the only place tokens are verified. Services behind it trust `X-User-Id`, so
 * whatever a client sent in that header is discarded and replaced by the verified subject.
 * No token means a guest (no header at all); a token that fails verification is rejected so
 * the client can tell its session has expired instead of silently losing access.
 */
export function authenticate(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    delete req.headers[USER_ID_HEADER];

    const token = bearerToken(req.header('authorization')) ?? streamQueryToken(req);
    if (!token) return next();

    const claims = verifyToken(token, jwtSecret);
    if (!claims) {
      res.status(401).json(createErrorResponse('TOKEN_INVALID', 'Your session has expired, please sign in again'));
      return;
    }

    req.headers[USER_ID_HEADER] = claims.userId;
    next();
  };
}

/** Guests are turned away; used for per-user features (playlists, favorites, uploads). */
export function requireLogin(req: Request, res: Response, next: NextFunction): void {
  if (!req.header(USER_ID_HEADER)) {
    res.status(401).json(createErrorResponse('LOGIN_REQUIRED', 'Sign in to use this feature'));
    return;
  }
  next();
}

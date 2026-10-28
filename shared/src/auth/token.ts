import jwt from 'jsonwebtoken';

/** What a verified token tells a service about its caller. */
export interface AuthClaims {
  userId: string;
  email: string;
  displayName: string;
}

const ALGORITHM = 'HS256';

export function signToken(claims: AuthClaims, secret: string, expiresInSeconds: number): string {
  return jwt.sign({ email: claims.email, name: claims.displayName }, secret, {
    algorithm: ALGORITHM,
    subject: claims.userId,
    expiresIn: expiresInSeconds
  });
}

/**
 * Returns the claims for a valid, unexpired token signed with `secret`, or `null` for anything
 * else (bad signature, expired, malformed, wrong algorithm). Callers treat `null` as "guest".
 */
export function verifyToken(token: string, secret: string): AuthClaims | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
    if (typeof payload === 'string' || !payload.sub || typeof payload.email !== 'string') return null;
    return {
      userId: payload.sub,
      email: payload.email,
      displayName: typeof payload.name === 'string' ? payload.name : ''
    };
  } catch {
    return null;
  }
}

/** Extracts the token from an `Authorization: Bearer <token>` header value. */
export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

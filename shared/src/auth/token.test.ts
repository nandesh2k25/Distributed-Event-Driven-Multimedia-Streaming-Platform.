import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { bearerToken, signToken, verifyToken, type AuthClaims } from './token.js';

const claims: AuthClaims = { userId: 'u1', email: 'a@b.co', displayName: 'Ada' };
const SECRET = 'test-secret';

describe('verifyToken', () => {
  it('returns the claims of a token it signed', () => {
    expect(verifyToken(signToken(claims, SECRET, 60), SECRET)).toEqual(claims);
  });

  it('rejects a token signed with another secret', () => {
    expect(verifyToken(signToken(claims, 'other', 60), SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ email: claims.email }, SECRET, { subject: 'u1', expiresIn: -10 });
    expect(verifyToken(expired, SECRET)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = signToken(claims, SECRET, 60).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', email: 'x@y.z' })).toString('base64url');
    expect(verifyToken(`${header}.${forged}.${signature}`, SECRET)).toBeNull();
  });

  it('rejects an unsigned (alg none) token', () => {
    const none = jwt.sign({ email: claims.email }, '', { algorithm: 'none', subject: 'u1' });
    expect(verifyToken(none, SECRET)).toBeNull();
  });

  it('rejects garbage and tokens without a subject', () => {
    expect(verifyToken('not-a-jwt', SECRET)).toBeNull();
    expect(verifyToken(jwt.sign({ email: 'a@b.co' }, SECRET), SECRET)).toBeNull();
  });
});

describe('bearerToken', () => {
  it('extracts the token from a Bearer header', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer abc')).toBe('abc');
  });

  it('returns null for missing or non-bearer headers', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
  });
});

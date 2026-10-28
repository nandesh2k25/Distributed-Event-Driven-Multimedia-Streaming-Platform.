import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { verifyToken } from '@music/shared';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const SECRET = 'test-secret';
const app = createApp({
  prisma,
  options: { jwtSecret: SECRET, tokenTtlSeconds: 3600, bcryptRounds: 4 }
});

const run = randomUUID().slice(0, 8);
const emailOf = (name: string) => `${name}-${run}@example.com`;
const signup = (body: object) => request(app).post('/api/auth/signup').send(body);
const valid = (name: string) => ({ email: emailOf(name), password: 'correct horse', displayName: 'Ada' });

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@example.com` } } });
  await prisma.$disconnect();
});

describe('signup', () => {
  it('creates an account and returns a token for it, without leaking the password hash', async () => {
    const res = await signup(valid('new'));

    expect(res.status).toBe(201);
    expect(res.body.data.user).toEqual({ id: expect.any(String), email: emailOf('new'), displayName: 'Ada' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(verifyToken(res.body.data.token, SECRET)).toMatchObject({ userId: res.body.data.user.id });
  });

  it('stores a hash, not the password', async () => {
    await signup(valid('hashed'));
    const row = await prisma.user.findUnique({ where: { email: emailOf('hashed') } });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row?.passwordHash).not.toContain('correct horse');
  });

  it('treats email case-insensitively and rejects a duplicate with 409', async () => {
    await signup(valid('dup'));
    const res = await signup({ ...valid('dup'), email: emailOf('dup').toUpperCase() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects invalid input with field-level errors', async () => {
    const res = await signup({ email: 'nope', password: 'short', displayName: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'displayName',
      'email',
      'password'
    ]);
  });
});

describe('login', () => {
  it('returns a token for the right credentials, whatever the email case', async () => {
    const created = await signup(valid('login'));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: emailOf('login').toUpperCase(), password: 'correct horse' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(created.body.data.user.id);
    expect(verifyToken(res.body.data.token, SECRET)?.email).toBe(emailOf('login'));
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await signup(valid('wrong'));
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: emailOf('wrong'), password: 'nope nope' });
    const unknown = await request(app).post('/api/auth/login').send({ email: emailOf('ghost'), password: 'nope nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrongPassword.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('me', () => {
  it('returns the account for a valid token', async () => {
    const { body } = await signup(valid('me'));
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(emailOf('me'));
  });

  it('answers 401 without a token, with a bad token, and after the account is deleted', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer junk')).status).toBe(401);

    const { body } = await signup(valid('gone'));
    await prisma.user.delete({ where: { email: emailOf('gone') } });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.data.token}`);
    expect(res.status).toBe(401);
  });
});

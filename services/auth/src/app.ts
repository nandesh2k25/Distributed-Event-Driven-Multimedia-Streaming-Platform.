import express, { Express, NextFunction, Request, Response, Router } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { bearerToken, createErrorResponse, createSuccessResponse, verifyToken } from '@music/shared';
import type { PrismaClient } from './generated/client/index.js';
import { LoginSchema, SignupSchema, createAccountsService, type AccountsOptions } from './accounts.service.js';
import { AppError, asyncHandler, parse } from './http.js';

export interface AuthDeps {
  prisma: PrismaClient;
  options: AccountsOptions;
}

export function createApp({ prisma, options }: AuthDeps): Express {
  const app: Express = express();
  const logger = pino({ name: 'auth-service' });
  const accounts = createAccountsService(prisma, options);

  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger, genReqId: (req) => (req.headers['x-correlation-id'] as string) || randomUUID() }));

  app.get('/health', asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, data: { status: 'healthy', service: 'auth' } });
  }));

  const router = Router();
  router.post('/signup', asyncHandler(async (req, res) => {
    res.status(201).json(createSuccessResponse(await accounts.signup(parse(SignupSchema, req.body))));
  }));
  router.post('/login', asyncHandler(async (req, res) => {
    res.json(createSuccessResponse(await accounts.login(parse(LoginSchema, req.body))));
  }));
  router.get('/me', asyncHandler(async (req, res) => {
    const token = bearerToken(req.header('authorization'));
    const claims = token ? verifyToken(token, options.jwtSecret) : null;
    const user = claims ? await accounts.find(claims.userId) : null;
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
    res.json(createSuccessResponse({ user }));
  }));

  // Mounted bare and under /api so it works behind the gateway and when called directly.
  for (const prefix of ['/api/auth', '/auth']) app.use(prefix, router);

  app.use((_req, res) => {
    res.status(404).json(createErrorResponse('NOT_FOUND', 'Requested auth route not found'));
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json(createErrorResponse(err.code, err.message, err.details));
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json(createErrorResponse('INVALID_JSON', 'Request body is not valid JSON'));
      return;
    }
    req.log?.error({ err }, 'Unhandled auth service exception');
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred in Auth Service'));
  });

  return app;
}

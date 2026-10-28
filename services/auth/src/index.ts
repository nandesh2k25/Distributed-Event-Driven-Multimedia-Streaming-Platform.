import pino from 'pino';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';

const logger = pino({ name: 'auth-server' });
const app = createApp({
  prisma,
  options: {
    jwtSecret: config.jwtSecret,
    tokenTtlSeconds: config.tokenTtlSeconds,
    bcryptRounds: config.bcryptRounds
  }
});

const server = app.listen(config.port, () => {
  logger.info(`Auth Service listening on port ${config.port} [${config.nodeEnv}]`);
});

const gracefulShutdown = () => {
  logger.info('Shutting down Auth Service gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

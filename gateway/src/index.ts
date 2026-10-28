import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    `API Gateway listening on http://localhost:${config.port}`
  );
});

// Graceful shutdown handling
function handleShutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown initiated');
  server.close(() => {
    logger.info('API Gateway HTTP server closed cleanly');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forcefully terminating API Gateway after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { correlationIdMiddleware } from './middleware/correlation-id.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { proxyRouter } from './routes/proxy.js';

export function createApp(): express.Application {
  const app = express();

  // Basic security and CORS headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );
  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Correlation-ID'],
      exposedHeaders: [
        'Content-Range',
        'Accept-Ranges',
        'Content-Length',
        'X-Correlation-ID'
      ]
    })
  );

  // Ingress correlation ID generation and binding
  app.use(correlationIdMiddleware);

  // Aggregated health check endpoint
  app.use('/health', healthRouter);

  // Reverse proxy routes for microservices
  // Mount proxy before express.json() to allow unbuffered streaming and multipart file uploads
  app.use('/api', proxyRouter);

  // JSON parser for any native gateway endpoints
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Gateway root info
  app.get('/', (req, res) => {
    res.json({
      name: 'Distributed Music Streaming Platform - API Gateway',
      version: '1.0.0',
      correlationId: req.correlationId,
      status: 'online'
    });
  });

  // 404 Not Found handler
  app.use(notFoundHandler);

  // Global centralized error handler
  app.use(errorHandler);

  return app;
}

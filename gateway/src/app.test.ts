import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import * as healthService from './services/health-checker.js';

describe('API Gateway Ingress & Health Check', () => {
  const app = createApp();

  it('generates a new X-Correlation-ID when none is provided', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    const correlationId = res.headers['x-correlation-id'];
    expect(correlationId).toBeDefined();
    expect(correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('propagates the incoming X-Correlation-ID when valid UUID is provided', async () => {
    const customId = '123e4567-e89b-12d3-a456-426614174000';
    const res = await request(app)
      .get('/')
      .set('x-correlation-id', customId);

    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBe(customId);
  });

  it('returns standard error envelope for non-existent routes', async () => {
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found: GET /api/unknown-endpoint'
      }
    });
  });

  it('GET /health returns aggregated system health report with 200 OK', async () => {
    // Mock health checker to return healthy state
    vi.spyOn(healthService, 'checkSystemHealth').mockResolvedValueOnce({
      status: 'healthy',
      timestamp: '2026-10-28T09:00:00.000Z',
      uptime: 100,
      dependencies: {
        postgres: { status: 'UP', latencyMs: 5 },
        redis: { status: 'UP', latencyMs: 2 },
        rabbitmq: { status: 'UP', latencyMs: 4 },
        minio: { status: 'UP', latencyMs: 8 }
      }
    });

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.dependencies.postgres.status).toBe('UP');
    expect(res.body.data.dependencies.redis.status).toBe('UP');
    expect(res.body.data.dependencies.rabbitmq.status).toBe('UP');
    expect(res.body.data.dependencies.minio.status).toBe('UP');
  });
});

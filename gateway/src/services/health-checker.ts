import net from 'net';
import http from 'http';
import { config } from '../config.js';

export interface ServiceHealth {
  status: 'UP' | 'DOWN';
  latencyMs: number;
  message?: string;
}

export interface SystemHealthReport {
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptime: number;
  dependencies: {
    postgres: ServiceHealth;
    redis: ServiceHealth;
    rabbitmq: ServiceHealth;
    minio: ServiceHealth;
  };
}

function checkTcpPort(host: string, port: number, timeoutMs = 2000): Promise<ServiceHealth> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        const latencyMs = Date.now() - start;
        cleanup();
        resolve({ status: 'UP', latencyMs });
      }
    });

    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve({
          status: 'DOWN',
          latencyMs: Date.now() - start,
          message: `Connection timed out after ${timeoutMs}ms`
        });
      }
    });

    socket.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve({
          status: 'DOWN',
          latencyMs: Date.now() - start,
          message: err.message
        });
      }
    });

    try {
      socket.connect(port, host);
    } catch (err: any) {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve({
          status: 'DOWN',
          latencyMs: Date.now() - start,
          message: err.message
        });
      }
    }
  });
}

function checkHttpEndpoint(url: string, timeoutMs = 2000): Promise<ServiceHealth> {
  const start = Date.now();
  return new Promise((resolve) => {
    let isResolved = false;

    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const latencyMs = Date.now() - start;
      const isUp = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400;
      if (!isResolved) {
        isResolved = true;
        resolve({
          status: isUp ? 'UP' : 'DOWN',
          latencyMs,
          message: isUp ? undefined : `HTTP status ${res.statusCode}`
        });
      }
      res.resume(); // consume stream
    });

    req.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        req.destroy();
        resolve({
          status: 'DOWN',
          latencyMs: Date.now() - start,
          message: `HTTP probe timed out after ${timeoutMs}ms`
        });
      }
    });

    req.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        req.destroy();
        resolve({
          status: 'DOWN',
          latencyMs: Date.now() - start,
          message: err.message
        });
      }
    });
  });
}

export async function checkSystemHealth(): Promise<SystemHealthReport> {
  const [postgres, redis, rabbitmq, minio] = await Promise.all([
    checkTcpPort(config.postgres.host, config.postgres.port),
    checkTcpPort(config.redis.host, config.redis.port),
    checkTcpPort(config.rabbitmq.host, config.rabbitmq.port),
    checkHttpEndpoint(`http://${config.minio.host}:${config.minio.port}/minio/health/live`)
  ]);

  const allUp =
    postgres.status === 'UP' &&
    redis.status === 'UP' &&
    rabbitmq.status === 'UP' &&
    minio.status === 'UP';

  return {
    status: allUp ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {
      postgres,
      redis,
      rabbitmq,
      minio
    }
  };
}

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Infrastructure targets for health checks
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10)
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
  },
  rateLimit: {
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '300', 10),
    windowMs: 60_000
  },
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    mgmtPort: parseInt(process.env.RABBITMQ_MGMT_PORT || '15672', 10)
  },
  minio: {
    host: process.env.MINIO_HOST || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10)
  },

  // Downstream microservices
  services: {
    catalog: process.env.CATALOG_SERVICE_URL || 'http://localhost:3001',
    playlist: process.env.PLAYLIST_SERVICE_URL || 'http://localhost:3002',
    ingestion: process.env.INGESTION_SERVICE_URL || 'http://localhost:3003',
    streaming: process.env.STREAMING_SERVICE_URL || 'http://localhost:3004'
  }
};

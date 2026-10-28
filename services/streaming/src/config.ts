import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3004', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  catalogUrl: process.env.CATALOG_SERVICE_URL || 'http://localhost:3001',
  trackCacheTtlMs: 60_000,
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
    region: process.env.MINIO_REGION || 'us-east-1',
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'processed-audio'
  }
};

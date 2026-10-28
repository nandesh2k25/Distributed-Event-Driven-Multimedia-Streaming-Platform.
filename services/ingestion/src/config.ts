import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  catalogUrl: process.env.CATALOG_SERVICE_URL || 'http://localhost:3001',
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(200 * 1024 * 1024), 10),
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
    region: process.env.MINIO_REGION || 'us-east-1',
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    rawBucket: process.env.MINIO_RAW_BUCKET || 'raw-audio'
  }
};

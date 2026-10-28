import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl:
    process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/music_playlist?schema=public',
  catalogUrl: process.env.CATALOG_SERVICE_URL || 'http://localhost:3001',
  defaultUserId: 'demo-user'
};

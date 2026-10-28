import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3005', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl:
    process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/music_auth?schema=public',
  // Shared with the gateway, which verifies tokens. The default is for local development only.
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  tokenTtlSeconds: parseInt(process.env.TOKEN_TTL_SECONDS || String(7 * 24 * 3600), 10),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10)
};

if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}

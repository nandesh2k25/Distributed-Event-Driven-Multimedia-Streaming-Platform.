import { PrismaClient } from '../generated/client/index.js';
import { config } from '../config.js';

export const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });

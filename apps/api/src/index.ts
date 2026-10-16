import { env } from './config/env';
import { createServer } from './server';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

const app = createServer();

const server = app.listen(env.PORT, () => {
  logger.info(`Juma API listening on http://localhost:${env.PORT}/api/v1`, {
    env: env.NODE_ENV,
  });
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

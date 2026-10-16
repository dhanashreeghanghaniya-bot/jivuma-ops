import { PrismaClient } from '@prisma/client';
import { isProduction } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['warn', 'error'],
  });

// `tsx watch` re-evaluates modules on every change; reuse the client so the
// dev database does not run out of connections.
if (!isProduction) globalForPrisma.prisma = prisma;

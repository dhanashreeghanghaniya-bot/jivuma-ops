import { Prisma, type AuditAction } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';

interface AuditInput {
  userId?: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Fields that must never be written into the audit trail. */
const SENSITIVE = new Set(['passwordHash', 'password', 'tokenHash']);

function sanitise(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;

  const plain = JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (SENSITIVE.has(key)) return undefined;
      return typeof v === 'bigint' ? v.toString() : v;
    }),
  );

  return plain as Prisma.InputJsonValue;
}

/**
 * Audit writes must never break the request they describe, so failures are
 * logged rather than thrown.
 */
export async function writeAuditLog(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: sanitise(input.before),
        after: sanitise(input.after),
      },
    });
  } catch (err) {
    logger.error('Failed to write audit log', {
      entity: input.entity,
      entityId: input.entityId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

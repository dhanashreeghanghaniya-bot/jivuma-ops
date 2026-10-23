import type { Prisma } from '@prisma/client';
import type { AuditChange, AuditEntry, AuditQuery, Paginated } from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { paginate } from '../../lib/http';
import { istDayEndUtc, istDayStartUtc } from '../../lib/dates';

/** Bookkeeping columns that change on every write and say nothing to the owner. */
const NOISE = new Set(['updatedAt', 'createdAt']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The fields a log entry touched, so the list can say "status, creditLimit"
 * instead of showing two JSON blobs. A create lists what was set, a delete
 * what was there, an update only what differs.
 */
export function diffSnapshots(before: unknown, after: unknown): AuditChange[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};
  if (!isRecord(before) && !isRecord(after)) {
    return same(before, after) ? [] : [{ field: '(value)', before, after }];
  }
  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return fields
    .filter((field) => !NOISE.has(field) && !same(b[field], a[field]))
    .map((field) => ({ field, before: b[field] ?? null, after: a[field] ?? null }));
}

export async function list(q: AuditQuery): Promise<Paginated<AuditEntry>> {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.from || q.to
      ? {
          at: {
            ...(q.from ? { gte: istDayStartUtc(q.from) } : {}),
            ...(q.to ? { lt: istDayEndUtc(q.to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return paginate(
    rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      user: r.user,
      changes: diffSnapshots(r.before, r.after),
      before: r.before,
      after: r.after,
    })),
    total,
    q.page,
    q.limit,
  );
}

/** Every entity name that has been logged, for the filter. */
export async function entities(): Promise<string[]> {
  const rows = await prisma.auditLog.groupBy({ by: ['entity'], orderBy: { entity: 'asc' } });
  return rows.map((r) => r.entity);
}

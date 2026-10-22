import { Role } from '@prisma/client';
import type { NotificationList } from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { logger } from '../../lib/logger';

export interface NotificationInput {
  title: string;
  body: string;
  link?: string | null;
}

/**
 * In-app notifications (SPEC 2.6). Best effort: a failed notification is
 * logged, never allowed to fail the approval or submission that caused it.
 */
export async function notify(userIds: string[], input: NotificationInput): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: [...new Set(userIds)].map((userId) => ({
        userId,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      })),
    });
  } catch (err) {
    logger.error('Failed to write notification', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Everyone who reviews field work: admins now, managers once that role exists. */
export async function notifyReviewers(input: NotificationInput): Promise<void> {
  const reviewers = await prisma.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.MANAGER] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  await notify(
    reviewers.map((r) => r.id),
    input,
  );
}

export async function list(userId: string): Promise<NotificationList> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    items: rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  };
}

export async function markRead(userId: string, id: string): Promise<NotificationList> {
  const result = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.count({ where: { id, userId } });
    if (!exists) throw ApiException.notFound('Notification not found');
  }
  return list(userId);
}

export async function markAllRead(userId: string): Promise<NotificationList> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return list(userId);
}

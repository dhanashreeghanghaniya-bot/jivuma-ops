import { Prisma, type User } from '@prisma/client';
import type {
  CreateUserInput,
  ListUsersQuery,
  Paginated,
  UpdateUserInput,
  UserListItem,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException, paginate } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { hashPassword, revokeAllSessions } from '../auth/auth.service';

type UserWithRelations = User & {
  hqTown: { id: string; name: string } | null;
  reportingTo: { id: string; name: string } | null;
};

const include = {
  hqTown: { select: { id: true, name: true } },
  reportingTo: { select: { id: true, name: true } },
} satisfies Prisma.UserInclude;

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

export function toUserListItem(user: UserWithRelations): UserListItem {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    photoUrl: user.photoUrl,
    joiningDate: toDateOnly(user.joiningDate),
    hqTown: user.hqTown,
    reportingTo: user.reportingTo,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listUsers(queryInput: ListUsersQuery): Promise<Paginated<UserListItem>> {
  const { page, limit, search, role, isActive } = queryInput;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role ? { role } : {}),
    ...(isActive === undefined ? {} : { isActive }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return paginate(rows.map(toUserListItem), total, page, limit);
}

export async function getUser(id: string): Promise<UserListItem> {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, include });
  if (!user) throw ApiException.notFound('User not found');
  return toUserListItem(user);
}

async function assertReferencesExist(input: {
  hqTownId?: string | null;
  reportingToId?: string | null;
}) {
  if (input.hqTownId) {
    const town = await prisma.town.findFirst({ where: { id: input.hqTownId, deletedAt: null } });
    if (!town) throw ApiException.badRequest('Headquarter town not found');
  }
  if (input.reportingToId) {
    const manager = await prisma.user.findFirst({
      where: { id: input.reportingToId, deletedAt: null },
    });
    if (!manager) throw ApiException.badRequest('Reporting manager not found');
  }
}

export async function createUser(
  input: CreateUserInput,
  actorId: string,
): Promise<UserListItem> {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    throw ApiException.conflict('A user with this mobile number already exists');
  }

  await assertReferencesExist(input);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      joiningDate: new Date(`${input.joiningDate}T00:00:00.000Z`),
      hqTownId: input.hqTownId ?? null,
      reportingToId: input.reportingToId ?? null,
      photoUrl: input.photoUrl ?? null,
    },
    include,
  });

  const result = toUserListItem(user);
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'User',
    entityId: user.id,
    after: result,
  });

  return result;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<UserListItem> {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null }, include });
  if (!existing) throw ApiException.notFound('User not found');

  if (input.reportingToId && input.reportingToId === id) {
    throw ApiException.badRequest('A user cannot report to themselves');
  }
  if (input.phone && input.phone !== existing.phone) {
    const clash = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (clash) throw ApiException.conflict('A user with this mobile number already exists');
  }

  await assertReferencesExist(input);

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.photoUrl === undefined ? {} : { photoUrl: input.photoUrl }),
      ...(input.hqTownId === undefined ? {} : { hqTownId: input.hqTownId }),
      ...(input.reportingToId === undefined ? {} : { reportingToId: input.reportingToId }),
      ...(input.joiningDate === undefined
        ? {}
        : { joiningDate: new Date(`${input.joiningDate}T00:00:00.000Z`) }),
    },
    include,
  });

  // Losing access must take effect immediately, not when the access token expires.
  if (input.isActive === false) await revokeAllSessions(id);

  const result = toUserListItem(user);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'User',
    entityId: id,
    before: toUserListItem(existing),
    after: result,
  });

  return result;
}

export async function resetPassword(
  id: string,
  newPassword: string,
  actorId: string,
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw ApiException.notFound('User not found');

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await revokeAllSessions(id);

  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'User',
    entityId: id,
    after: { passwordReset: true },
  });
}

export async function setActive(
  id: string,
  isActive: boolean,
  actorId: string,
): Promise<UserListItem> {
  if (id === actorId && !isActive) {
    throw ApiException.badRequest('You cannot deactivate your own account');
  }
  return updateUser(id, { isActive }, actorId);
}

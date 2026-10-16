import bcrypt from 'bcryptjs';
import { AUTH, type AuthUser, type LoginResponse } from '@juma/shared';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { logger } from '../../lib/logger';
import {
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './token.service';

const BCRYPT_ROUNDS = 12;

export interface SessionContext {
  userAgent?: string;
  ip?: string;
}

export interface SessionResult extends LoginResponse {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    photoUrl: user.photoUrl,
    hqTownId: user.hqTownId,
  };
}

async function issueSession(user: User, ctx: SessionContext): Promise<SessionResult> {
  const { token, tokenHash } = createRefreshToken();
  const expiresAt = refreshTokenExpiry();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: ctx.userAgent?.slice(0, 255),
      ip: ctx.ip?.slice(0, 64),
    },
  });

  return {
    accessToken: signAccessToken(user.id, user.role),
    expiresIn: AUTH.accessTokenTtlSeconds,
    user: toAuthUser(user),
    refreshToken: token,
    refreshTokenExpiresAt: expiresAt,
  };
}

export async function login(
  phone: string,
  password: string,
  ctx: SessionContext,
): Promise<SessionResult> {
  const user = await prisma.user.findUnique({ where: { phone } });

  // Always run a comparison so a missing user and a wrong password take the
  // same amount of time and cannot be told apart.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const passwordMatches = await verifyPassword(password, hash);

  if (!user || !passwordMatches) throw ApiException.invalidCredentials();
  if (!user.isActive || user.deletedAt) {
    throw ApiException.forbidden('This account has been deactivated. Contact the administrator.');
  }

  return issueSession(user, ctx);
}

export async function refreshSession(
  rawToken: string | undefined,
  ctx: SessionContext,
): Promise<SessionResult> {
  if (!rawToken) throw ApiException.unauthenticated('No session found. Please sign in.');

  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) throw ApiException.unauthenticated('Session is no longer valid.');

  // A revoked token being presented again means it was stolen or replayed:
  // drop every session for that user.
  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.warn('Refresh token reuse detected', { userId: existing.userId });
    throw ApiException.unauthenticated('Session is no longer valid. Please sign in again.');
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw ApiException.unauthenticated('Session has expired. Please sign in again.');
  }

  if (!existing.user.isActive || existing.user.deletedAt) {
    throw ApiException.forbidden('This account has been deactivated.');
  }

  const session = await issueSession(existing.user, ctx);

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedByTokenHash: hashRefreshToken(session.refreshToken) },
  });

  return session;
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { hqTown: { select: { id: true, name: true, districtId: true } } },
  });

  if (!user) throw ApiException.notFound('User not found');
  if (!user.isActive) throw ApiException.forbidden('This account has been deactivated.');

  return { ...toAuthUser(user), hqTown: user.hqTown };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw ApiException.notFound('User not found');

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiException.badRequest('Current password is incorrect', [
      { path: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Force every other device to sign in again.
  await revokeAllSessions(userId);
}

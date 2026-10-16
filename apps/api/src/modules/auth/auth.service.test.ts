import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@juma/shared';
import { hashPassword, login, logout, refreshSession, verifyPassword } from './auth.service';
import { hashRefreshToken } from './token.service';

// `vi.mock` is hoisted above the imports, so the service under test receives
// this stub instead of a real database client.
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  refreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));

const activeUser = {
  id: 'user_1',
  name: 'Ramesh Patel',
  phone: '+919876500001',
  role: Role.SALESMAN,
  isActive: true,
  deletedAt: null,
  photoUrl: null,
  hqTownId: 'town_1',
  passwordHash: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.refreshToken.update.mockResolvedValue({});
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 });
});

describe('password hashing', () => {
  it('accepts the correct password and rejects anything else', async () => {
    const hash = await hashPassword('Juma@12345');

    expect(hash).not.toContain('Juma@12345');
    await expect(verifyPassword('Juma@12345', hash)).resolves.toBe(true);
    await expect(verifyPassword('juma@12345', hash)).resolves.toBe(false);
  });
});

describe('login', () => {
  it('issues an access token and a refresh token for valid credentials', async () => {
    const user = { ...activeUser, passwordHash: await hashPassword('Juma@12345') };
    prismaMock.user.findUnique.mockResolvedValue(user);

    const session = await login('+919876500001', 'Juma@12345', {});

    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user.id).toBe('user_1');
    // Only the hash is persisted.
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenHash: hashRefreshToken(session.refreshToken) }),
      }),
    );
  });

  it('rejects a wrong password', async () => {
    const user = { ...activeUser, passwordHash: await hashPassword('Juma@12345') };
    prismaMock.user.findUnique.mockResolvedValue(user);

    await expect(login('+919876500001', 'wrong-password', {})).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('gives the same error for an unknown number as for a wrong password', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(login('+919999999999', 'anything', {})).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('blocks a deactivated account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...activeUser,
      isActive: false,
      passwordHash: await hashPassword('Juma@12345'),
    });

    await expect(login('+919876500001', 'Juma@12345', {})).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('refresh rotation', () => {
  it('revokes the old token and issues a new one', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_1',
      userId: 'user_1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });

    const session = await refreshSession('raw-token', {});

    expect(session.accessToken).toBeTruthy();
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt_1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('kills every session when an already-revoked token is replayed', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_1',
      userId: 'user_1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });

    await expect(refreshSession('raw-token', {})).rejects.toMatchObject({ status: 401 });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1', revokedAt: null } }),
    );
  });

  it('rejects an expired token', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt_1',
      userId: 'user_1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
      user: activeUser,
    });

    await expect(refreshSession('raw-token', {})).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a missing cookie', async () => {
    await expect(refreshSession(undefined, {})).rejects.toMatchObject({ status: 401 });
  });
});

describe('logout', () => {
  it('revokes the presented token', async () => {
    await logout('raw-token');

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken('raw-token'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('is a no-op without a token', async () => {
    await logout(undefined);
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

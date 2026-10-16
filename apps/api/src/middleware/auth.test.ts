import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { Role } from '@juma/shared';
import { requireAdmin, requireAuth, requireRole } from './auth';
import { signAccessToken } from '../modules/auth/token.service';

const run = (handler: ReturnType<typeof requireRole> | typeof requireAuth, req: Partial<Request>) => {
  const next = vi.fn() as unknown as NextFunction;
  handler(req as Request, {} as Response, next);
  return next as unknown as ReturnType<typeof vi.fn>;
};

describe('requireAuth', () => {
  it('accepts a valid bearer token and attaches the caller', () => {
    const req: Partial<Request> = {
      headers: { authorization: `Bearer ${signAccessToken('user_1', Role.ADMIN)}` },
    };

    const next = run(requireAuth, req);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ userId: 'user_1', role: Role.ADMIN });
  });

  it('rejects a missing header', () => {
    const next = run(requireAuth, { headers: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejects a garbage token', () => {
    const next = run(requireAuth, { headers: { authorization: 'Bearer not-a-jwt' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
});

describe('requireRole', () => {
  it('lets an admin through an admin-only route', () => {
    const next = run(requireAdmin, { auth: { userId: 'user_1', role: Role.ADMIN } });
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks a salesman from an admin-only route', () => {
    const next = run(requireAdmin, { auth: { userId: 'user_2', role: Role.SALESMAN } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('accepts any role in the allow-list, so MANAGER can be added later', () => {
    const guard = requireRole(Role.ADMIN, Role.MANAGER);
    expect(run(guard, { auth: { userId: 'u', role: Role.MANAGER } })).toHaveBeenCalledWith();
    expect(run(guard, { auth: { userId: 'u', role: Role.SALESMAN } })).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('rejects an unauthenticated request', () => {
    const next = run(requireAdmin, {});
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
});

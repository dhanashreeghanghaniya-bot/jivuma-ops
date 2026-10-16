import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Role } from '@juma/shared';
import { ApiException } from '../lib/http';
import { verifyAccessToken } from '../modules/auth/token.service';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(ApiException.unauthenticated());

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    next(ApiException.unauthenticated('Your session has expired. Please sign in again.'));
  }
}

/**
 * Takes a list so MANAGER can be granted access later without touching call sites,
 * e.g. `requireRole(Role.ADMIN, Role.MANAGER)`.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiException.unauthenticated());
    if (!roles.includes(req.auth.role)) return next(ApiException.forbidden());
    next();
  };
}

export const requireAdmin = requireRole(Role.ADMIN);

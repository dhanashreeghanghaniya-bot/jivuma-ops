import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { AUTH, type ChangePasswordInput, type LoginInput } from '@juma/shared';
import { env, isProduction } from '../../config/env';
import { sendOk } from '../../lib/http';
import * as authService from './auth.service';

/**
 * Attributes must match exactly between `res.cookie` and `res.clearCookie`,
 * otherwise the browser keeps the original cookie. `expires` is deliberately
 * excluded: Express rejects it on `clearCookie`.
 */
function refreshCookieAttributes(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProduction,
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/v1/auth',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function sessionContext(req: Request): authService.SessionContext {
  return { userAgent: req.get('user-agent') ?? undefined, ip: req.ip };
}

function setRefreshCookie(res: Response, session: authService.SessionResult) {
  res.cookie(AUTH.refreshCookieName, session.refreshToken, {
    ...refreshCookieAttributes(),
    expires: session.refreshTokenExpiresAt,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(AUTH.refreshCookieName, refreshCookieAttributes());
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, password } = req.body as LoginInput;
    const session = await authService.login(phone, password, sessionContext(req));
    setRefreshCookie(res, session);
    return sendOk(res, {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = req.cookies?.[AUTH.refreshCookieName] as string | undefined;
    const session = await authService.refreshSession(raw, sessionContext(req));
    setRefreshCookie(res, session);
    return sendOk(res, {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(req.cookies?.[AUTH.refreshCookieName] as string | undefined);
    clearRefreshCookie(res);
    return sendOk(res, { success: true });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    return sendOk(res, await authService.getCurrentUser(req.auth!.userId));
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body as ChangePasswordInput;
    await authService.changePassword(req.auth!.userId, currentPassword, newPassword);
    clearRefreshCookie(res);
    return sendOk(res, { success: true });
  } catch (err) {
    next(err);
  }
}

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AUTH, type AccessTokenPayload, type Role } from '@juma/shared';
import { env } from '../../config/env';

export function signAccessToken(userId: string, role: Role): string {
  const payload: AccessTokenPayload = { sub: userId, role };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: AUTH.accessTokenTtlSeconds,
    issuer: 'juma-api',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'juma-api' });
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('Malformed access token');
  return { sub: String(decoded.sub), role: (decoded as jwt.JwtPayload).role as Role };
}

/**
 * Refresh tokens are opaque random strings. Only an HMAC of the token is stored,
 * so a database leak alone cannot be used to mint sessions.
 */
export function createRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

export function refreshTokenExpiry(from = new Date()): Date {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + AUTH.refreshTokenTtlDays);
  return expires;
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

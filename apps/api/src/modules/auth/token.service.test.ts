import { describe, expect, it } from 'vitest';
import { Role } from '@juma/shared';
import {
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from './token.service';

describe('token.service', () => {
  it('round-trips the user id and role through the access token', () => {
    const token = signAccessToken('user_123', Role.SALESMAN);
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe('user_123');
    expect(payload.role).toBe(Role.SALESMAN);
  });

  it('rejects a tampered access token', () => {
    const token = signAccessToken('user_123', Role.ADMIN);
    expect(() => verifyAccessToken(`${token}x`)).toThrow();
  });

  it('never stores the raw refresh token', () => {
    const { token, tokenHash } = createRefreshToken();

    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toHaveLength(64);
    expect(hashRefreshToken(token)).toBe(tokenHash);
  });

  it('issues a different refresh token every time', () => {
    expect(createRefreshToken().token).not.toBe(createRefreshToken().token);
  });

  it('expires refresh tokens 30 days out', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(refreshTokenExpiry(from).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});

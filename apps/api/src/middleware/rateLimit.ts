import rateLimit from 'express-rate-limit';
import { ApiErrorCode } from '@juma/shared';
import { isTest } from '../config/env';

const tooManyRequests = {
  data: null,
  error: {
    code: ApiErrorCode.RATE_LIMITED,
    message: 'Too many attempts. Please wait a few minutes and try again.',
  },
  meta: null,
};

/** Brute-force protection on the credential endpoints. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1_000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: tooManyRequests,
});

/** Broad safety net for everything else. */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 100_000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooManyRequests,
});

import { Router } from 'express';
import { changePasswordSchema, loginSchema } from '@juma/shared';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', authRateLimiter, validateBody(loginSchema), controller.login);
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', controller.logout);
authRouter.post(
  '/change-password',
  requireAuth,
  authRateLimiter,
  validateBody(changePasswordSchema),
  controller.changePassword,
);

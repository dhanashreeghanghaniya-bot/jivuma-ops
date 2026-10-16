import { Router } from 'express';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
} from '@juma/shared';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import * as controller from './users.controller';

export const usersRouter = Router();

// Every user endpoint is admin-only.
usersRouter.use(requireAuth, requireAdmin);

usersRouter.get('/', validateQuery(listUsersQuerySchema), controller.list);
usersRouter.get('/:id', controller.getById);
usersRouter.post('/', validateBody(createUserSchema), controller.create);
usersRouter.patch('/:id', validateBody(updateUserSchema), controller.update);
usersRouter.post(
  '/:id/reset-password',
  validateBody(resetPasswordSchema),
  controller.resetPassword,
);
usersRouter.post('/:id/deactivate', controller.deactivate);
usersRouter.post('/:id/activate', controller.activate);

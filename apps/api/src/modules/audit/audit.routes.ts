import { Router } from 'express';
import { auditQuerySchema } from '@juma/shared';
import { sendOk, sendPaginated } from '../../lib/http';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { query, validateQuery } from '../../middleware/validate';
import * as audit from './audit.service';

export const auditRouter = Router();

// The trail shows every change by everyone, so only the owner reads it.
auditRouter.use(requireAuth, requireAdmin);

auditRouter.get('/entities', async (_req, res, next) => {
  try {
    return sendOk(res, await audit.entities());
  } catch (err) {
    next(err);
  }
});

auditRouter.get('/', validateQuery(auditQuerySchema), async (req, res, next) => {
  try {
    return sendPaginated(res, await audit.list(query(req, auditQuerySchema)));
  } catch (err) {
    next(err);
  }
});

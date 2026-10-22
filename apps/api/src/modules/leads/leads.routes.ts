import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  Role,
  changeLeadStageSchema,
  convertLeadSchema,
  createLeadActivitySchema,
  createLeadSchema,
  listLeadsQuerySchema,
  updateLeadSchema,
  type ChangeLeadStageInput,
  type ConvertLeadInput,
  type CreateLeadActivityInput,
  type CreateLeadInput,
  type UpdateLeadInput,
} from '@juma/shared';
import { sendOk, sendPaginated } from '../../lib/http';
import { requireAdmin, requireAuth, requireRole } from '../../middleware/auth';
import { query, validateBody, validateQuery } from '../../middleware/validate';
import { convert } from './leads.convert';
import * as service from './leads.service';

export const leadsRouter = Router();

leadsRouter.use(requireAuth, requireRole(Role.ADMIN, Role.MANAGER));

const wrap =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };

// Fixed sub-paths first, so `/:id` does not swallow them.
leadsRouter.get(
  '/pipeline',
  validateQuery(listLeadsQuerySchema),
  wrap(async (req, res) => sendOk(res, await service.pipeline(query(req, listLeadsQuerySchema)))),
);

leadsRouter.get(
  '/funnel',
  validateQuery(listLeadsQuerySchema),
  wrap(async (req, res) => sendOk(res, await service.funnel(query(req, listLeadsQuerySchema)))),
);

leadsRouter.get(
  '/',
  validateQuery(listLeadsQuerySchema),
  wrap(async (req, res) =>
    sendPaginated(res, await service.list(query(req, listLeadsQuerySchema))),
  ),
);

leadsRouter.get(
  '/:id',
  wrap(async (req, res) => sendOk(res, await service.getById(req.params.id as string))),
);

leadsRouter.post(
  '/',
  validateBody(createLeadSchema),
  wrap(async (req, res) =>
    sendOk(res, await service.create(req.body as CreateLeadInput, req.auth!.userId), null, 201),
  ),
);

leadsRouter.patch(
  '/:id',
  validateBody(updateLeadSchema),
  wrap(async (req, res) =>
    sendOk(
      res,
      await service.update(req.params.id as string, req.body as UpdateLeadInput, req.auth!.userId),
    ),
  ),
);

leadsRouter.post(
  '/:id/stage',
  validateBody(changeLeadStageSchema),
  wrap(async (req, res) =>
    sendOk(
      res,
      await service.changeStage(
        req.params.id as string,
        req.body as ChangeLeadStageInput,
        req.auth!.userId,
      ),
    ),
  ),
);

leadsRouter.post(
  '/:id/activities',
  validateBody(createLeadActivitySchema),
  wrap(async (req, res) =>
    sendOk(
      res,
      await service.addActivity(
        req.params.id as string,
        req.body as CreateLeadActivityInput,
        req.auth!.userId,
      ),
      null,
      201,
    ),
  ),
);

// Creating a partner is an admin act, even from a lead a manager owns.
leadsRouter.post(
  '/:id/convert',
  requireAdmin,
  validateBody(convertLeadSchema),
  wrap(async (req, res) =>
    sendOk(
      res,
      await convert(req.params.id as string, req.body as ConvertLeadInput, req.auth!.userId),
      null,
      201,
    ),
  ),
);

leadsRouter.delete(
  '/:id',
  requireAdmin,
  wrap(async (req, res) => {
    await service.remove(req.params.id as string, req.auth!.userId);
    return sendOk(res, { success: true });
  }),
);

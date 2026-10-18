import { Router, type NextFunction, type Request, type Response, type RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import {
  Role,
  createDistributorSchema,
  createRetailerSchema,
  createSuperStockistSchema,
  listDistributorsQuerySchema,
  listRetailersQuerySchema,
  listSuperStockistsQuerySchema,
  updateDistributorSchema,
  updateRetailerSchema,
  updateSuperStockistSchema,
} from '@juma/shared';
import type { Paginated } from '@juma/shared';
import { sendOk, sendPaginated } from '../../lib/http';
import { requireAdmin, requireAuth, requireRole } from '../../middleware/auth';
import { query, validateBody, validateQuery } from '../../middleware/validate';
import * as superStockists from './superStockists.service';
import * as distributors from './distributors.service';
import * as retailers from './retailers.service';

/**
 * The three partner levels expose an identical REST surface, so the handlers
 * are generated from the service module rather than written out three times.
 */
interface PartnerService<ListQuery, CreateInput, UpdateInput, Item> {
  list: (q: ListQuery) => Promise<Paginated<Item>>;
  getById: (id: string) => Promise<Item>;
  create: (input: CreateInput, actorId: string) => Promise<Item>;
  update: (id: string, input: UpdateInput, actorId: string) => Promise<Item>;
  remove: (id: string, actorId: string) => Promise<void>;
}

function partnerRouter<ListQuery, CreateInput, UpdateInput, Item>(
  service: PartnerService<ListQuery, CreateInput, UpdateInput, Item>,
  schemas: { list: ZodTypeAny; create: ZodTypeAny; update: ZodTypeAny },
  extra?: (router: Router) => void,
): Router {
  const router = Router();

  const wrap =
    (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    async (req, res, next: NextFunction) => {
      try {
        await handler(req, res);
      } catch (err) {
        next(err);
      }
    };

  router.get(
    '/',
    validateQuery(schemas.list),
    wrap(async (req, res) => sendPaginated(res, await service.list(query(req, schemas.list)))),
  );

  // Mounted before `/:id` so fixed sub-paths are not swallowed by the param route.
  extra?.(router);

  router.get(
    '/:id',
    wrap(async (req, res) => sendOk(res, await service.getById(req.params.id as string))),
  );

  router.post(
    '/',
    requireAdmin,
    validateBody(schemas.create),
    wrap(async (req, res) =>
      sendOk(res, await service.create(req.body as CreateInput, req.auth!.userId), null, 201),
    ),
  );

  router.patch(
    '/:id',
    requireAdmin,
    validateBody(schemas.update),
    wrap(async (req, res) =>
      sendOk(res, await service.update(req.params.id as string, req.body as UpdateInput, req.auth!.userId)),
    ),
  );

  router.delete(
    '/:id',
    requireAdmin,
    wrap(async (req, res) => {
      await service.remove(req.params.id as string, req.auth!.userId);
      return sendOk(res, { success: true });
    }),
  );

  return router;
}

const readRoles = requireRole(Role.ADMIN, Role.MANAGER);

export const superStockistsRouter = Router();
superStockistsRouter.use(requireAuth, readRoles);
superStockistsRouter.use(
  partnerRouter(superStockists, {
    list: listSuperStockistsQuerySchema,
    create: createSuperStockistSchema,
    update: updateSuperStockistSchema,
  }),
);

export const distributorsRouter = Router();
distributorsRouter.use(requireAuth, readRoles);
distributorsRouter.use(
  partnerRouter(distributors, {
    list: listDistributorsQuerySchema,
    create: createDistributorSchema,
    update: updateDistributorSchema,
  }),
);

export const retailersRouter = Router();
retailersRouter.use(requireAuth, readRoles);
retailersRouter.use(
  partnerRouter(
    retailers,
    {
      list: listRetailersQuerySchema,
      create: createRetailerSchema,
      update: updateRetailerSchema,
    },
    (router) => {
      router.post('/:id/verify', requireAdmin, async (req, res, next) => {
        try {
          return sendOk(res, await retailers.verify(req.params.id as string, req.auth!.userId));
        } catch (err) {
          next(err);
        }
      });
    },
  ),
);

import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  Role,
  changeOrderStatusSchema,
  createOrderSchema,
  createProductSchema,
  listOrdersQuerySchema,
  listProductsQuerySchema,
  updateProductSchema,
  type ChangeOrderStatusInput,
  type CreateOrderInput,
  type CreateProductInput,
  type UpdateProductInput,
} from '@juma/shared';
import { sendOk } from '../../lib/http';
import { requireAdmin, requireAuth, requireRole } from '../../middleware/auth';
import { query, validateBody, validateQuery } from '../../middleware/validate';
import * as orders from './orders.service';
import * as products from './products.service';

const wrap =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };

const anyStaff = requireRole(Role.ADMIN, Role.MANAGER, Role.SALESMAN);
const viewer = (req: Request): orders.Viewer => ({
  userId: req.auth!.userId,
  isAdmin: req.auth!.role !== Role.SALESMAN,
});

// --- /orders -----------------------------------------------------------------

export const ordersRouter = Router();
ordersRouter.use(requireAuth, anyStaff);

/** Salesmen get only the orders they took; admins everything (SPEC 6). */
ordersRouter.get(
  '/',
  validateQuery(listOrdersQuerySchema),
  wrap(async (req, res) => {
    const { items, meta } = await orders.list(query(req, listOrdersQuerySchema), viewer(req));
    return sendOk(res, items, meta);
  }),
);
ordersRouter.get(
  '/:id',
  wrap(async (req, res) => sendOk(res, await orders.getById(req.params.id as string, viewer(req)))),
);
ordersRouter.post(
  '/',
  requireAdmin,
  validateBody(createOrderSchema),
  wrap(async (req, res) =>
    sendOk(res, await orders.create(req.body as CreateOrderInput, req.auth!.userId), null, 201),
  ),
);
ordersRouter.post(
  '/:id/status',
  requireAdmin,
  validateBody(changeOrderStatusSchema),
  wrap(async (req, res) =>
    sendOk(
      res,
      await orders.changeStatus(
        req.params.id as string,
        req.body as ChangeOrderStatusInput,
        req.auth!.userId,
      ),
    ),
  ),
);

// --- /products ---------------------------------------------------------------

export const productsRouter = Router();
productsRouter.use(requireAuth, anyStaff);

productsRouter.get(
  '/',
  validateQuery(listProductsQuerySchema),
  wrap(async (req, res) =>
    sendOk(
      res,
      await products.list(query(req, listProductsQuerySchema), req.auth!.role !== Role.SALESMAN),
    ),
  ),
);
productsRouter.post(
  '/',
  requireAdmin,
  validateBody(createProductSchema),
  wrap(async (req, res) =>
    sendOk(res, await products.create(req.body as CreateProductInput, req.auth!.userId), null, 201),
  ),
);
productsRouter.put(
  '/:id',
  requireAdmin,
  validateBody(updateProductSchema),
  wrap(async (req, res) =>
    sendOk(
      res,
      await products.update(
        req.params.id as string,
        req.body as UpdateProductInput,
        req.auth!.userId,
      ),
    ),
  ),
);

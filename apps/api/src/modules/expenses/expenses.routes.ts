import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  Role,
  allowancePolicySchema,
  attachBillsSchema,
  bulkApproveSchema,
  createExpenseSchema,
  listExpensesQuerySchema,
  reviewExpenseSchema,
  updateExpenseSchema,
  type AllowancePolicyInput,
  type AttachBillsInput,
  type BulkApproveInput,
  type CreateExpenseInput,
  type ReviewExpenseInput,
  type UpdateExpenseInput,
} from '@juma/shared';
import { sendOk } from '../../lib/http';
import { requireAdmin, requireAuth, requireRole } from '../../middleware/auth';
import { query, validateBody, validateQuery } from '../../middleware/validate';
import * as notifications from '../notifications/notifications.service';
import * as expenses from './expenses.service';
import * as policy from './policy.service';

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
const salesmanOnly = requireRole(Role.SALESMAN);
const me = (req: Request) => req.auth!.userId;
const viewer = (req: Request): expenses.Viewer => ({
  userId: me(req),
  isAdmin: req.auth!.role !== Role.SALESMAN,
});
const id = (req: Request) => req.params.id as string;

// --- /expenses ---------------------------------------------------------------

export const expensesRouter = Router();
expensesRouter.use(requireAuth, anyStaff);

expensesRouter.get(
  '/',
  validateQuery(listExpensesQuerySchema),
  wrap(async (req, res) =>
    sendOk(res, await expenses.list(query(req, listExpensesQuerySchema), viewer(req))),
  ),
);
// Fixed paths before `/:id`.
expensesRouter.post(
  '/bulk-approve',
  requireAdmin,
  validateBody(bulkApproveSchema),
  wrap(async (req, res) =>
    sendOk(res, await expenses.bulkApprove(req.body as BulkApproveInput, me(req))),
  ),
);
expensesRouter.post(
  '/',
  salesmanOnly,
  validateBody(createExpenseSchema),
  wrap(async (req, res) =>
    sendOk(res, await expenses.create(me(req), req.body as CreateExpenseInput), null, 201),
  ),
);
expensesRouter.patch(
  '/:id',
  salesmanOnly,
  validateBody(updateExpenseSchema),
  wrap(async (req, res) =>
    sendOk(res, await expenses.update(me(req), id(req), req.body as UpdateExpenseInput)),
  ),
);
expensesRouter.delete(
  '/:id',
  salesmanOnly,
  wrap(async (req, res) => {
    await expenses.remove(me(req), id(req));
    return sendOk(res, { success: true });
  }),
);
expensesRouter.post(
  '/:id/bills',
  salesmanOnly,
  validateBody(attachBillsSchema),
  wrap(async (req, res) =>
    sendOk(res, await expenses.attachBills(me(req), id(req), req.body as AttachBillsInput)),
  ),
);
expensesRouter.post(
  '/:id/submit',
  salesmanOnly,
  wrap(async (req, res) => sendOk(res, await expenses.submit(me(req), id(req)))),
);
expensesRouter.post(
  '/:id/review',
  requireAdmin,
  validateBody(reviewExpenseSchema),
  wrap(async (req, res) =>
    sendOk(res, await expenses.review(id(req), req.body as ReviewExpenseInput, me(req))),
  ),
);

// --- /settings/allowance-policy (SPEC 6: GET/PUT) -------------------------------

export const policyRouter = Router();
policyRouter.use(requireAuth);

/** Everyone can read the rates; salesmen see what their TA/DA is based on. */
policyRouter.get(
  '/',
  anyStaff,
  wrap(async (_req, res) => sendOk(res, await policy.list())),
);
policyRouter.put(
  '/',
  requireAdmin,
  validateBody(allowancePolicySchema),
  wrap(async (req, res) =>
    sendOk(res, await policy.save(req.body as AllowancePolicyInput, me(req))),
  ),
);

// --- /notifications -----------------------------------------------------------

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, anyStaff);

notificationsRouter.get(
  '/',
  wrap(async (req, res) => sendOk(res, await notifications.list(me(req)))),
);
notificationsRouter.post(
  '/read-all',
  wrap(async (req, res) => sendOk(res, await notifications.markAllRead(me(req)))),
);
notificationsRouter.post(
  '/:id/read',
  wrap(async (req, res) => sendOk(res, await notifications.markRead(me(req), id(req)))),
);

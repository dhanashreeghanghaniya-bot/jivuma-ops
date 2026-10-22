import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  Role,
  attachVisitPhotosSchema,
  createVisitSchema,
  endWorkDaySchema,
  fieldLeadSchema,
  listVisitsQuerySchema,
  listWorkDaysQuerySchema,
  pingBatchSchema,
  presignUploadSchema,
  signedReadSchema,
  startWorkDaySchema,
  type AttachVisitPhotosInput,
  type CreateVisitInput,
  type EndWorkDayInput,
  type FieldLeadInput,
  type PingBatchInput,
  type PresignUploadInput,
  type SignedReadInput,
  type StartWorkDayInput,
} from '@juma/shared';
import { ApiException, sendOk } from '../../lib/http';
import { isStorageConfigured, presignUpload, signedReadUrls } from '../../lib/storage';
import { requireAuth, requireRole } from '../../middleware/auth';
import { query, validateBody, validateQuery } from '../../middleware/validate';
import * as field from './field.service';
import * as visits from './visits.service';
import * as workdays from './workdays.service';

const wrap =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };

const me = (req: Request) => req.auth!.userId;
const viewer = (req: Request) => ({ userId: me(req), isAdmin: req.auth!.role !== Role.SALESMAN });

const salesmanOnly = requireRole(Role.SALESMAN);
const anyStaff = requireRole(Role.ADMIN, Role.MANAGER, Role.SALESMAN);

// --- /workdays -------------------------------------------------------------

export const workdaysRouter = Router();
workdaysRouter.use(requireAuth);

workdaysRouter.get(
  '/',
  anyStaff,
  validateQuery(listWorkDaysQuerySchema),
  wrap(async (req, res) =>
    sendOk(res, await workdays.list(query(req, listWorkDaysQuerySchema), viewer(req))),
  ),
);
workdaysRouter.get(
  '/current',
  salesmanOnly,
  wrap(async (req, res) => sendOk(res, await workdays.current(me(req)))),
);
workdaysRouter.post(
  '/start',
  salesmanOnly,
  validateBody(startWorkDaySchema),
  wrap(async (req, res) =>
    sendOk(res, await workdays.start(me(req), req.body as StartWorkDayInput), null, 201),
  ),
);
workdaysRouter.post(
  '/:id/end',
  salesmanOnly,
  validateBody(endWorkDaySchema),
  wrap(async (req, res) =>
    sendOk(res, await workdays.end(me(req), req.params.id as string, req.body as EndWorkDayInput)),
  ),
);
workdaysRouter.post(
  '/:id/submit',
  salesmanOnly,
  wrap(async (req, res) => sendOk(res, await workdays.submit(me(req), req.params.id as string))),
);

// --- /visits ---------------------------------------------------------------

export const visitsRouter = Router();
visitsRouter.use(requireAuth);

visitsRouter.get(
  '/',
  anyStaff,
  validateQuery(listVisitsQuerySchema),
  wrap(async (req, res) =>
    sendOk(res, await visits.list(query(req, listVisitsQuerySchema), viewer(req))),
  ),
);
visitsRouter.post(
  '/',
  salesmanOnly,
  validateBody(createVisitSchema),
  wrap(async (req, res) =>
    sendOk(res, await visits.create(me(req), req.body as CreateVisitInput), null, 201),
  ),
);
visitsRouter.post(
  '/:id/photos',
  salesmanOnly,
  validateBody(attachVisitPhotosSchema),
  wrap(async (req, res) =>
    sendOk(
      res,
      await visits.attachPhotos(
        me(req),
        req.params.id as string,
        req.body as AttachVisitPhotosInput,
      ),
    ),
  ),
);

// --- /field: offline bootstrap, pings, leads from the field ------------------

export const fieldRouter = Router();
fieldRouter.use(requireAuth, salesmanOnly);

fieldRouter.get(
  '/bootstrap',
  wrap(async (req, res) => sendOk(res, await field.bootstrap(me(req)))),
);
fieldRouter.post(
  '/pings',
  validateBody(pingBatchSchema),
  wrap(async (req, res) =>
    sendOk(res, await field.recordPings(me(req), req.body as PingBatchInput)),
  ),
);
fieldRouter.post(
  '/leads',
  validateBody(fieldLeadSchema),
  wrap(async (req, res) =>
    sendOk(res, await field.createLead(me(req), req.body as FieldLeadInput), null, 201),
  ),
);

// --- /uploads --------------------------------------------------------------

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

uploadsRouter.get(
  '/status',
  anyStaff,
  wrap(async (_req, res) => sendOk(res, { configured: isStorageConfigured() })),
);
uploadsRouter.post(
  '/presign',
  salesmanOnly,
  validateBody(presignUploadSchema),
  wrap(async (req, res) => {
    const input = req.body as PresignUploadInput;
    return sendOk(res, await presignUpload(input.kind, me(req), input.key));
  }),
);
/** Short-lived read URLs. Salesmen may only read their own files. */
uploadsRouter.post(
  '/signed-read',
  anyStaff,
  validateBody(signedReadSchema),
  wrap(async (req, res) => {
    const { paths } = req.body as SignedReadInput;
    if (req.auth!.role === Role.SALESMAN && paths.some((p) => p.split('/')[1] !== me(req))) {
      throw ApiException.forbidden('You can only view your own photos');
    }
    return sendOk(res, await signedReadUrls(paths));
  }),
);

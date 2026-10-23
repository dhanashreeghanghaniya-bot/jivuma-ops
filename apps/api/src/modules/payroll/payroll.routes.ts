import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  Role,
  changeReportStatusSchema,
  incentiveSchema,
  monthQuerySchema,
  salaryStructureSchema,
  updateCostReportSchema,
  type ChangeReportStatusInput,
  type IncentiveInput,
  type SalaryStructureInput,
  type UpdateCostReportInput,
} from '@juma/shared';
import { sendOk } from '../../lib/http';
import { requireAdmin, requireAuth, requireRole } from '../../middleware/auth';
import { query, validateBody, validateQuery } from '../../middleware/validate';
import * as payroll from './payroll.service';
import { costReportPdf, costReportWorkbook } from './payroll.exports';

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
const id = (req: Request) => req.params.id as string;

function sendFile(res: Response, buffer: Buffer, type: string, filename: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

// --- /salary-structures (admin) -------------------------------------------------------

export const salaryRouter = Router();
salaryRouter.use(requireAuth, requireAdmin);
salaryRouter.get(
  '/',
  wrap(async (_req, res) => sendOk(res, await payroll.listSalary())),
);
salaryRouter.put(
  '/',
  validateBody(salaryStructureSchema),
  wrap(async (req, res) =>
    sendOk(res, await payroll.saveSalary(req.body as SalaryStructureInput, me(req))),
  ),
);
salaryRouter.delete(
  '/:id',
  wrap(async (req, res) => sendOk(res, await payroll.deleteSalary(id(req), me(req)))),
);

// --- /incentives (admin) ----------------------------------------------------------------

export const incentivesRouter = Router();
incentivesRouter.use(requireAuth, requireAdmin);
incentivesRouter.get(
  '/',
  validateQuery(monthQuerySchema),
  wrap(async (req, res) =>
    sendOk(res, await payroll.listIncentives(query(req, monthQuerySchema).month)),
  ),
);
incentivesRouter.post(
  '/',
  validateBody(incentiveSchema),
  wrap(async (req, res) =>
    sendOk(res, await payroll.addIncentive(req.body as IncentiveInput, me(req)), null, 201),
  ),
);
incentivesRouter.delete(
  '/:id',
  wrap(async (req, res) => sendOk(res, await payroll.deleteIncentive(id(req), me(req)))),
);

// --- /reports/monthly-cost (SPEC 6) --------------------------------------------------------

export const costReportRouter = Router();
costReportRouter.use(requireAuth);

const admin = [requireAdmin];
const anyStaff = requireRole(Role.ADMIN, Role.MANAGER, Role.SALESMAN);

/** A salesman's own statements, once FINAL (SPEC 5.2 "My month"). */
costReportRouter.get(
  '/mine',
  requireRole(Role.SALESMAN),
  wrap(async (req, res) => sendOk(res, await payroll.myReports(me(req)))),
);
costReportRouter.get(
  '/',
  ...admin,
  validateQuery(monthQuerySchema),
  wrap(async (req, res) =>
    sendOk(res, await payroll.listReports(query(req, monthQuerySchema).month)),
  ),
);
costReportRouter.post(
  '/generate',
  ...admin,
  validateQuery(monthQuerySchema),
  wrap(async (req, res) =>
    sendOk(res, await payroll.generate(query(req, monthQuerySchema).month, me(req))),
  ),
);
costReportRouter.get(
  '/export.xlsx',
  ...admin,
  validateQuery(monthQuerySchema),
  wrap(async (req, res) => {
    const { month } = query(req, monthQuerySchema);
    const buffer = await costReportWorkbook(await payroll.listReports(month));
    sendFile(
      res,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `juma-cost-report-${month}.xlsx`,
    );
  }),
);
costReportRouter.patch(
  '/:id',
  ...admin,
  validateBody(updateCostReportSchema),
  wrap(async (req, res) =>
    sendOk(res, await payroll.updateReport(id(req), req.body as UpdateCostReportInput, me(req))),
  ),
);
costReportRouter.post(
  '/:id/status',
  ...admin,
  validateBody(changeReportStatusSchema),
  wrap(async (req, res) =>
    sendOk(res, await payroll.changeStatus(id(req), req.body as ChangeReportStatusInput, me(req))),
  ),
);
costReportRouter.get(
  '/:id/pdf',
  anyStaff,
  wrap(async (req, res) => {
    const report = await payroll.reportForExport(id(req), {
      userId: me(req),
      isAdmin: req.auth!.role !== Role.SALESMAN,
    });
    const name = report.salesman.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    sendFile(
      res,
      await costReportPdf(report),
      'application/pdf',
      `juma-${name}-${report.month}.pdf`,
    );
  }),
);

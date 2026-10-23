import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  leadReportQuerySchema,
  salesReportQuerySchema,
  type CoverageReportRow,
  type SalesReportRow,
} from '@juma/shared';
import { sendOk } from '../../lib/http';
import { buildWorkbook, sheet } from '../../lib/excel';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { query, validateQuery } from '../../middleware/validate';
import { monthLabel } from '../payroll/payroll.service';
import * as analytics from './analytics.service';

const wrap =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function sendXlsx(res: Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

const GROUP_LABEL = {
  district: 'District',
  town: 'Town',
  distributor: 'Distributor',
  product: 'Product',
};
const LEVEL_LABEL = {
  COMPANY_TO_SS: 'Primary sales (company to super stockist)',
  SS_TO_DISTRIBUTOR: 'Super stockist to distributor',
  DISTRIBUTOR_TO_RETAILER: 'Secondary sales (distributor to shop)',
};

/** Analytics are for the owner (SPEC 4.7). */
export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireAdmin);

reportsRouter.get(
  '/sales',
  validateQuery(salesReportQuerySchema),
  wrap(async (req, res) => sendOk(res, await analytics.sales(query(req, salesReportQuerySchema)))),
);
reportsRouter.get(
  '/sales.xlsx',
  validateQuery(salesReportQuerySchema),
  wrap(async (req, res) => {
    const r = await analytics.sales(query(req, salesReportQuerySchema));
    const buffer = await buildWorkbook([
      sheet<SalesReportRow>({
        name: `Sales by ${r.groupBy}`,
        title: `Sales by ${r.groupBy}, ${monthLabel(r.months[0]!)} to ${monthLabel(r.months.at(-1)!)}`,
        subtitle: `${LEVEL_LABEL[r.level]}. Cancelled orders excluded. Amounts in rupees.`,
        totals: true,
        rows: r.rows,
        columns: [
          { header: GROUP_LABEL[r.groupBy], width: 28, value: (row) => row.label },
          {
            header: r.groupBy === 'product' ? 'SKU' : r.groupBy === 'district' ? 'Zone' : 'Where',
            width: 18,
            value: (row) => row.detail,
          },
          ...r.months.map((m) => ({
            header: monthLabel(m),
            money: true,
            width: 14,
            value: (row: SalesReportRow) => row.byMonth[m] ?? '0',
          })),
          { header: 'Total', money: true, width: 16, value: (row) => row.total },
          { header: 'Orders', sum: true, value: (row) => row.orders },
        ],
      }),
    ]);
    sendXlsx(res, buffer, `juma-sales-by-${r.groupBy}-${r.months[0]}-to-${r.months.at(-1)}.xlsx`);
  }),
);

reportsRouter.get(
  '/coverage',
  wrap(async (_req, res) => sendOk(res, await analytics.coverage())),
);
reportsRouter.get(
  '/coverage.xlsx',
  wrap(async (_req, res) => {
    const r = await analytics.coverage();
    const buffer = await buildWorkbook([
      sheet<CoverageReportRow>({
        name: 'Coverage',
        title: 'Coverage by district',
        subtitle:
          'A town is covered when an active distributor sits in it or covers it. Sales: secondary, this month.',
        totals: true,
        rows: r.rows,
        columns: [
          { header: 'District', width: 20, value: (row) => row.district.name },
          { header: 'Zone', width: 16, value: (row) => row.district.zone.replace('_', ' ') },
          { header: 'Status', width: 12, value: (row) => row.status.replace('_', ' ') },
          { header: 'Towns', sum: true, value: (row) => row.towns },
          { header: 'Towns covered', sum: true, value: (row) => row.townsCovered },
          { header: 'Super stockists', sum: true, value: (row) => row.superStockists },
          { header: 'Distributors', sum: true, value: (row) => row.distributors },
          { header: 'Shops', sum: true, value: (row) => row.retailers },
          { header: 'Open leads', sum: true, value: (row) => row.openLeads },
          {
            header: 'Sales this month',
            money: true,
            width: 16,
            value: (row) => row.salesThisMonth,
          },
        ],
      }),
    ]);
    sendXlsx(res, buffer, 'juma-coverage.xlsx');
  }),
);

reportsRouter.get(
  '/leads',
  validateQuery(leadReportQuerySchema),
  wrap(async (req, res) =>
    sendOk(res, await analytics.leadFunnel(query(req, leadReportQuerySchema))),
  ),
);

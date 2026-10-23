import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  beatSchema,
  calendarQuerySchema,
  flagsQuerySchema,
  rangeQuerySchema,
  territorySchema,
  type BeatInput,
  type RangeReport,
  type TerritoryInput,
} from '@juma/shared';
import { sendOk } from '../../lib/http';
import { buildWorkbook, sheet } from '../../lib/excel';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { query, validateBody, validateQuery } from '../../middleware/validate';
import * as team from './salesteam.service';

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
const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('-');

/** SPEC 4.5. Admin-only: history is never deleted and covers deactivated salesmen too. */
export const salesTeamRouter = Router();
salesTeamRouter.use(requireAuth, requireAdmin);

salesTeamRouter.get(
  '/today',
  wrap(async (_req, res) => sendOk(res, await team.today())),
);
salesTeamRouter.get(
  '/flags',
  validateQuery(flagsQuerySchema),
  wrap(async (req, res) => sendOk(res, await team.flags(query(req, flagsQuerySchema)))),
);
salesTeamRouter.get(
  '/days/:id',
  wrap(async (req, res) => sendOk(res, await team.dayDetail(id(req)))),
);
salesTeamRouter.put(
  '/beats/:id',
  validateBody(beatSchema),
  wrap(async (req, res) =>
    sendOk(res, await team.updateBeat(id(req), req.body as BeatInput, me(req))),
  ),
);
salesTeamRouter.delete(
  '/beats/:id',
  wrap(async (req, res) => sendOk(res, await team.retireBeat(id(req), me(req)))),
);
salesTeamRouter.get(
  '/:id',
  wrap(async (req, res) => sendOk(res, await team.profile(id(req)))),
);
salesTeamRouter.put(
  '/:id/territory',
  validateBody(territorySchema),
  wrap(async (req, res) =>
    sendOk(res, await team.saveTerritory(id(req), req.body as TerritoryInput, me(req))),
  ),
);
salesTeamRouter.post(
  '/:id/beats',
  validateBody(beatSchema),
  wrap(async (req, res) =>
    sendOk(res, await team.createBeat(id(req), req.body as BeatInput, me(req)), null, 201),
  ),
);
salesTeamRouter.get(
  '/:id/calendar',
  validateQuery(calendarQuerySchema),
  wrap(async (req, res) =>
    sendOk(res, await team.calendar(id(req), query(req, calendarQuerySchema).month)),
  ),
);
salesTeamRouter.get(
  '/:id/range',
  validateQuery(rangeQuerySchema),
  wrap(async (req, res) => sendOk(res, await team.range(id(req), query(req, rangeQuerySchema)))),
);
salesTeamRouter.get(
  '/:id/range.xlsx',
  validateQuery(rangeQuerySchema),
  wrap(async (req, res) => {
    const r = await team.range(id(req), query(req, rangeQuerySchema));
    const period = `${r.salesman.name}, ${dmy(r.from)} to ${dmy(r.to)}`;
    const buffer = await buildWorkbook([
      sheet<RangeReport['towns'][number]>({
        name: 'Towns',
        title: `Towns visited: ${period}`,
        totals: true,
        rows: r.towns,
        columns: [
          { header: 'Town', width: 20, value: (t) => t.name },
          { header: 'District', width: 18, value: (t) => t.district },
          { header: 'Visits', sum: true, value: (t) => t.visits },
          { header: 'Days', sum: true, value: (t) => t.days },
        ],
      }),
      sheet<RangeReport['shops'][number]>({
        name: 'Shops',
        title: `Shops visited: ${period}`,
        totals: true,
        rows: r.shops,
        columns: [
          { header: 'Shop', width: 26, value: (s) => s.name },
          { header: 'Town', width: 16, value: (s) => s.town },
          { header: 'Visits', sum: true, value: (s) => s.visits },
          { header: 'Orders', sum: true, value: (s) => s.orders },
          { header: 'Order value', money: true, width: 14, value: (s) => s.orderValue },
          { header: 'Last visit', width: 12, value: (s) => dmy(s.lastVisit) },
        ],
      }),
      sheet<RangeReport['orders'][number]>({
        name: 'Orders',
        title: `Orders taken: ${period}`,
        totals: true,
        rows: r.orders,
        columns: [
          { header: 'Order', width: 14, value: (o) => o.orderNumber },
          { header: 'Date', width: 12, value: (o) => dmy(o.date) },
          { header: 'Shop', width: 26, value: (o) => o.shop },
          { header: 'Status', width: 12, value: (o) => o.status },
          { header: 'Amount', money: true, width: 14, value: (o) => o.amount },
        ],
      }),
      sheet<RangeReport['expenses'][number]>({
        name: 'Expenses',
        title: `Expenses: ${period}`,
        totals: true,
        rows: r.expenses,
        columns: [
          { header: 'Date', width: 12, value: (e) => dmy(e.date) },
          { header: 'Category', width: 10, value: (e) => e.category },
          { header: 'Details', width: 28, value: (e) => e.description },
          { header: 'Status', width: 18, value: (e) => e.status },
          { header: 'Claimed', money: true, width: 12, value: (e) => e.claimed },
          { header: 'Approved', money: true, width: 12, value: (e) => e.approved ?? '0' },
        ],
      }),
    ]);
    const name = r.salesman.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="juma-${name}-${r.from}-to-${r.to}.xlsx"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }),
);

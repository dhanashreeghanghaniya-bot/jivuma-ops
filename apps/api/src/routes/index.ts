import { Router } from 'express';
import { auditRouter } from '../modules/audit/audit.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { geoRouter } from '../modules/geo/geo.routes';
import { importRouter } from '../modules/import/import.routes';
import { leadsRouter } from '../modules/leads/leads.routes';
import {
  fieldRouter,
  uploadsRouter,
  visitsRouter,
  workdaysRouter,
} from '../modules/field/field.routes';
import { ordersRouter, productsRouter } from '../modules/orders/orders.routes';
import {
  expensesRouter,
  notificationsRouter,
  policyRouter,
} from '../modules/expenses/expenses.routes';
import {
  costReportRouter,
  incentivesRouter,
  salaryRouter,
} from '../modules/payroll/payroll.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { salesTeamRouter } from '../modules/salesteam/salesteam.routes';
import {
  distributorsRouter,
  retailersRouter,
  superStockistsRouter,
} from '../modules/partners/partners.routes';
import { usersRouter } from '../modules/users/users.routes';
import { requireAuth } from '../middleware/auth';
import { sendOk } from '../lib/http';
import * as authController from '../modules/auth/auth.controller';

export const apiV1Router = Router();

apiV1Router.get('/health', (_req, res) =>
  sendOk(res, { status: 'ok', at: new Date().toISOString() }),
);

apiV1Router.use('/auth', authRouter);
apiV1Router.get('/me', requireAuth, authController.me);
apiV1Router.use('/users', usersRouter);
apiV1Router.use('/geo', geoRouter);
apiV1Router.use('/super-stockists', superStockistsRouter);
apiV1Router.use('/distributors', distributorsRouter);
apiV1Router.use('/retailers', retailersRouter);
apiV1Router.use('/leads', leadsRouter);
apiV1Router.use('/workdays', workdaysRouter);
apiV1Router.use('/visits', visitsRouter);
apiV1Router.use('/field', fieldRouter);
apiV1Router.use('/uploads', uploadsRouter);
apiV1Router.use('/orders', ordersRouter);
apiV1Router.use('/products', productsRouter);
apiV1Router.use('/expenses', expensesRouter);
apiV1Router.use('/settings/allowance-policy', policyRouter);
apiV1Router.use('/notifications', notificationsRouter);
apiV1Router.use('/salary-structures', salaryRouter);
apiV1Router.use('/incentives', incentivesRouter);
apiV1Router.use('/reports/monthly-cost', costReportRouter);
apiV1Router.use('/reports', reportsRouter);
apiV1Router.use('/sales-team', salesTeamRouter);
apiV1Router.use('/import', importRouter);
apiV1Router.use('/audit-logs', auditRouter);

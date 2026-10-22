import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { geoRouter } from '../modules/geo/geo.routes';
import { importRouter } from '../modules/import/import.routes';
import { leadsRouter } from '../modules/leads/leads.routes';
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

apiV1Router.get('/health', (_req, res) => sendOk(res, { status: 'ok', at: new Date().toISOString() }));

apiV1Router.use('/auth', authRouter);
apiV1Router.get('/me', requireAuth, authController.me);
apiV1Router.use('/users', usersRouter);
apiV1Router.use('/geo', geoRouter);
apiV1Router.use('/super-stockists', superStockistsRouter);
apiV1Router.use('/distributors', distributorsRouter);
apiV1Router.use('/retailers', retailersRouter);
apiV1Router.use('/leads', leadsRouter);
apiV1Router.use('/import', importRouter);

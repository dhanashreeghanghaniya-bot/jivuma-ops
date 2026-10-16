import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { geoRouter } from '../modules/geo/geo.routes';
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

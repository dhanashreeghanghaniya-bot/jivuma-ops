import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { jsonReplacer } from './lib/json';
import { apiV1Router } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { globalRateLimiter } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';
import { ApiException } from './lib/http';

export function createServer(): Express {
  const app = express();

  // Behind Railway/Render/Vercel proxies, so `req.ip` and secure cookies work.
  app.set('trust proxy', 1);
  app.set('json replacer', jsonReplacer);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive without an Origin header.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        callback(ApiException.forbidden(`Origin ${origin} is not allowed`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(globalRateLimiter);

  app.use('/api/v1', apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

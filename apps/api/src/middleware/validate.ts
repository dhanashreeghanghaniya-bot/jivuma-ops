import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiException } from '../lib/http';

export function zodToApiException(error: ZodError): ApiException {
  return ApiException.badRequest(
    'Please correct the highlighted fields',
    error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

export const validateBody =
  <T extends ZodTypeAny>(schema: T): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(zodToApiException(result.error));
    req.body = result.data;
    next();
  };

export const validateQuery =
  <T extends ZodTypeAny>(schema: T): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(zodToApiException(result.error));
    req.validatedQuery = result.data;
    next();
  };

export const validateParams =
  <T extends ZodTypeAny>(schema: T): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(zodToApiException(result.error));
    req.validatedParams = result.data;
    next();
  };

export const query = <T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> =>
  req.validatedQuery as z.infer<T>;

export const params = <T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> =>
  req.validatedParams as z.infer<T>;

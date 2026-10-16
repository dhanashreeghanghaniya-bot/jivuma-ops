import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiErrorCode } from '@juma/shared';
import { ApiException, sendError } from '../lib/http';
import { zodToApiException } from './validate';
import { logger } from '../lib/logger';
import { isProduction } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  return sendError(
    res,
    404,
    ApiErrorCode.NOT_FOUND,
    `No route matches ${req.method} ${req.originalUrl}`,
  );
}

const isHttpError = (err: unknown): err is { statusCode: number } =>
  typeof err === 'object' && err !== null && typeof (err as { statusCode?: unknown }).statusCode === 'number';

function toApiException(err: unknown): ApiException {
  if (err instanceof ApiException) return err;
  if (err instanceof ZodError) return zodToApiException(err);

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | undefined)?.join(', ');
        return ApiException.conflict(
          target ? `A record with this ${target} already exists` : 'This record already exists',
        );
      }
      case 'P2025':
        return ApiException.notFound('The requested record no longer exists');
      case 'P2003':
        return ApiException.badRequest('A referenced record does not exist');
      default:
        break;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return ApiException.badRequest('The request could not be processed');
  }

  // body-parser rejects unparseable or oversized payloads before any route runs.
  if (err instanceof SyntaxError && 'body' in err) {
    return ApiException.badRequest('Request body is not valid JSON');
  }
  if (isHttpError(err) && err.statusCode === 413) {
    return ApiException.badRequest('Request body is too large');
  }

  return new ApiException(500, ApiErrorCode.INTERNAL_ERROR, 'Something went wrong');
}

 
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const apiError = toApiException(err);

  if (apiError.status >= 500) {
    logger.error('Unhandled request error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      message: err instanceof Error ? err.message : String(err),
      stack: !isProduction && err instanceof Error ? err.stack : undefined,
    });
  }

  return sendError(res, apiError.status, apiError.code, apiError.message, apiError.details);
}

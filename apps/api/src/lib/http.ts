import type { Response } from 'express';
import { ApiErrorCode } from '@juma/shared';
import type { ApiFieldError, ApiMeta, ApiResponse, Paginated } from '@juma/shared';

/** Thrown anywhere in a service; the error middleware turns it into the envelope. */
export class ApiException extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiFieldError[];

  constructor(status: number, code: ApiErrorCode, message: string, details?: ApiFieldError[]) {
    super(message);
    this.name = 'ApiException';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: ApiFieldError[]) {
    return new ApiException(400, ApiErrorCode.VALIDATION_ERROR, message, details);
  }
  static unauthenticated(message = 'Authentication required') {
    return new ApiException(401, ApiErrorCode.UNAUTHENTICATED, message);
  }
  static invalidCredentials(message = 'Mobile number or password is incorrect') {
    return new ApiException(401, ApiErrorCode.INVALID_CREDENTIALS, message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiException(403, ApiErrorCode.FORBIDDEN, message);
  }
  static notFound(message = 'Not found') {
    return new ApiException(404, ApiErrorCode.NOT_FOUND, message);
  }
  static conflict(message: string) {
    return new ApiException(409, ApiErrorCode.CONFLICT, message);
  }
}

export function sendOk<T>(res: Response, data: T, meta: ApiMeta | null = null, status = 200) {
  const body: ApiResponse<T> = { data, error: null, meta };
  return res.status(status).json(body);
}

export function sendPaginated<T>(res: Response, result: Paginated<T>) {
  const body: ApiResponse<T[]> = {
    data: result.items,
    error: null,
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
  return res.status(200).json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: ApiFieldError[],
) {
  const body: ApiResponse<never> = {
    data: null,
    error: { code, message, ...(details ? { details } : {}) },
    meta: null,
  };
  return res.status(status).json(body);
}

export function paginate<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

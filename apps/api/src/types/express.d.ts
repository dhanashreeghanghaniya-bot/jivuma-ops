import type { Role } from '@juma/shared';

declare global {
   
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      auth?: { userId: string; role: Role };
      requestId?: string;
      /** Set by `validateQuery` — `req.query` itself is not safely writable. */
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

export {};

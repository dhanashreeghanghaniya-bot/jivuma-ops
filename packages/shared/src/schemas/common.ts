import { z } from 'zod';
import { PAGINATION } from '../constants';

/**
 * Accepts what a user actually types (`9876543210`, `98765 43210`, `+91 98765-43210`)
 * and normalises to E.164. Indian mobile numbers are 10 digits starting 6-9.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/[\s()-]/g, ''))
  .refine((v) => /^(\+91)?[6-9]\d{9}$/.test(v), {
    message: 'Enter a valid 10-digit Indian mobile number',
  })
  .transform((v) => (v.startsWith('+91') ? v : `+91${v}`));

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

/**
 * Ids are opaque: Prisma mints cuids for live records but the seed uses
 * readable deterministic ids, so only the shape is checked here. Whether an id
 * actually exists is settled by the foreign keys.
 */
export const idSchema = z.string().trim().min(1, 'Required').max(64, 'Invalid id');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);

/** `YYYY-MM`, used by the payroll/report endpoints. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

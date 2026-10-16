import { z } from 'zod';
import { Role, enumValues } from '../enums';
import { idSchema, passwordSchema, paginationQuerySchema, phoneSchema } from './common';

const roleSchema = z.enum(enumValues(Role) as [Role, ...Role[]]);

/** `YYYY-MM-DD` from a date input, kept as a plain date string across the wire. */
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  phone: phoneSchema,
  password: passwordSchema,
  role: roleSchema.default(Role.SALESMAN),
  joiningDate: dateStringSchema,
  hqTownId: idSchema.nullish(),
  reportingToId: idSchema.nullish(),
  photoUrl: z.string().url().nullish(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  isActive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export interface UserListItem {
  id: string;
  name: string;
  phone: string;
  role: Role;
  isActive: boolean;
  photoUrl: string | null;
  joiningDate: string;
  hqTown: { id: string; name: string } | null;
  reportingTo: { id: string; name: string } | null;
  createdAt: string;
}

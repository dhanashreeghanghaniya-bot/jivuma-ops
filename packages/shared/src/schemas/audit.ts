import { z } from 'zod';
import { idSchema, paginationQuerySchema } from './common';

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;
export type AuditActionName = (typeof AUDIT_ACTIONS)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** SPEC 2.6: the audit trail, newest first, filterable the way the owner asks questions. */
export const auditQuerySchema = paginationQuerySchema
  .extend({
    entity: z.string().trim().min(1).max(64).optional(),
    entityId: idSchema.optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    userId: idSchema.optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['to'],
    message: '`to` must not be before `from`',
  });
export type AuditQuery = z.infer<typeof auditQuerySchema>;

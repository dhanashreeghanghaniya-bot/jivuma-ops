import { z } from 'zod';
import { OrderLevel } from '../enums';
import { idSchema, monthSchema } from './common';

export const SALES_GROUPS = ['district', 'town', 'distributor', 'product'] as const;
export type SalesGroup = (typeof SALES_GROUPS)[number];

export const salesReportQuerySchema = z
  .object({
    groupBy: z.enum(SALES_GROUPS).default('district'),
    /** Inclusive month range. Defaults to the last six months. */
    from: monthSchema.optional(),
    to: monthSchema.optional(),
    /**
     * Which leg of the chain counts as a sale. Secondary sales (distributor to
     * shop) by default; primary (company to SS) and SS to distributor on request.
     */
    level: z
      .enum([
        OrderLevel.COMPANY_TO_SS,
        OrderLevel.SS_TO_DISTRIBUTOR,
        OrderLevel.DISTRIBUTOR_TO_RETAILER,
      ])
      .default(OrderLevel.DISTRIBUTOR_TO_RETAILER),
    districtId: idSchema.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['to'],
    message: '`to` must not be before `from`',
  })
  .refine(
    (q) => {
      if (!q.from || !q.to) return true;
      const [fy, fm] = q.from.split('-').map(Number) as [number, number];
      const [ty, tm] = q.to.split('-').map(Number) as [number, number];
      return (ty - fy) * 12 + (tm - fm) < 24;
    },
    { path: ['from'], message: 'At most 24 months at a time' },
  );
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;

export const leadReportQuerySchema = z.object({
  /** Inclusive IST dates on when the lead was created. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type LeadReportQuery = z.infer<typeof leadReportQuerySchema>;

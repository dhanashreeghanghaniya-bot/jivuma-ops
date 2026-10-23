import { z } from 'zod';
import { ReportStatus, enumValues } from '../enums';
import { idSchema, monthSchema } from './common';

const rupees = z.coerce.number().min(0, 'Cannot be negative').max(10_000_000);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** A salary revision; the latest one effective on or before a month's last day applies. */
export const salaryStructureSchema = z.object({
  salesmanId: idSchema,
  basic: rupees,
  hra: rupees,
  fixedAllowance: rupees,
  effectiveFrom: dateOnly,
});
export type SalaryStructureInput = z.infer<typeof salaryStructureSchema>;

export const incentiveSchema = z.object({
  salesmanId: idSchema,
  month: monthSchema,
  amount: z.coerce.number().positive('Enter the amount').max(10_000_000),
  reason: z.string().trim().min(3, 'Say what it is for').max(300),
});
export type IncentiveInput = z.infer<typeof incentiveSchema>;

export const monthQuerySchema = z.object({ month: monthSchema });
export type MonthQuery = z.infer<typeof monthQuerySchema>;

export const reportStatusSchema = z.enum(
  enumValues(ReportStatus) as [ReportStatus, ...ReportStatus[]],
);

export const updateCostReportSchema = z.object({
  /** Advances, recoveries etc. Only on a DRAFT; kept when the draft is regenerated. */
  deductions: rupees.optional(),
  deductionNote: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null)
    .nullish(),
});
export type UpdateCostReportInput = z.infer<typeof updateCostReportSchema>;

/** DRAFT -> FINAL -> PAID. FINAL can go back to DRAFT until it is paid. */
export const changeReportStatusSchema = z.object({
  status: reportStatusSchema,
});
export type ChangeReportStatusInput = z.infer<typeof changeReportStatusSchema>;

export function allowedReportMoves(current: ReportStatus): ReportStatus[] {
  switch (current) {
    case ReportStatus.DRAFT:
      return [ReportStatus.FINAL];
    case ReportStatus.FINAL:
      return [ReportStatus.PAID, ReportStatus.DRAFT];
    default:
      return [];
  }
}

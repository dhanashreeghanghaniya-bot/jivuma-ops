import { z } from 'zod';
import { DayType, ExpenseCategory, ExpenseStatus, TravelMode, enumValues } from '../enums';
import { idSchema } from './common';
import { storagePathSchema } from './field';

export const expenseCategorySchema = z.enum(
  enumValues(ExpenseCategory) as [ExpenseCategory, ...ExpenseCategory[]],
);
export const travelModeSchema = z.enum(enumValues(TravelMode) as [TravelMode, ...TravelMode[]]);
export const expenseStatusSchema = z.enum(
  enumValues(ExpenseStatus) as [ExpenseStatus, ...ExpenseStatus[]],
);

/** Vehicles paid per km from the policy; the rest are paid at actuals (SPEC 7). */
export const OWN_VEHICLE_MODES: TravelMode[] = [TravelMode.BIKE, TravelMode.CAR, TravelMode.AUTO];
export const PUBLIC_TRANSPORT_MODES: TravelMode[] = [TravelMode.BUS, TravelMode.TRAIN];

/** The money fields of an allowance policy, as plain numbers. */
export interface AllowanceRates {
  daHq: number;
  daExHq: number;
  daOutstation: number;
  taPerKmBike: number;
  taPerKmCar: number;
  taPerKmAuto: number;
  maxLodgingPerNight: number;
  monthlyPhoneAllowance: number;
  publicTransportNeedsBill: boolean;
  daRequiresVisit: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * SPEC 7: DA is the policy rate for the day type; nothing on leave or a
 * holiday, and (when the policy says so) nothing for a day with no visits.
 */
export function daFor(rates: AllowanceRates, dayType: DayType, visits: number): number {
  if (rates.daRequiresVisit && visits === 0) return 0;
  switch (dayType) {
    case DayType.HQ:
      return rates.daHq;
    case DayType.EX_HQ:
      return rates.daExHq;
    case DayType.OUTSTATION:
      return rates.daOutstation;
    default:
      return 0;
  }
}

/** Per-km rate for an own vehicle, or null for modes paid at actuals. */
export function taRateFor(rates: AllowanceRates, mode: TravelMode): number | null {
  switch (mode) {
    case TravelMode.BIKE:
      return rates.taPerKmBike;
    case TravelMode.CAR:
      return rates.taPerKmCar;
    case TravelMode.AUTO:
      return rates.taPerKmAuto;
    default:
      return null;
  }
}

export function taFor(rates: AllowanceRates, mode: TravelMode, km: number): number | null {
  const rate = taRateFor(rates, mode);
  return rate === null ? null : round2(rate * km);
}

// --- policy ------------------------------------------------------------------

const rupees = z.coerce.number().min(0, 'Cannot be negative').max(100_000);

export const allowancePolicySchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  daHq: rupees,
  daExHq: rupees,
  daOutstation: rupees,
  taPerKmBike: rupees,
  taPerKmCar: rupees,
  taPerKmAuto: rupees,
  maxLodgingPerNight: rupees,
  monthlyPhoneAllowance: rupees,
  publicTransportNeedsBill: z.boolean(),
  daRequiresVisit: z.boolean(),
});
export type AllowancePolicyInput = z.infer<typeof allowancePolicySchema>;

// --- claims ------------------------------------------------------------------

/** Categories a salesman enters by hand; DA and own-vehicle TA are drafted for him. */
export const MANUAL_CATEGORIES: ExpenseCategory[] = [
  ExpenseCategory.TA,
  ExpenseCategory.LODGING,
  ExpenseCategory.FOOD,
  ExpenseCategory.PHONE,
  ExpenseCategory.MISC,
];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const createExpenseSchema = z
  .object({
    clientUuid: z.string().uuid('Invalid client id'),
    /** Ties the claim to a work day; it is then submitted with that day. */
    workDayId: idSchema.nullish(),
    /** Required when there is no work day. */
    date: dateOnly.nullish(),
    category: expenseCategorySchema,
    travelMode: travelModeSchema.nullish(),
    fromTownId: idSchema.nullish(),
    toTownId: idSchema.nullish(),
    km: z.coerce.number().min(0).max(5000).nullish(),
    amountClaimed: z.coerce.number().positive('Enter the amount').max(1_000_000),
    description: z
      .string()
      .trim()
      .max(300)
      .transform((v) => v || null)
      .nullish(),
  })
  .superRefine((v, ctx) => {
    if (!v.workDayId && !v.date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'Pick the date' });
    }
    if (v.category === ExpenseCategory.DA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message: 'DA is worked out from your day; it cannot be claimed by hand',
      });
    }
    if (v.category === ExpenseCategory.TA && !v.travelMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['travelMode'],
        message: 'How did you travel?',
      });
    }
    if (v.category !== ExpenseCategory.TA && v.travelMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['travelMode'],
        message: 'Only TA has a travel mode',
      });
    }
  });
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  amountClaimed: z.coerce.number().positive('Enter the amount').max(1_000_000).optional(),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null)
    .nullish(),
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const attachBillsSchema = z.object({
  paths: z.array(storagePathSchema).min(1).max(6),
});
export type AttachBillsInput = z.infer<typeof attachBillsSchema>;

export const reviewExpenseSchema = z
  .object({
    decision: z.enum(['APPROVE', 'PARTIAL', 'REJECT']),
    amountApproved: z.coerce.number().min(0).max(1_000_000).nullish(),
    remark: z
      .string()
      .trim()
      .max(500)
      .transform((v) => v || null)
      .nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'PARTIAL' && (v.amountApproved == null || v.amountApproved <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountApproved'],
        message: 'Enter the amount to approve',
      });
    }
    if (v.decision !== 'APPROVE' && !v.remark) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remark'],
        message: 'Tell the salesman why',
      });
    }
  });
export type ReviewExpenseInput = z.infer<typeof reviewExpenseSchema>;

export const bulkApproveSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
});
export type BulkApproveInput = z.infer<typeof bulkApproveSchema>;

export const reviewWorkDaySchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT', 'REOPEN']),
    remark: z
      .string()
      .trim()
      .max(500)
      .transform((v) => v || null)
      .nullish(),
  })
  .refine((v) => v.decision === 'APPROVE' || Boolean(v.remark), {
    path: ['remark'],
    message: 'Tell the salesman why',
  });
export type ReviewWorkDayInput = z.infer<typeof reviewWorkDaySchema>;

export const listExpensesQuerySchema = z.object({
  /** `YYYY-MM`; defaults to the current IST month. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM')
    .optional(),
  status: expenseStatusSchema.optional(),
  salesmanId: idSchema.optional(),
  category: expenseCategorySchema.optional(),
  workDayId: idSchema.optional(),
  flaggedOnly: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

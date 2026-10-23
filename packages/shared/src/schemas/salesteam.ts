import { z } from 'zod';
import { idSchema, monthSchema } from './common';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** SPEC 4.5: a gap of more than two hours between positions during a working day is flagged. */
export const TRACK_GAP_FLAG_MS = 2 * 60 * 60 * 1000;
/** SPEC 7: odometer km above this multiple of GPS km is flagged. */
export const ODOMETER_GPS_RATIO_FLAG = 1.3;

export const territorySchema = z.object({
  districtIds: z.array(idSchema).max(33),
  townIds: z.array(idSchema).max(500),
});
export type TerritoryInput = z.infer<typeof territorySchema>;

export const beatSchema = z.object({
  name: z.string().trim().min(2, 'Name the beat').max(80),
  /** 1 = Monday ... 7 = Sunday; null for an ad-hoc beat. */
  dayOfWeek: z.coerce.number().int().min(1).max(7).nullish(),
  /** Shops in visiting order. */
  retailerIds: z.array(idSchema).min(1, 'Add at least one shop').max(60),
});
export type BeatInput = z.infer<typeof beatSchema>;

export const calendarQuerySchema = z.object({ month: monthSchema });
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const rangeQuerySchema = z
  .object({ from: dateOnly, to: dateOnly })
  .refine((q) => q.from <= q.to, { path: ['to'], message: '`to` must not be before `from`' })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 92, {
    path: ['from'],
    message: 'At most three months at a time',
  });
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export const flagsQuerySchema = z
  .object({ from: dateOnly, to: dateOnly, salesmanId: idSchema.optional() })
  .refine((q) => q.from <= q.to, { path: ['to'], message: '`to` must not be before `from`' });
export type FlagsQuery = z.infer<typeof flagsQuerySchema>;

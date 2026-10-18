/**
 * Timestamps are stored UTC and reported in IST (SPEC 7). India has no DST, so
 * a fixed offset is correct and avoids pulling in a timezone database.
 */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** `YYYY-MM-DD` in IST for an instant. */
export function toIstDateString(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant at which an IST calendar day begins. */
export function istDayStartUtc(isoDate: string): Date {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) - IST_OFFSET_MS);
}

/** Exclusive upper bound: the start of the following IST day. */
export function istDayEndUtc(isoDate: string): Date {
  return new Date(istDayStartUtc(isoDate).getTime() + 24 * 60 * 60 * 1000);
}

/** First and last IST day of the month containing `at`, as `YYYY-MM-DD`. */
export function istMonthRange(at: Date = new Date()): { from: string; to: string } {
  const [year, month] = toIstDateString(at).split('-').map(Number) as [number, number, number];
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/** Half-open UTC window for an inclusive IST date range. */
export function istRangeToUtc(from: string, to: string): { gte: Date; lt: Date } {
  return { gte: istDayStartUtc(from), lt: istDayEndUtc(to) };
}

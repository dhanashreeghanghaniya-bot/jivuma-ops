/** `₹1,23,456.50` (Indian grouping) for notification text. */
export function formatInr(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** `22-10-2026` from `2026-10-22`, the app's display format (SPEC 1). */
export const formatDateDmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('-');

export const CATEGORY_NAMES: Record<string, string> = {
  TA: 'Travel',
  DA: 'DA',
  LODGING: 'Lodging',
  FOOD: 'Food',
  PHONE: 'Phone',
  MISC: 'Other',
};

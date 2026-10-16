const IST = 'Asia/Kolkata';

/** `₹1,23,456` — Indian digit grouping, no decimals unless asked for. */
export function formatINR(value: number | string | null | undefined, withPaise = false): string {
  if (value === null || value === undefined || value === '') return '₹0';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '₹0';

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: withPaise ? 2 : 0,
    maximumFractionDigits: withPaise ? 2 : 0,
  }).format(amount);
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isNaN(n) ? '0' : new Intl.NumberFormat('en-IN').format(n);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `DD-MM-YYYY` in IST. Timestamps are stored UTC and only ever displayed in IST. */
export function formatDate(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

/** `09:15 am` in IST. */
export function formatTime(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? `${formatDate(date)} ${formatTime(date)}` : '-';
}

/** E.164 in the database, `98XXX XXXXX` on screen. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const digits = phone.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

export const telHref = (phone: string) => `tel:${phone}`;
export const whatsAppHref = (phone: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}`;

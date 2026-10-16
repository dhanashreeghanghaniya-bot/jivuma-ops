/** Deterministic PRNG so re-seeding produces the same demo data. */
export function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)] as T;

export const randomInt = (rand: () => number, min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));

/** Prefixed, stable ids make every seed write an idempotent upsert. */
export const sid = (prefix: string, key: string | number) => `seed_${prefix}_${key}`;

/** Midnight UTC, for Prisma `@db.Date` columns. */
export function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** IST wall-clock time on a given date, expressed as a UTC instant. */
export function atIst(day: Date, hours: number, minutes = 0): Date {
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours - 5, minutes - 30),
  );
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** `JF-YYMM-####` */
export function orderNumber(date: Date, sequence: number): string {
  const yy = String(date.getUTCFullYear()).slice(2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `JF-${yy}${mm}-${String(sequence).padStart(4, '0')}`;
}

/** Great-circle distance in metres. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Nudges a coordinate by up to ~`meters` so demo pins are not all identical. */
export function jitter(rand: () => number, value: number, meters: number): number {
  const degrees = meters / 111_000;
  return Number((value + (rand() - 0.5) * 2 * degrees).toFixed(6));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

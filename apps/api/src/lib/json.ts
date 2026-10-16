import { Prisma } from '@prisma/client';

/**
 * Money and coordinates are Prisma `Decimal`s. They must reach the client as
 * strings — going through a JS number would silently lose precision.
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  return value;
}

import type { Prisma } from '@prisma/client';
import { toIstDateString } from './dates';

/**
 * Next `JF-YYMM-####` number (SPEC 7), sequential per IST month. The
 * increment is a single upsert, so concurrent orders never share a number.
 * Call inside the transaction that creates the order.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  at: Date = new Date(),
): Promise<string> {
  const [yyyy, mm] = toIstDateString(at).split('-') as [string, string, string];
  const month = `${yyyy.slice(2)}${mm}`;
  const rows = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "OrderSequence" ("month", "lastSeq", "createdAt", "updatedAt")
    VALUES (${month}, 1, now(), now())
    ON CONFLICT ("month") DO UPDATE
      SET "lastSeq" = "OrderSequence"."lastSeq" + 1, "updatedAt" = now()
    RETURNING "lastSeq"`;
  return `JF-${month}-${String(rows[0]!.lastSeq).padStart(4, '0')}`;
}

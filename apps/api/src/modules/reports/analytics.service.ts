import {
  CoverageStatus,
  LeadSource,
  LeadStage,
  LeadType,
  OrderLevel,
  Prisma,
} from '@prisma/client';
import {
  OPEN_LEAD_STAGES,
  type CoverageReport,
  type LeadFunnelReport,
  type LeadReportQuery,
  type SalesReport,
  type SalesReportQuery,
  type SalesReportRow,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { istDayEndUtc, istDayStartUtc, toIstDateString } from '../../lib/dates';
import { monthBounds } from '../payroll/payroll.service';

/** `YYYY-MM` months from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Last month over the one before; null when either is missing or the base is zero. */
export function momChange(byMonth: Record<string, string>, months: string[]): number | null {
  if (months.length < 2) return null;
  const last = Number(byMonth[months.at(-1)!] ?? 0);
  const prev = Number(byMonth[months.at(-2)!] ?? 0);
  if (prev === 0) return null;
  return Math.round(((last - prev) / prev) * 1000) / 1000;
}

/** Where the goods went, by level: the buying party's town. */
const RECEIVER_TOWN: Record<OrderLevel, Prisma.Sql> = {
  COMPANY_TO_SS: Prisma.sql`s."townId"`,
  SS_TO_DISTRIBUTOR: Prisma.sql`d."townId"`,
  DISTRIBUTOR_TO_RETAILER: Prisma.sql`r."townId"`,
};

interface SalesRaw {
  key: string;
  label: string;
  detail: string | null;
  month: string;
  amount: Prisma.Decimal;
  orders: bigint;
}

/**
 * SPEC 4.7: sales by district / town / distributor / product, month on month.
 * Cancelled orders never count. One grouped query, so it stays cheap as
 * orders grow.
 */
export async function sales(q: SalesReportQuery): Promise<SalesReport> {
  const to = q.to ?? toIstDateString(new Date()).slice(0, 7);
  const from = q.from ?? shiftMonth(to, -5);
  const months = monthsBetween(from, to);
  const start = istDayStartUtc(`${from}-01`);
  const end = istDayEndUtc(monthBounds(to).last);
  const townCol = RECEIVER_TOWN[q.level];
  const month = Prisma.sql`to_char(o."orderDate" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`;
  const where = Prisma.sql`
    o."level" = ${q.level}::"OrderLevel"
    AND o."status" <> 'CANCELLED'
    AND o."orderDate" >= ${start} AND o."orderDate" < ${end}
    ${q.districtId ? Prisma.sql`AND t."districtId" = ${q.districtId}` : Prisma.empty}`;
  const joins = Prisma.sql`
    LEFT JOIN "SuperStockist" s ON s."id" = o."superStockistId"
    LEFT JOIN "Distributor" d ON d."id" = o."distributorId"
    LEFT JOIN "Retailer" r ON r."id" = o."retailerId"
    LEFT JOIN "Town" t ON t."id" = ${townCol}
    LEFT JOIN "District" dist ON dist."id" = t."districtId"`;

  let raw: SalesRaw[];
  switch (q.groupBy) {
    case 'district':
      raw = await prisma.$queryRaw<SalesRaw[]>`
        SELECT dist."id" AS key, dist."name" AS label, dist."zone"::text AS detail, ${month} AS month,
               SUM(o."totalAmount") AS amount, COUNT(*) AS orders
        FROM "Order" o ${joins} WHERE ${where} GROUP BY 1, 2, 3, 4`;
      break;
    case 'town':
      raw = await prisma.$queryRaw<SalesRaw[]>`
        SELECT t."id" AS key, t."name" AS label, dist."name" AS detail, ${month} AS month,
               SUM(o."totalAmount") AS amount, COUNT(*) AS orders
        FROM "Order" o ${joins} WHERE ${where} GROUP BY 1, 2, 3, 4`;
      break;
    case 'distributor':
      raw = await prisma.$queryRaw<SalesRaw[]>`
        SELECT COALESCE(d."id", '-') AS key, COALESCE(d."firmName", 'Direct to super stockist') AS label,
               dt."name" AS detail, ${month} AS month, SUM(o."totalAmount") AS amount, COUNT(*) AS orders
        FROM "Order" o ${joins} LEFT JOIN "Town" dt ON dt."id" = d."townId"
        WHERE ${where} GROUP BY 1, 2, 3, 4`;
      break;
    case 'product':
      raw = await prisma.$queryRaw<SalesRaw[]>`
        SELECT p."id" AS key, p."name" AS label, p."sku" AS detail, ${month} AS month,
               SUM(i."amount") AS amount, COUNT(DISTINCT o."id") AS orders
        FROM "Order" o ${joins}
        JOIN "OrderItem" i ON i."orderId" = o."id" JOIN "Product" p ON p."id" = i."productId"
        WHERE ${where} GROUP BY 1, 2, 3, 4`;
      break;
  }

  const rows = new Map<string, SalesReportRow & { sum: Prisma.Decimal }>();
  const monthTotals = new Map<string, Prisma.Decimal>();
  let grand = new Prisma.Decimal(0);
  for (const r of raw) {
    const key = r.key ?? '-';
    const row = rows.get(key) ?? {
      key,
      label: r.label ?? 'Unknown',
      detail: r.detail,
      byMonth: {},
      total: '0',
      orders: 0,
      momChange: null,
      sum: new Prisma.Decimal(0),
    };
    const amount = new Prisma.Decimal(r.amount);
    row.byMonth[r.month] = amount.toFixed(2);
    row.sum = row.sum.add(amount);
    row.orders += Number(r.orders);
    rows.set(key, row);
    monthTotals.set(r.month, (monthTotals.get(r.month) ?? new Prisma.Decimal(0)).add(amount));
    grand = grand.add(amount);
  }

  const ordersTotal =
    q.groupBy === 'product'
      ? Number(
          (
            await prisma.$queryRaw<{ n: bigint }[]>`
              SELECT COUNT(*) AS n FROM "Order" o ${joins} WHERE ${where}`
          )[0]!.n,
        )
      : [...rows.values()].reduce((n, r) => n + r.orders, 0);

  return {
    groupBy: q.groupBy,
    level: q.level,
    months,
    rows: [...rows.values()]
      .sort((a, b) => b.sum.comparedTo(a.sum))
      .map(({ sum, ...row }) => ({
        ...row,
        total: sum.toFixed(2),
        momChange: momChange(row.byMonth, months),
      })),
    monthTotals: Object.fromEntries(
      months.map((m) => [m, (monthTotals.get(m) ?? new Prisma.Decimal(0)).toFixed(2)]),
    ),
    grandTotal: grand.toFixed(2),
    orders: ordersTotal,
  };
}

interface CountRow {
  districtId: string;
  n: bigint;
}

/** SPEC 4.7: district-wise coverage, towns covered vs total. */
export async function coverage(): Promise<CoverageReport> {
  const month = toIstDateString(new Date()).slice(0, 7);
  const { first, last } = monthBounds(month);

  const [districts, towns, covered, ss, dists, shops, leads, salesRows] = await Promise.all([
    prisma.district.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, zone: true, coverageStatus: true },
      orderBy: { name: 'asc' },
    }),
    prisma.$queryRaw<CountRow[]>`
      SELECT "districtId", COUNT(*) AS n FROM "Town" WHERE "deletedAt" IS NULL GROUP BY 1`,
    // A town is covered when an active distributor sits in it or covers it.
    prisma.$queryRaw<CountRow[]>`
      SELECT t."districtId", COUNT(*) AS n FROM "Town" t
      WHERE t."deletedAt" IS NULL AND (
        EXISTS (SELECT 1 FROM "Distributor" d WHERE d."townId" = t."id" AND d."status" = 'ACTIVE' AND d."deletedAt" IS NULL)
        OR EXISTS (SELECT 1 FROM "_DistributorCoveredTowns" c JOIN "Distributor" d ON d."id" = c."A"
                   WHERE c."B" = t."id" AND d."status" = 'ACTIVE' AND d."deletedAt" IS NULL))
      GROUP BY 1`,
    prisma.$queryRaw<CountRow[]>`
      SELECT t."districtId", COUNT(*) AS n FROM "SuperStockist" s JOIN "Town" t ON t."id" = s."townId"
      WHERE s."deletedAt" IS NULL AND s."status" = 'ACTIVE' GROUP BY 1`,
    prisma.$queryRaw<CountRow[]>`
      SELECT t."districtId", COUNT(*) AS n FROM "Distributor" d JOIN "Town" t ON t."id" = d."townId"
      WHERE d."deletedAt" IS NULL AND d."status" = 'ACTIVE' GROUP BY 1`,
    prisma.$queryRaw<CountRow[]>`
      SELECT t."districtId", COUNT(*) AS n FROM "Retailer" r JOIN "Town" t ON t."id" = r."townId"
      WHERE r."deletedAt" IS NULL GROUP BY 1`,
    prisma.$queryRaw<CountRow[]>`
      SELECT "districtId", COUNT(*) AS n FROM "Lead"
      WHERE "deletedAt" IS NULL AND "stage" NOT IN ('WON', 'LOST') GROUP BY 1`,
    prisma.$queryRaw<{ districtId: string; amount: Prisma.Decimal }[]>`
      SELECT t."districtId", SUM(o."totalAmount") AS amount FROM "Order" o
      JOIN "Retailer" r ON r."id" = o."retailerId" JOIN "Town" t ON t."id" = r."townId"
      WHERE o."level" = 'DISTRIBUTOR_TO_RETAILER' AND o."status" <> 'CANCELLED'
        AND o."orderDate" >= ${istDayStartUtc(first)} AND o."orderDate" < ${istDayEndUtc(last)}
      GROUP BY 1`,
  ]);

  const count = (rows: CountRow[]) => new Map(rows.map((r) => [r.districtId, Number(r.n)]));
  const [townN, coveredN, ssN, distN, shopN, leadN] = [towns, covered, ss, dists, shops, leads].map(
    count,
  );
  const salesBy = new Map(
    salesRows.map((r) => [r.districtId, new Prisma.Decimal(r.amount).toFixed(2)]),
  );

  const rows = districts.map((d) => ({
    district: { id: d.id, code: d.code, name: d.name, zone: d.zone },
    status: d.coverageStatus,
    towns: townN!.get(d.id) ?? 0,
    townsCovered: coveredN!.get(d.id) ?? 0,
    superStockists: ssN!.get(d.id) ?? 0,
    distributors: distN!.get(d.id) ?? 0,
    retailers: shopN!.get(d.id) ?? 0,
    openLeads: leadN!.get(d.id) ?? 0,
    salesThisMonth: salesBy.get(d.id) ?? '0.00',
  }));
  const byStatus = Object.fromEntries(
    Object.values(CoverageStatus).map((s) => [s, rows.filter((r) => r.status === s).length]),
  ) as Record<CoverageStatus, number>;
  return {
    rows,
    byStatus,
    towns: rows.reduce((n, r) => n + r.towns, 0),
    townsCovered: rows.reduce((n, r) => n + r.townsCovered, 0),
  };
}

const rate = (won: number, lost: number) =>
  won + lost === 0 ? 0 : Math.round((won / (won + lost)) * 1000) / 10;

/** SPEC 4.7: lead funnel, with where leads come from and who converts them. */
export async function leadFunnel(q: LeadReportQuery): Promise<LeadFunnelReport> {
  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: istDayStartUtc(q.from) } : {}),
            ...(q.to ? { lt: istDayEndUtc(q.to) } : {}),
          },
        }
      : {}),
  };
  const leads = await prisma.lead.findMany({
    where,
    select: {
      stage: true,
      type: true,
      source: true,
      expectedInvestment: true,
      followUpAt: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });
  const now = new Date();
  const isOpen = (s: LeadStage) => OPEN_LEAD_STAGES.includes(s);

  const stages = Object.values(LeadStage).map((stage) => {
    const these = leads.filter((l) => l.stage === stage);
    return {
      stage,
      count: these.length,
      value: these
        .reduce((s, l) => s.add(l.expectedInvestment ?? 0), new Prisma.Decimal(0))
        .toFixed(2),
    };
  });
  const tally = (list: typeof leads) => {
    const won = list.filter((l) => l.stage === LeadStage.WON).length;
    const lost = list.filter((l) => l.stage === LeadStage.LOST).length;
    return {
      total: list.length,
      won,
      lost,
      open: list.length - won - lost,
      conversionRate: rate(won, lost),
    };
  };

  const salesmen = new Map<string, typeof leads>();
  for (const l of leads) {
    const key = l.assignedTo?.id ?? '-';
    salesmen.set(key, [...(salesmen.get(key) ?? []), l]);
  }

  return {
    stages,
    byType: Object.values(LeadType).map((type) => ({
      type,
      ...tally(leads.filter((l) => l.type === type)),
    })),
    bySource: Object.values(LeadSource)
      .map((source) => {
        const t = tally(leads.filter((l) => l.source === source));
        return { source, total: t.total, won: t.won, conversionRate: t.conversionRate };
      })
      .filter((s) => s.total > 0),
    bySalesman: [...salesmen.values()]
      .map((list) => {
        const t = tally(list);
        return {
          salesman: list[0]!.assignedTo,
          total: t.total,
          won: t.won,
          open: t.open,
          overdue: list.filter((l) => isOpen(l.stage) && l.followUpAt && l.followUpAt < now).length,
        };
      })
      .sort((a, b) => b.total - a.total),
    totals: tally(leads),
  };
}

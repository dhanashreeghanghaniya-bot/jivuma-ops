import {
  DayType,
  ExpenseCategory,
  ExpenseStatus,
  OrderStatus,
  Prisma,
  ReportStatus,
  Role,
} from '@prisma/client';
import {
  allowedReportMoves,
  type ChangeReportStatusInput,
  type CostReportItem,
  type CostReportMonth,
  type IncentiveInput,
  type IncentiveItem,
  type SalaryStructureInput,
  type SalaryStructureItem,
  type UpdateCostReportInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { istRangeToUtc, toIstDateString } from '../../lib/dates';
import { formatInr } from '../../lib/money';
import { notify } from '../notifications/notifications.service';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const dateColumn = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** First and last calendar day of `YYYY-MM`. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

// --- salary structures ------------------------------------------------------------

export async function listSalary(): Promise<SalaryStructureItem[]> {
  const rows = await prisma.salaryStructure.findMany({
    include: { salesman: { select: { id: true, name: true } } },
    orderBy: [{ salesman: { name: 'asc' } }, { effectiveFrom: 'desc' }],
  });
  const today = toIstDateString(new Date());
  const current = new Map<string, string>();
  for (const r of rows) {
    const from = r.effectiveFrom.toISOString().slice(0, 10);
    if (from <= today && !current.has(r.salesmanId)) current.set(r.salesmanId, r.id);
  }
  return rows.map((r) => ({
    id: r.id,
    salesman: r.salesman,
    basic: r.basic.toFixed(2),
    hra: r.hra.toFixed(2),
    fixedAllowance: r.fixedAllowance.toFixed(2),
    monthly: r.basic.add(r.hra).add(r.fixedAllowance).toFixed(2),
    effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
    isCurrent: current.get(r.salesmanId) === r.id,
  }));
}

/** Saving on a date that already has a revision replaces it. */
export async function saveSalary(input: SalaryStructureInput, actorId: string) {
  const user = await prisma.user.findFirst({
    where: { id: input.salesmanId, role: Role.SALESMAN },
  });
  if (!user) throw ApiException.badRequest('Salesman not found');
  const data = {
    basic: D(input.basic),
    hra: D(input.hra),
    fixedAllowance: D(input.fixedAllowance),
  };
  const row = await prisma.salaryStructure.upsert({
    where: {
      salesmanId_effectiveFrom: {
        salesmanId: input.salesmanId,
        effectiveFrom: dateColumn(input.effectiveFrom),
      },
    },
    create: {
      salesmanId: input.salesmanId,
      effectiveFrom: dateColumn(input.effectiveFrom),
      ...data,
    },
    update: data,
  });
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'SalaryStructure',
    entityId: row.id,
    after: input,
  });
  return listSalary();
}

export async function deleteSalary(id: string, actorId: string) {
  const row = await prisma.salaryStructure.findUnique({ where: { id } });
  if (!row) throw ApiException.notFound('Salary revision not found');
  await prisma.salaryStructure.delete({ where: { id } });
  await writeAuditLog({
    userId: actorId,
    action: 'DELETE',
    entity: 'SalaryStructure',
    entityId: id,
  });
  return listSalary();
}

/** Monthly salary in force at the end of the month: the latest revision on or before its last day. */
async function salaryFor(salesmanId: string, month: string): Promise<Prisma.Decimal> {
  const s = await prisma.salaryStructure.findFirst({
    where: { salesmanId, effectiveFrom: { lte: dateColumn(monthBounds(month).last) } },
    orderBy: { effectiveFrom: 'desc' },
  });
  return s ? s.basic.add(s.hra).add(s.fixedAllowance) : D(0);
}

// --- incentives ---------------------------------------------------------------------

const FROZEN: ReportStatus[] = [ReportStatus.FINAL, ReportStatus.PAID];

async function assertMonthOpen(salesmanId: string, month: string) {
  const report = await prisma.monthlyCostReport.findUnique({
    where: { salesmanId_month: { salesmanId, month } },
  });
  if (report && FROZEN.includes(report.status)) {
    throw ApiException.conflict(
      `The ${monthLabel(month)} report for this salesman is ${report.status.toLowerCase()}; move it back to draft first`,
    );
  }
}

export async function listIncentives(month: string): Promise<IncentiveItem[]> {
  const [rows, frozen] = await Promise.all([
    prisma.incentive.findMany({
      where: { month },
      include: {
        salesman: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.monthlyCostReport.findMany({
      where: { month, status: { in: FROZEN } },
      select: { salesmanId: true },
    }),
  ]);
  const locked = new Set(frozen.map((f) => f.salesmanId));
  return rows.map((r) => ({
    id: r.id,
    salesman: r.salesman,
    month: r.month,
    amount: r.amount.toFixed(2),
    reason: r.reason,
    createdBy: r.createdBy,
    editable: !locked.has(r.salesmanId),
  }));
}

export async function addIncentive(input: IncentiveInput, actorId: string) {
  const user = await prisma.user.findFirst({
    where: { id: input.salesmanId, role: Role.SALESMAN },
  });
  if (!user) throw ApiException.badRequest('Salesman not found');
  await assertMonthOpen(input.salesmanId, input.month);
  const row = await prisma.incentive.create({
    data: {
      salesmanId: input.salesmanId,
      month: input.month,
      amount: D(input.amount),
      reason: input.reason,
      createdById: actorId,
    },
  });
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'Incentive',
    entityId: row.id,
    after: input,
  });
  return listIncentives(input.month);
}

export async function deleteIncentive(id: string, actorId: string) {
  const row = await prisma.incentive.findUnique({ where: { id } });
  if (!row) throw ApiException.notFound('Incentive not found');
  await assertMonthOpen(row.salesmanId, row.month);
  await prisma.incentive.delete({ where: { id } });
  await writeAuditLog({ userId: actorId, action: 'DELETE', entity: 'Incentive', entityId: id });
  return listIncentives(row.month);
}

// --- monthly cost report ------------------------------------------------------------------

export interface CostFigures {
  workingDays: number;
  leaves: number;
  salary: Prisma.Decimal;
  taTotal: Prisma.Decimal;
  daTotal: Prisma.Decimal;
  otherExpenses: Prisma.Decimal;
  incentives: Prisma.Decimal;
  ordersCount: number;
  orderValue: Prisma.Decimal;
  visitsCount: number;
  newRetailers: number;
}

/**
 * SPEC 4.7: salary + TA + DA + other expenses + incentives - deductions.
 * Pure, so the arithmetic is tested on its own.
 */
export function totalsFor(f: CostFigures, deductions: Prisma.Decimal) {
  const grandTotal = f.salary
    .add(f.taTotal)
    .add(f.daTotal)
    .add(f.otherExpenses)
    .add(f.incentives)
    .sub(deductions);
  const costToSalesRatio = f.orderValue.gt(0)
    ? grandTotal.div(f.orderValue).toDecimalPlaces(4)
    : null;
  return { grandTotal, costToSalesRatio };
}

/** Gathers one salesman's month (SPEC 7: only APPROVED expenses count). */
async function figuresFor(salesmanId: string, month: string): Promise<CostFigures> {
  const { first, last } = monthBounds(month);
  const dates = { gte: dateColumn(first), lte: dateColumn(last) };
  const window = istRangeToUtc(first, last);
  const reviewed: ExpenseStatus[] = [ExpenseStatus.APPROVED, ExpenseStatus.PARTIALLY_APPROVED];

  const [days, claims, incentives, orders, visits, newRetailers, salary] = await Promise.all([
    prisma.workDay.findMany({
      where: { salesmanId, date: dates },
      select: { dayType: true, startAt: true },
    }),
    prisma.expenseClaim.groupBy({
      by: ['category'],
      where: { salesmanId, date: dates, status: { in: reviewed } },
      _sum: { amountApproved: true },
    }),
    prisma.incentive.aggregate({ where: { salesmanId, month }, _sum: { amount: true } }),
    prisma.order.aggregate({
      where: {
        takenBySalesmanId: salesmanId,
        orderDate: window,
        status: { not: OrderStatus.CANCELLED },
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.visit.count({ where: { salesmanId, checkInAt: window } }),
    prisma.retailer.count({
      where: { addedBySalesmanId: salesmanId, createdAt: window, deletedAt: null },
    }),
    salaryFor(salesmanId, month),
  ]);

  const byCategory = (c: ExpenseCategory) =>
    claims.find((x) => x.category === c)?._sum.amountApproved ?? D(0);
  const other = claims
    .filter((x) => x.category !== ExpenseCategory.TA && x.category !== ExpenseCategory.DA)
    .reduce((sum, x) => sum.add(x._sum.amountApproved ?? 0), D(0));
  const off: DayType[] = [DayType.LEAVE, DayType.HOLIDAY];

  return {
    workingDays: days.filter((d) => d.startAt && !off.includes(d.dayType)).length,
    leaves: days.filter((d) => d.dayType === DayType.LEAVE).length,
    salary,
    taTotal: byCategory(ExpenseCategory.TA),
    daTotal: byCategory(ExpenseCategory.DA),
    otherExpenses: other,
    incentives: incentives._sum.amount ?? D(0),
    ordersCount: orders._count._all,
    orderValue: orders._sum.totalAmount ?? D(0),
    visitsCount: visits,
    newRetailers,
  };
}

const reportInclude = { salesman: { select: { id: true, name: true, isActive: true } } } as const;
type ReportRow = Prisma.MonthlyCostReportGetPayload<{ include: typeof reportInclude }>;

function toItem(r: ReportRow, pendingClaims: number): CostReportItem {
  return {
    id: r.id,
    salesman: r.salesman,
    month: r.month,
    workingDays: r.workingDays,
    leaves: r.leaves,
    salary: r.salary.toFixed(2),
    taTotal: r.taTotal.toFixed(2),
    daTotal: r.daTotal.toFixed(2),
    otherExpenses: r.otherExpenses.toFixed(2),
    incentives: r.incentives.toFixed(2),
    deductions: r.deductions.toFixed(2),
    deductionNote: r.deductionNote,
    grandTotal: r.grandTotal.toFixed(2),
    ordersCount: r.ordersCount,
    orderValue: r.orderValue.toFixed(2),
    visitsCount: r.visitsCount,
    newRetailers: r.newRetailers,
    costToSalesRatio: r.costToSalesRatio?.toFixed(4) ?? null,
    status: r.status,
    generatedAt: r.generatedAt.toISOString(),
    finalisedAt: r.finalisedAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null,
    pendingClaims,
  };
}

async function pendingClaimsBySalesman(month: string): Promise<Map<string, number>> {
  const { first, last } = monthBounds(month);
  const rows = await prisma.expenseClaim.groupBy({
    by: ['salesmanId'],
    where: {
      status: ExpenseStatus.SUBMITTED,
      date: { gte: dateColumn(first), lte: dateColumn(last) },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.salesmanId, r._count._all]));
}

export async function listReports(month: string): Promise<CostReportMonth> {
  const [rows, pending] = await Promise.all([
    prisma.monthlyCostReport.findMany({
      where: { month },
      include: reportInclude,
      orderBy: { salesman: { name: 'asc' } },
    }),
    pendingClaimsBySalesman(month),
  ]);
  const sum = (pick: (r: ReportRow) => Prisma.Decimal) =>
    rows.reduce((s, r) => s.add(pick(r)), D(0)).toFixed(2);
  return {
    month,
    items: rows.map((r) => toItem(r, pending.get(r.salesmanId) ?? 0)),
    totals: {
      salary: sum((r) => r.salary),
      expenses: sum((r) => r.taTotal.add(r.daTotal).add(r.otherExpenses)),
      incentives: sum((r) => r.incentives),
      deductions: sum((r) => r.deductions),
      grandTotal: sum((r) => r.grandTotal),
      orderValue: sum((r) => r.orderValue),
    },
  };
}

/**
 * Builds (or rebuilds) the month's report for every salesman who is active or
 * worked that month (SPEC 7: regenerating a DRAFT overwrites it; FINAL and
 * PAID are frozen). Deductions are the admin's input, so a rebuild keeps them.
 */
export async function generate(month: string, actorId: string): Promise<CostReportMonth> {
  if (month > toIstDateString(new Date()).slice(0, 7)) {
    throw ApiException.badRequest('A report cannot be generated for a future month');
  }
  const { first, last } = monthBounds(month);
  const salesmen = await prisma.user.findMany({
    where: {
      role: Role.SALESMAN,
      deletedAt: null,
      OR: [
        { isActive: true },
        { workDays: { some: { date: { gte: dateColumn(first), lte: dateColumn(last) } } } },
      ],
    },
    select: { id: true },
  });

  for (const { id: salesmanId } of salesmen) {
    const existing = await prisma.monthlyCostReport.findUnique({
      where: { salesmanId_month: { salesmanId, month } },
    });
    if (existing && FROZEN.includes(existing.status)) continue;
    const f = await figuresFor(salesmanId, month);
    const deductions = existing?.deductions ?? D(0);
    const { grandTotal, costToSalesRatio } = totalsFor(f, deductions);
    const data = {
      ...f,
      deductions,
      grandTotal,
      costToSalesRatio,
      generatedAt: new Date(),
      generatedById: actorId,
    };
    await prisma.monthlyCostReport.upsert({
      where: { salesmanId_month: { salesmanId, month } },
      create: { salesmanId, month, status: ReportStatus.DRAFT, ...data },
      update: data,
    });
  }
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'MonthlyCostReport',
    entityId: month,
    after: { month },
  });
  return listReports(month);
}

export async function updateReport(
  id: string,
  input: UpdateCostReportInput,
  actorId: string,
): Promise<CostReportMonth> {
  const report = await prisma.monthlyCostReport.findUnique({ where: { id } });
  if (!report) throw ApiException.notFound('Report not found');
  if (report.status !== ReportStatus.DRAFT)
    throw ApiException.conflict('Only a draft report can be changed');

  const deductions = input.deductions === undefined ? report.deductions : D(input.deductions);
  const { grandTotal, costToSalesRatio } = totalsFor(report, deductions);
  await prisma.monthlyCostReport.update({
    where: { id },
    data: {
      deductions,
      ...(input.deductionNote === undefined ? {} : { deductionNote: input.deductionNote }),
      grandTotal,
      costToSalesRatio,
    },
  });
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'MonthlyCostReport',
    entityId: id,
    before: { deductions: report.deductions.toFixed(2) },
    after: { deductions: deductions.toFixed(2), note: input.deductionNote },
  });
  return listReports(report.month);
}

export async function changeStatus(
  id: string,
  input: ChangeReportStatusInput,
  actorId: string,
): Promise<CostReportMonth> {
  const report = await prisma.monthlyCostReport.findUnique({ where: { id } });
  if (!report) throw ApiException.notFound('Report not found');
  if (!allowedReportMoves(report.status).includes(input.status)) {
    throw ApiException.badRequest(
      `A ${report.status.toLowerCase()} report cannot become ${input.status.toLowerCase()}`,
    );
  }
  const now = new Date();
  const moved = await prisma.monthlyCostReport.updateMany({
    where: { id, status: report.status },
    data: {
      status: input.status,
      ...(input.status === ReportStatus.FINAL ? { finalisedAt: now } : {}),
      ...(input.status === ReportStatus.PAID ? { paidAt: now } : {}),
      ...(input.status === ReportStatus.DRAFT ? { finalisedAt: null } : {}),
    },
  });
  if (moved.count === 0)
    throw ApiException.conflict('Someone else just changed this report. Reload it.');

  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'MonthlyCostReport',
    entityId: id,
    before: { status: report.status },
    after: { status: input.status },
  });
  if (input.status === ReportStatus.FINAL || input.status === ReportStatus.PAID) {
    await notify([report.salesmanId], {
      title:
        input.status === ReportStatus.PAID
          ? `${monthLabel(report.month)} paid`
          : `${monthLabel(report.month)} statement ready`,
      body: `Total ${formatInr(report.grandTotal.toFixed(2))}: salary, approved TA/DA and expenses, incentives and deductions.`,
      link: '/app/profile',
    });
  }
  return listReports(report.month);
}

/** SPEC 5.2 "My month": a salesman sees his statements once they are final. */
export async function myReports(salesmanId: string): Promise<CostReportItem[]> {
  const rows = await prisma.monthlyCostReport.findMany({
    where: { salesmanId, status: { in: FROZEN } },
    include: reportInclude,
    orderBy: { month: 'desc' },
    take: 12,
  });
  return rows.map((r) => toItem(r, 0));
}

export async function reportForExport(id: string, viewer: { userId: string; isAdmin: boolean }) {
  const report = await prisma.monthlyCostReport.findUnique({
    where: { id },
    include: reportInclude,
  });
  if (
    !report ||
    (!viewer.isAdmin && (report.salesmanId !== viewer.userId || !FROZEN.includes(report.status)))
  ) {
    throw ApiException.notFound('Report not found');
  }
  return toItem(report, 0);
}

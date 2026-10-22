import {
  DayType,
  ExpenseCategory,
  ExpenseStatus,
  Prisma,
  TravelMode,
  WorkDayStatus,
} from '@prisma/client';
import {
  OWN_VEHICLE_MODES,
  PUBLIC_TRANSPORT_MODES,
  daFor,
  taFor,
  type AllowanceRates,
  type AttachBillsInput,
  type BulkApproveInput,
  type CreateExpenseInput,
  type ExpenseFlag,
  type ExpenseItem,
  type ExpenseListResult,
  type ListExpensesQuery,
  type ReviewExpenseInput,
  type UpdateExpenseInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { toIstDateString } from '../../lib/dates';
import { CATEGORY_NAMES, formatDateDmy, formatInr } from '../../lib/money';
import { assertOwnPath } from '../../lib/storage';
import { notify, notifyReviewers } from '../notifications/notifications.service';
import { policyOn, ratesOf, versions } from './policy.service';

const DAY_TYPE_NAMES: Record<DayType, string> = {
  HQ: 'HQ',
  EX_HQ: 'Ex-HQ',
  OUTSTATION: 'Outstation',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
};

const dateColumn = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const include = {
  salesman: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  fromTown: { select: { id: true, name: true } },
  toTown: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseClaimInclude;

type Row = Prisma.ExpenseClaimGetPayload<{ include: typeof include }>;

// --- policy check -------------------------------------------------------------

export interface ClaimContext {
  rates: AllowanceRates | null;
  /** The work day the claim belongs to, if any. */
  day: { dayType: DayType; visits: number; totalKm: number | null } | null;
  /** Other non-rejected PHONE claims by the same salesman in the same month. */
  otherPhoneThisMonth: number;
  /** Other non-rejected claims of the same category on the same date. */
  sameKindSameDay: number;
}

/**
 * The ceiling the policy puts on one claim, and what looks wrong with it
 * (SPEC 4.6: "policy limit next to claimed amount, auto-flag claims above
 * policy"). Pure, so the rules can be tested without a database.
 */
export function assessClaim(
  claim: {
    category: ExpenseCategory;
    travelMode: TravelMode | null;
    km: number | null;
    amountClaimed: number;
    billCount: number;
  },
  ctx: ClaimContext,
): { limit: number | null; flags: ExpenseFlag[] } {
  const flags: ExpenseFlag[] = [];
  let limit: number | null = null;
  const r = ctx.rates;

  if (r) {
    switch (claim.category) {
      case ExpenseCategory.DA:
        limit = ctx.day ? daFor(r, ctx.day.dayType, ctx.day.visits) : null;
        break;
      case ExpenseCategory.TA:
        if (claim.travelMode && OWN_VEHICLE_MODES.includes(claim.travelMode)) {
          limit = taFor(r, claim.travelMode, claim.km ?? 0);
        } else if (
          claim.travelMode &&
          PUBLIC_TRANSPORT_MODES.includes(claim.travelMode) &&
          r.publicTransportNeedsBill &&
          claim.billCount === 0
        ) {
          flags.push('BILL_MISSING');
        }
        break;
      case ExpenseCategory.LODGING:
        limit = r.maxLodgingPerNight;
        break;
      case ExpenseCategory.PHONE:
        limit = Math.max(0, r.monthlyPhoneAllowance - ctx.otherPhoneThisMonth);
        break;
      default:
        break;
    }
  }

  if (limit !== null && claim.amountClaimed > limit + 0.005) flags.push('OVER_LIMIT');
  if (
    claim.category === ExpenseCategory.TA &&
    claim.km !== null &&
    ctx.day?.totalKm != null &&
    claim.km > ctx.day.totalKm + 1
  ) {
    flags.push('KM_ABOVE_DAY');
  }
  // TA can legitimately come in legs (bus there, auto back); the rest is once a day.
  const oncePerDay: ExpenseCategory[] = [ExpenseCategory.DA, ExpenseCategory.LODGING];
  if (oncePerDay.includes(claim.category) && ctx.sameKindSameDay > 0) flags.push('DUPLICATE');

  return { limit, flags };
}

/** Builds the policy context for a page of claims in a handful of queries. */
async function enrich(rows: Row[]): Promise<ExpenseItem[]> {
  if (rows.length === 0) return [];
  const policies = await versions();

  const dayIds = [...new Set(rows.flatMap((r) => (r.workDayId ? [r.workDayId] : [])))];
  const salesmanIds = [...new Set(rows.map((r) => r.salesmanId))];
  const dates = [...new Set(rows.map((r) => r.date.getTime()))].map((t) => new Date(t));
  const months = [...new Set(rows.map((r) => isoDate(r.date).slice(0, 7)))];

  const [days, visitCounts, siblings, phones] = await Promise.all([
    prisma.workDay.findMany({
      where: { id: { in: dayIds } },
      select: { id: true, dayType: true, totalKm: true },
    }),
    prisma.visit.groupBy({
      by: ['workDayId'],
      where: { workDayId: { in: dayIds } },
      _count: { _all: true },
    }),
    prisma.expenseClaim.findMany({
      where: {
        salesmanId: { in: salesmanIds },
        date: { in: dates },
        category: { in: [ExpenseCategory.DA, ExpenseCategory.LODGING] },
        status: { not: ExpenseStatus.REJECTED },
      },
      select: { id: true, salesmanId: true, date: true, category: true },
    }),
    prisma.expenseClaim.findMany({
      where: {
        salesmanId: { in: salesmanIds },
        category: ExpenseCategory.PHONE,
        status: { not: ExpenseStatus.REJECTED },
        OR: months.map((m) => ({
          date: { gte: dateColumn(`${m}-01`), lt: dateColumn(nextMonthStart(m)) },
        })),
      },
      select: { id: true, salesmanId: true, date: true, amountClaimed: true },
    }),
  ]);

  const dayById = new Map(days.map((d) => [d.id, d]));
  const visitsByDay = new Map(visitCounts.map((v) => [v.workDayId, v._count._all]));

  return rows.map((row) => {
    const date = isoDate(row.date);
    const policy = policyOn(policies, date);
    const day = row.workDayId ? dayById.get(row.workDayId) : undefined;
    const { limit, flags } = assessClaim(
      {
        category: row.category,
        travelMode: row.travelMode,
        km: row.km?.toNumber() ?? null,
        amountClaimed: row.amountClaimed.toNumber(),
        billCount: row.billPhotoUrls.length,
      },
      {
        rates: policy ? ratesOf(policy) : null,
        day: day
          ? {
              dayType: day.dayType,
              visits: visitsByDay.get(day.id) ?? 0,
              totalKm: day.totalKm?.toNumber() ?? null,
            }
          : null,
        otherPhoneThisMonth: phones
          .filter(
            (p) =>
              p.id !== row.id &&
              p.salesmanId === row.salesmanId &&
              isoDate(p.date).slice(0, 7) === date.slice(0, 7),
          )
          .reduce((sum, p) => sum + p.amountClaimed.toNumber(), 0),
        sameKindSameDay: siblings.filter(
          (s) =>
            s.id !== row.id &&
            s.salesmanId === row.salesmanId &&
            s.category === row.category &&
            isoDate(s.date) === date,
        ).length,
      },
    );

    return {
      id: row.id,
      clientUuid: row.clientUuid,
      salesman: row.salesman,
      workDayId: row.workDayId,
      date,
      category: row.category,
      travelMode: row.travelMode,
      km: row.km?.toFixed(2) ?? null,
      fromTown: row.fromTown,
      toTown: row.toTown,
      description: row.description,
      amountClaimed: row.amountClaimed.toFixed(2),
      amountApproved: row.amountApproved?.toFixed(2) ?? null,
      billPhotoPaths: row.billPhotoUrls,
      status: row.status,
      adminRemark: row.adminRemark,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      isAutoDrafted: row.isAutoDrafted,
      policyLimit: limit === null ? null : limit.toFixed(2),
      flags,
    };
  });
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

async function getItem(id: string): Promise<ExpenseItem> {
  const row = await prisma.expenseClaim.findUniqueOrThrow({ where: { id }, include });
  return (await enrich([row]))[0]!;
}

// --- reads ------------------------------------------------------------------------

export interface Viewer {
  userId: string;
  isAdmin: boolean;
}

export async function list(q: ListExpensesQuery, viewer: Viewer): Promise<ExpenseListResult> {
  const month = q.month ?? toIstDateString(new Date()).slice(0, 7);
  const where: Prisma.ExpenseClaimWhereInput = {
    // A salesman sees his own claims, whatever he asks for (SPEC 6).
    salesmanId: viewer.isAdmin ? q.salesmanId : viewer.userId,
    ...(q.workDayId
      ? { workDayId: q.workDayId }
      : { date: { gte: dateColumn(`${month}-01`), lt: dateColumn(nextMonthStart(month)) } }),
    ...(q.category ? { category: q.category } : {}),
  };

  const rows = await prisma.expenseClaim.findMany({
    where,
    include,
    orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
    take: 1000,
  });
  const all = await enrich(rows);

  const sum = (items: ExpenseItem[], pick: (i: ExpenseItem) => string | null) =>
    items.reduce((s, i) => s.add(pick(i) ?? '0'), new Prisma.Decimal(0)).toFixed(2);
  const byStatus = Object.fromEntries(
    Object.values(ExpenseStatus).map((s) => [s, all.filter((i) => i.status === s).length]),
  ) as Record<ExpenseStatus, number>;
  const reviewed: ExpenseStatus[] = [ExpenseStatus.APPROVED, ExpenseStatus.PARTIALLY_APPROVED];

  const items = all
    .filter((i) => !q.status || i.status === q.status)
    .filter((i) => !q.flaggedOnly || i.flags.length > 0);

  return {
    items,
    summary: {
      month,
      claimed: sum(
        all.filter((i) => i.status !== ExpenseStatus.DRAFT),
        (i) => i.amountClaimed,
      ),
      approved: sum(
        all.filter((i) => reviewed.includes(i.status)),
        (i) => i.amountApproved,
      ),
      pending: sum(
        all.filter((i) => i.status === ExpenseStatus.SUBMITTED),
        (i) => i.amountClaimed,
      ),
      rejected: sum(
        all.filter((i) => i.status === ExpenseStatus.REJECTED),
        (i) => i.amountClaimed,
      ),
      byStatus,
    },
  };
}

// --- salesman writes -----------------------------------------------------------------

async function ownClaim(salesmanId: string, id: string) {
  const claim = await prisma.expenseClaim.findFirst({ where: { id, salesmanId } });
  if (!claim) throw ApiException.notFound('Expense not found');
  return claim;
}

function assertEditable(claim: { status: ExpenseStatus; isAutoDrafted: boolean }) {
  if (claim.status !== ExpenseStatus.DRAFT) {
    throw ApiException.conflict('This expense has been submitted and can no longer change');
  }
  if (claim.isAutoDrafted) {
    throw ApiException.badRequest(
      'TA/DA drafted from the policy cannot be edited. Ask the admin if it is wrong.',
    );
  }
}

export async function create(salesmanId: string, input: CreateExpenseInput): Promise<ExpenseItem> {
  const existing = await prisma.expenseClaim.findUnique({
    where: { clientUuid: input.clientUuid },
  });
  if (existing) {
    if (existing.salesmanId !== salesmanId) throw ApiException.conflict('Duplicate expense id');
    return getItem(existing.id);
  }

  let date: Date;
  if (input.workDayId) {
    const day = await prisma.workDay.findFirst({ where: { id: input.workDayId, salesmanId } });
    if (!day) throw ApiException.notFound('Work day not found');
    // A submitted day is locked; anything forgotten goes in as a separate claim.
    if (day.status !== WorkDayStatus.OPEN) {
      throw ApiException.conflict('That day is submitted. Add this as a separate expense instead.');
    }
    date = day.date;
  } else {
    if (input.date! > toIstDateString(new Date()))
      throw ApiException.badRequest('An expense cannot be in the future');
    date = dateColumn(input.date!);
  }

  const towns = [input.fromTownId, input.toTownId].filter((t): t is string => Boolean(t));
  if (
    towns.length &&
    (await prisma.town.count({ where: { id: { in: towns } } })) !== new Set(towns).size
  ) {
    throw ApiException.badRequest('Town not found');
  }

  try {
    const row = await prisma.expenseClaim.create({
      data: {
        clientUuid: input.clientUuid,
        salesmanId,
        workDayId: input.workDayId ?? null,
        date,
        category: input.category,
        travelMode: input.travelMode ?? null,
        fromTownId: input.fromTownId ?? null,
        toTownId: input.toTownId ?? null,
        km: input.km == null ? null : new Prisma.Decimal(input.km),
        amountClaimed: new Prisma.Decimal(input.amountClaimed),
        description: input.description ?? null,
        status: ExpenseStatus.DRAFT,
        isAutoDrafted: false,
        billPhotoUrls: [],
      },
    });
    return getItem(row.id);
  } catch (err) {
    // Two copies of the same queued claim raced past the lookup.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.expenseClaim.findUnique({
        where: { clientUuid: input.clientUuid },
      });
      if (winner?.salesmanId === salesmanId) return getItem(winner.id);
    }
    throw err;
  }
}

export async function update(
  salesmanId: string,
  id: string,
  input: UpdateExpenseInput,
): Promise<ExpenseItem> {
  const claim = await ownClaim(salesmanId, id);
  assertEditable(claim);
  await prisma.expenseClaim.update({
    where: { id },
    data: {
      ...(input.amountClaimed === undefined
        ? {}
        : { amountClaimed: new Prisma.Decimal(input.amountClaimed) }),
      ...(input.description === undefined ? {} : { description: input.description ?? null }),
    },
  });
  return getItem(id);
}

export async function remove(salesmanId: string, id: string): Promise<void> {
  const claim = await ownClaim(salesmanId, id);
  assertEditable(claim);
  await prisma.expenseClaim.delete({ where: { id } });
}

/** Bills follow their claim, like visit photos, so a claim syncs before its uploads. */
export async function attachBills(
  salesmanId: string,
  id: string,
  input: AttachBillsInput,
): Promise<ExpenseItem> {
  const claim = await ownClaim(salesmanId, id);
  const reviewable: ExpenseStatus[] = [ExpenseStatus.DRAFT, ExpenseStatus.SUBMITTED];
  if (!reviewable.includes(claim.status))
    throw ApiException.conflict('This expense has already been reviewed');
  for (const path of input.paths) assertOwnPath(path, 'bills', salesmanId);
  const merged = [...new Set([...claim.billPhotoUrls, ...input.paths])];
  if (merged.length > 6) throw ApiException.badRequest('At most 6 bill photos per expense');
  await prisma.expenseClaim.update({ where: { id }, data: { billPhotoUrls: merged } });
  return getItem(id);
}

/** A claim not tied to a day (phone bill, a forgotten receipt) is submitted on its own. */
export async function submit(salesmanId: string, id: string): Promise<ExpenseItem> {
  const claim = await ownClaim(salesmanId, id);
  if (claim.workDayId) throw ApiException.badRequest('This expense is submitted with its work day');
  if (claim.status !== ExpenseStatus.DRAFT) return getItem(id);

  await prisma.expenseClaim.update({ where: { id }, data: { status: ExpenseStatus.SUBMITTED } });
  const item = await getItem(id);
  await notifyReviewers({
    title: 'Expense submitted',
    body: `${item.salesman.name}: ${CATEGORY_NAMES[item.category]} ${formatInr(item.amountClaimed)} for ${formatDateDmy(item.date)}`,
    link: '/admin/expenses',
  });
  return item;
}

// --- drafting and day submission (called from the work-day flow) ------------------------

/**
 * SPEC 5.1.6 / 7: at End Day, draft DA by day type and, for an own vehicle,
 * TA as km x policy rate. Bus and train are left for the salesman to claim at
 * actuals with a bill. Re-running replaces the previous drafts.
 */
export async function draftForDay(
  dayId: string,
  travelMode: TravelMode | null | undefined,
): Promise<void> {
  const day = await prisma.workDay.findUniqueOrThrow({
    where: { id: dayId },
    include: { _count: { select: { visits: true } } },
  });
  const date = isoDate(day.date);
  const policy = policyOn(await versions(), date);
  if (!policy) return;
  const rates = ratesOf(policy);

  const drafts: Prisma.ExpenseClaimCreateManyInput[] = [];
  const da = daFor(rates, day.dayType, day._count.visits);
  if (da > 0) {
    drafts.push({
      salesmanId: day.salesmanId,
      workDayId: day.id,
      date: day.date,
      category: ExpenseCategory.DA,
      amountClaimed: new Prisma.Decimal(da),
      description: `${DAY_TYPE_NAMES[day.dayType]} day`,
      status: ExpenseStatus.DRAFT,
      isAutoDrafted: true,
      billPhotoUrls: [],
    });
  }
  const km = day.totalKm?.toNumber() ?? 0;
  if (travelMode && km > 0) {
    const ta = taFor(rates, travelMode, km);
    if (ta !== null && ta > 0) {
      drafts.push({
        salesmanId: day.salesmanId,
        workDayId: day.id,
        date: day.date,
        category: ExpenseCategory.TA,
        travelMode,
        km: new Prisma.Decimal(km),
        amountClaimed: new Prisma.Decimal(ta),
        description: `${km} km by ${travelMode.toLowerCase()}`,
        status: ExpenseStatus.DRAFT,
        isAutoDrafted: true,
        billPhotoUrls: [],
      });
    }
  }

  await prisma.$transaction([
    prisma.expenseClaim.deleteMany({
      where: { workDayId: day.id, isAutoDrafted: true, status: ExpenseStatus.DRAFT },
    }),
    prisma.expenseClaim.createMany({ data: drafts }),
  ]);
}

/** Moves a day's drafts to SUBMITTED along with the day; returns the total claimed. */
export async function submitDayClaims(
  tx: Prisma.TransactionClient,
  dayId: string,
): Promise<Prisma.Decimal> {
  await tx.expenseClaim.updateMany({
    where: { workDayId: dayId, status: ExpenseStatus.DRAFT },
    data: { status: ExpenseStatus.SUBMITTED },
  });
  const total = await tx.expenseClaim.aggregate({
    where: { workDayId: dayId, status: ExpenseStatus.SUBMITTED },
    _sum: { amountClaimed: true },
  });
  return total._sum.amountClaimed ?? new Prisma.Decimal(0);
}

/** Admin reopened a day: its unreviewed claims go back to draft with it. */
export async function reopenDayClaims(tx: Prisma.TransactionClient, dayId: string): Promise<void> {
  await tx.expenseClaim.updateMany({
    where: { workDayId: dayId, status: ExpenseStatus.SUBMITTED },
    data: { status: ExpenseStatus.DRAFT },
  });
}

// --- admin review ----------------------------------------------------------------------

const STATUS_FOR: Record<ReviewExpenseInput['decision'], ExpenseStatus> = {
  APPROVE: ExpenseStatus.APPROVED,
  PARTIAL: ExpenseStatus.PARTIALLY_APPROVED,
  REJECT: ExpenseStatus.REJECTED,
};

export async function review(
  id: string,
  input: ReviewExpenseInput,
  actorId: string,
): Promise<ExpenseItem> {
  const claim = await prisma.expenseClaim.findUnique({ where: { id } });
  if (!claim) throw ApiException.notFound('Expense not found');
  if (claim.status !== ExpenseStatus.SUBMITTED) {
    throw ApiException.conflict('Only a submitted expense can be reviewed');
  }

  let approved: Prisma.Decimal;
  if (input.decision === 'APPROVE') approved = claim.amountClaimed;
  else if (input.decision === 'REJECT') approved = new Prisma.Decimal(0);
  else {
    approved = new Prisma.Decimal(input.amountApproved!);
    if (approved.gte(claim.amountClaimed)) {
      throw ApiException.badRequest('A partial approval must be less than the amount claimed');
    }
  }

  const status = STATUS_FOR[input.decision];
  // Guarded on SUBMITTED so two reviewers cannot both decide the same claim.
  const moved = await prisma.expenseClaim.updateMany({
    where: { id, status: ExpenseStatus.SUBMITTED },
    data: {
      status,
      amountApproved: approved,
      adminRemark: input.remark ?? null,
      reviewedById: actorId,
      reviewedAt: new Date(),
    },
  });
  if (moved.count === 0)
    throw ApiException.conflict('Someone else just reviewed this expense. Reload it.');

  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'ExpenseClaim',
    entityId: id,
    before: { status: claim.status },
    after: { status, amountApproved: approved.toFixed(2), remark: input.remark },
  });

  const item = await getItem(id);
  const verb = { APPROVE: 'approved', PARTIAL: 'partly approved', REJECT: 'rejected' }[
    input.decision
  ];
  await notify([claim.salesmanId], {
    title: `Expense ${verb}`,
    body:
      `${CATEGORY_NAMES[item.category]} for ${formatDateDmy(item.date)}: ` +
      (input.decision === 'PARTIAL'
        ? `${formatInr(approved.toFixed(2))} of ${formatInr(item.amountClaimed)}`
        : formatInr(item.amountClaimed)) +
      (input.remark ? `. ${input.remark}` : ''),
    link: '/app/expenses',
  });
  return item;
}

/** Approves every listed claim still SUBMITTED, at the full amount (SPEC 4.6). */
export async function bulkApprove(input: BulkApproveInput, actorId: string) {
  const approved = await prisma.$queryRaw<
    { id: string; salesmanId: string; amountClaimed: Prisma.Decimal }[]
  >`
    UPDATE "ExpenseClaim"
       SET "status" = 'APPROVED', "amountApproved" = "amountClaimed",
           "reviewedById" = ${actorId}, "reviewedAt" = now(), "updatedAt" = now()
     WHERE "id" = ANY(${input.ids}) AND "status" = 'SUBMITTED'
 RETURNING "id", "salesmanId", "amountClaimed"`;

  const bySalesman = new Map<string, { count: number; total: Prisma.Decimal }>();
  for (const row of approved) {
    const entry = bySalesman.get(row.salesmanId) ?? { count: 0, total: new Prisma.Decimal(0) };
    entry.count += 1;
    entry.total = entry.total.add(row.amountClaimed);
    bySalesman.set(row.salesmanId, entry);
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      entity: 'ExpenseClaim',
      entityId: row.id,
      after: { status: 'APPROVED', amountApproved: row.amountClaimed.toFixed(2), bulk: true },
    });
  }
  for (const [salesmanId, { count, total }] of bySalesman) {
    await notify([salesmanId], {
      title: 'Expenses approved',
      body: `${count} expense${count === 1 ? '' : 's'} approved, ${formatInr(total.toFixed(2))} in total.`,
      link: '/app/expenses',
    });
  }
  return { approved: approved.length, skipped: input.ids.length - approved.length };
}

import { Prisma, LeadActivityType, LeadStage } from '@prisma/client';
import {
  OPEN_LEAD_STAGES,
  LEAD_STAGE_ORDER,
  type ChangeLeadStageInput,
  type CreateLeadActivityInput,
  type CreateLeadInput,
  type LeadActivityItem,
  type LeadDetail,
  type LeadFunnel,
  type LeadListItem,
  type LeadPipeline,
  type ListLeadsQuery,
  type Paginated,
  type UpdateLeadInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException, paginate } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import {
  moneyOrNull,
  refreshCoverage,
  requireTownDistrict,
  toIso,
} from '../partners/partners.shared';

const include = {
  town: { select: { id: true, name: true } },
  district: { select: { id: true, name: true, code: true } },
  assignedTo: { select: { id: true, name: true } },
  activities: { orderBy: { at: 'desc' }, take: 1, select: { at: true } },
  _count: { select: { activities: true } },
} satisfies Prisma.LeadInclude;

type Row = Prisma.LeadGetPayload<{ include: typeof include }>;

/** Shared by every screen so "overdue" means one thing: due before today, still open. */
const isOverdue = (followUpAt: Date | null, stage: LeadStage): boolean =>
  followUpAt !== null && followUpAt < new Date() && OPEN_LEAD_STAGES.includes(stage);

function toListItem(row: Row): LeadListItem {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    firmName: row.firmName,
    phone: row.phone,
    source: row.source,
    stage: row.stage,
    lostReason: row.lostReason,
    expectedInvestment: moneyOrNull(row.expectedInvestment),
    followUpAt: toIso(row.followUpAt),
    isOverdue: isOverdue(row.followUpAt, row.stage),
    notes: row.notes,
    convertedAt: toIso(row.convertedAt),
    createdAt: row.createdAt.toISOString(),
    town: row.town,
    district: row.district,
    assignedTo: row.assignedTo,
    activityCount: row._count.activities,
    lastActivityAt: toIso(row.activities[0]?.at),
  };
}

/** Dates arrive as `YYYY-MM-DD`; store them at the start of that day in IST. */
const followUpDate = (value: string | null | undefined): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(`${value}T00:00:00+05:30`);
};

function buildWhere(queryInput: ListLeadsQuery): Prisma.LeadWhereInput {
  const { search, type, stage, districtId, townId, assignedToId, source, overdue, openOnly } =
    queryInput;

  return {
    deletedAt: null,
    ...(type ? { type } : {}),
    ...(stage ? { stage } : {}),
    ...(districtId ? { districtId } : {}),
    ...(townId ? { townId } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(source ? { source } : {}),
    ...(openOnly ? { stage: { in: OPEN_LEAD_STAGES } } : {}),
    ...(overdue ? { followUpAt: { lt: new Date() }, stage: { in: OPEN_LEAD_STAGES } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { firmName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };
}

export async function list(queryInput: ListLeadsQuery): Promise<Paginated<LeadListItem>> {
  const { page, limit } = queryInput;
  const where = buildWhere(queryInput);

  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include,
      // Soonest follow-up first, so the list doubles as a to-do queue.
      orderBy: [{ followUpAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return paginate(rows.map(toListItem), total, page, limit);
}

export async function getById(id: string): Promise<LeadDetail> {
  const row = await prisma.lead.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...include,
      activities: {
        orderBy: { at: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!row) throw ApiException.notFound('Lead not found');

  const activities: LeadActivityItem[] = row.activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    note: activity.note,
    at: activity.at.toISOString(),
    user: activity.user,
  }));

  // The shared mapper wants the "latest activity only" shape, so narrow it.
  const base = toListItem({
    ...row,
    activities: row.activities.slice(0, 1),
    _count: { activities: row.activities.length },
  } as Row);

  return { ...base, activities };
}

/**
 * Kanban payload: one capped page of cards per stage plus the real totals, so a
 * busy column shows "showing 20 of 140" instead of silently truncating.
 */
export async function pipeline(queryInput: ListLeadsQuery, perColumn = 20): Promise<LeadPipeline> {
  const baseWhere = buildWhere({ ...queryInput, stage: undefined, openOnly: undefined });

  const [grouped, overdueCount, ...perStage] = await Promise.all([
    prisma.lead.groupBy({
      by: ['stage'],
      where: baseWhere,
      _count: { _all: true },
      _sum: { expectedInvestment: true },
    }),
    prisma.lead.count({
      where: { ...baseWhere, followUpAt: { lt: new Date() }, stage: { in: OPEN_LEAD_STAGES } },
    }),
    ...LEAD_STAGE_ORDER.map((stage) =>
      prisma.lead.findMany({
        where: { ...baseWhere, stage },
        include,
        orderBy: [{ followUpAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: perColumn,
      }),
    ),
  ]);

  const totals = new Map(grouped.map((g) => [g.stage, g]));

  return {
    columns: LEAD_STAGE_ORDER.map((stage, index) => ({
      stage,
      total: totals.get(stage)?._count._all ?? 0,
      value: (totals.get(stage)?._sum.expectedInvestment ?? new Prisma.Decimal(0)).toFixed(2),
      leads: (perStage[index] ?? []).map(toListItem),
    })),
    overdueCount,
  };
}

export async function funnel(queryInput: ListLeadsQuery): Promise<LeadFunnel> {
  const where = buildWhere({ ...queryInput, stage: undefined, openOnly: undefined });

  const grouped = await prisma.lead.groupBy({
    by: ['stage'],
    where,
    _count: { _all: true },
    _sum: { expectedInvestment: true },
  });

  const totals = new Map(grouped.map((g) => [g.stage, g]));
  const stages = LEAD_STAGE_ORDER.map((stage) => ({
    stage,
    count: totals.get(stage)?._count._all ?? 0,
    value: (totals.get(stage)?._sum.expectedInvestment ?? new Prisma.Decimal(0)).toFixed(2),
  }));

  const wonCount = totals.get(LeadStage.WON)?._count._all ?? 0;
  const lostCount = totals.get(LeadStage.LOST)?._count._all ?? 0;
  const decided = wonCount + lostCount;

  return {
    stages,
    totalLeads: stages.reduce((sum, s) => sum + s.count, 0),
    wonCount,
    lostCount,
    // Measured against decided leads only; counting open ones as failures would
    // make the rate drop every time a new lead is added.
    conversionRate: decided === 0 ? 0 : Math.round((wonCount / decided) * 1000) / 10,
  };
}

async function assertAssigneeExists(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const user = await prisma.user.findFirst({ where: { id, isActive: true, deletedAt: null } });
  if (!user) throw ApiException.badRequest('Assigned salesman not found');
}

export async function create(
  input: CreateLeadInput,
  actorId: string,
  options: { createdBySalesmanId?: string; clientUuid?: string } = {},
): Promise<LeadDetail> {
  const districtId = await requireTownDistrict(input.townId);
  await assertAssigneeExists(input.assignedToId);

  const row = await prisma.lead.create({
    data: {
      type: input.type,
      name: input.name,
      firmName: input.firmName ?? null,
      phone: input.phone,
      townId: input.townId,
      districtId,
      source: input.source,
      stage: input.stage,
      assignedToId: input.assignedToId ?? options.createdBySalesmanId ?? null,
      expectedInvestment:
        input.expectedInvestment === null || input.expectedInvestment === undefined
          ? null
          : new Prisma.Decimal(input.expectedInvestment),
      followUpAt: followUpDate(input.followUpAt) ?? null,
      notes: input.notes ?? null,
      clientUuid: options.clientUuid ?? null,
      activities: {
        create: {
          userId: actorId,
          type: LeadActivityType.NOTE,
          note: `Lead created at stage ${input.stage}.`,
        },
      },
    },
  });

  // An open lead in an otherwise empty district makes it LEADS_ONLY.
  await refreshCoverage([districtId]);

  const result = await getById(row.id);
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'Lead',
    entityId: row.id,
    after: result,
  });
  return result;
}

export async function update(
  id: string,
  input: UpdateLeadInput,
  actorId: string,
): Promise<LeadDetail> {
  const existing = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiException.notFound('Lead not found');

  const nextDistrictId = input.townId
    ? await requireTownDistrict(input.townId)
    : existing.districtId;
  await assertAssigneeExists(input.assignedToId);

  await prisma.lead.update({
    where: { id },
    data: {
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.firmName === undefined ? {} : { firmName: input.firmName ?? null }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.townId === undefined ? {} : { townId: input.townId, districtId: nextDistrictId }),
      ...(input.source === undefined ? {} : { source: input.source }),
      ...(input.assignedToId === undefined ? {} : { assignedToId: input.assignedToId ?? null }),
      ...(input.expectedInvestment === undefined
        ? {}
        : {
            expectedInvestment:
              input.expectedInvestment === null
                ? null
                : new Prisma.Decimal(input.expectedInvestment),
          }),
      ...(input.followUpAt === undefined ? {} : { followUpAt: followUpDate(input.followUpAt) }),
      ...(input.notes === undefined ? {} : { notes: input.notes ?? null }),
    },
  });

  await refreshCoverage([existing.districtId, nextDistrictId]);

  const result = await getById(id);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Lead',
    entityId: id,
    after: result,
  });
  return result;
}

/** Stage changes are logged on the timeline, which is the point of the timeline. */
export async function changeStage(
  id: string,
  input: ChangeLeadStageInput,
  actorId: string,
): Promise<LeadDetail> {
  const existing = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiException.notFound('Lead not found');
  if (existing.stage === input.stage)
    throw ApiException.badRequest('The lead is already at that stage');
  if (existing.convertedAt) {
    throw ApiException.badRequest('This lead has been converted and can no longer move');
  }

  const note =
    input.note ??
    `Moved from ${existing.stage} to ${input.stage}${input.lostReason ? `: ${input.lostReason}` : ''}`;

  await prisma.$transaction([
    prisma.lead.update({
      where: { id },
      data: {
        stage: input.stage,
        lostReason: input.stage === LeadStage.LOST ? (input.lostReason ?? null) : null,
        // A lead that leaves the open stages has no outstanding follow-up.
        ...(OPEN_LEAD_STAGES.includes(input.stage) ? {} : { followUpAt: null }),
      },
    }),
    prisma.leadActivity.create({
      data: { leadId: id, userId: actorId, type: LeadActivityType.STAGE_CHANGE, note },
    }),
  ]);

  // WON and LOST leave the open set, which can drop a district out of LEADS_ONLY.
  await refreshCoverage([existing.districtId]);

  const result = await getById(id);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Lead',
    entityId: id,
    before: { stage: existing.stage },
    after: { stage: input.stage },
  });
  return result;
}

export async function addActivity(
  id: string,
  input: CreateLeadActivityInput,
  actorId: string,
): Promise<LeadDetail> {
  const existing = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiException.notFound('Lead not found');

  await prisma.$transaction([
    prisma.leadActivity.create({
      data: { leadId: id, userId: actorId, type: input.type, note: input.note },
    }),
    ...(input.followUpAt === undefined
      ? []
      : [
          prisma.lead.update({
            where: { id },
            data: { followUpAt: followUpDate(input.followUpAt) },
          }),
        ]),
  ]);

  return getById(id);
}

export async function remove(id: string, actorId: string): Promise<void> {
  const existing = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiException.notFound('Lead not found');

  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await refreshCoverage([existing.districtId]);

  await writeAuditLog({ userId: actorId, action: 'DELETE', entity: 'Lead', entityId: id });
}

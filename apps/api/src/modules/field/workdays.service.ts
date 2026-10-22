import { DayType, PingSource, Prisma, WorkDayStatus } from '@prisma/client';
import {
  GPS_ACCURACY_LIMIT_M,
  type CurrentWorkDay,
  type EndWorkDayInput,
  type ListWorkDaysQuery,
  type StartWorkDayInput,
  type WorkDaySummary,
  type ReviewWorkDayInput,
  type WorkDayQueueItem,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { toIstDateString } from '../../lib/dates';
import { clampDeviceTime, nearestPlaceLabel, pathKm, type LatLng } from '../../lib/geo';
import { assertOwnPath } from '../../lib/storage';
import { formatDateDmy, formatInr } from '../../lib/money';
import { draftForDay, reopenDayClaims, submitDayClaims } from '../expenses/expenses.service';
import { notify, notifyReviewers } from '../notifications/notifications.service';

/** SPEC 7: odometer km above 1.3x GPS km is flagged. */
const ODOMETER_GPS_RATIO_LIMIT = 1.3;

/** `@db.Date` columns hold a calendar day; the IST date is stored at UTC midnight. */
const dateColumn = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

const num = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());

const include = {
  beat: { select: { id: true, name: true } },
} satisfies Prisma.WorkDayInclude;

type Row = Prisma.WorkDayGetPayload<{ include: typeof include }>;

/** A day is active (accepting visits) from Start Day until End Day. */
const isActive = (day: { status: WorkDayStatus; startAt: Date | null; endAt: Date | null }) =>
  day.status === WorkDayStatus.OPEN && day.startAt !== null && day.endAt === null;

async function totalsFor(rows: Row[]): Promise<Map<string, WorkDaySummary['totals']>> {
  const ids = rows.map((r) => r.id);
  const [visits, newShops, orders] = await Promise.all([
    prisma.visit.groupBy({
      by: ['workDayId'],
      where: { workDayId: { in: ids } },
      _count: { _all: true },
    }),
    // A new shop may also take an order, so count them by the shop data, not the outcome.
    prisma.visit.groupBy({
      by: ['workDayId'],
      where: { workDayId: { in: ids }, newShopName: { not: null } },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { visit: { workDayId: { in: ids } } },
      select: { totalAmount: true, visit: { select: { workDayId: true } } },
    }),
  ]);

  const totals = new Map<string, WorkDaySummary['totals']>();
  for (const row of rows) {
    totals.set(row.id, { visits: 0, orders: 0, orderValue: '0.00', newShops: 0, leads: 0 });
  }
  for (const group of visits) totals.get(group.workDayId)!.visits = group._count._all;
  for (const group of newShops) totals.get(group.workDayId)!.newShops = group._count._all;
  const value = new Map<string, Prisma.Decimal>();
  for (const order of orders) {
    const dayId = order.visit!.workDayId;
    totals.get(dayId)!.orders += 1;
    value.set(dayId, (value.get(dayId) ?? new Prisma.Decimal(0)).add(order.totalAmount));
  }
  for (const [dayId, sum] of value) totals.get(dayId)!.orderValue = sum.toFixed(2);

  // Leads carry no "created on day" link, so count the ones he logged while the day ran.
  for (const row of rows) {
    if (!row.startAt) continue;
    totals.get(row.id)!.leads = await prisma.lead.count({
      where: {
        assignedToId: row.salesmanId,
        deletedAt: null,
        createdAt: { gte: row.startAt, ...(row.endAt ? { lte: row.endAt } : {}) },
      },
    });
  }
  return totals;
}

function toSummary(row: Row, totals: WorkDaySummary['totals']): WorkDaySummary {
  const totalKm = num(row.totalKm);
  const gpsKm = num(row.gpsKm);
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    status: row.status,
    dayType: row.dayType,
    beat: row.beat,
    startAt: row.startAt?.toISOString() ?? null,
    startPlaceLabel: row.startPlaceLabel,
    startAccuracyM: row.startAccuracyM,
    startOdometer: row.startOdometer,
    endAt: row.endAt?.toISOString() ?? null,
    endPlaceLabel: row.endPlaceLabel,
    endAccuracyM: row.endAccuracyM,
    endOdometer: row.endOdometer,
    endedProperly: row.endedProperly,
    workingMinutes: row.workingMinutes,
    totalKm: row.totalKm?.toFixed(2) ?? null,
    gpsKm: row.gpsKm?.toFixed(2) ?? null,
    remarks: row.remarks,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    totals,
    flags: {
      poorStartAccuracy: (row.startAccuracyM ?? 0) > GPS_ACCURACY_LIMIT_M,
      poorEndAccuracy: (row.endAccuracyM ?? 0) > GPS_ACCURACY_LIMIT_M,
      notEndedProperly: row.startAt !== null && row.endAt !== null && !row.endedProperly,
      odometerAboveGps:
        row.startOdometer !== null &&
        row.endOdometer !== null &&
        gpsKm !== null &&
        gpsKm > 0 &&
        (totalKm ?? 0) > gpsKm * ODOMETER_GPS_RATIO_LIMIT,
      noVisits: row.endAt !== null && totals.visits === 0,
    },
  };
}

async function summarise(rows: Row[]): Promise<WorkDaySummary[]> {
  const totals = await totalsFor(rows);
  return rows.map((row) => toSummary(row, totals.get(row.id)!));
}

async function summaryById(id: string): Promise<WorkDaySummary> {
  const row = await prisma.workDay.findUniqueOrThrow({ where: { id }, include });
  return (await summarise([row]))[0]!;
}

/** The open day, if any. There is at most one per salesman. */
async function findOpenDay(salesmanId: string) {
  return prisma.workDay.findFirst({
    where: { salesmanId, status: WorkDayStatus.OPEN, startAt: { not: null }, endAt: null },
    orderBy: { date: 'desc' },
    include,
  });
}

export async function current(salesmanId: string): Promise<CurrentWorkDay> {
  const now = new Date();
  const today = toIstDateString(now);
  const [open, todays] = await Promise.all([
    findOpenDay(salesmanId),
    prisma.workDay.findUnique({
      where: { salesmanId_date: { salesmanId, date: dateColumn(today) } },
      include,
    }),
  ]);

  const endedToday = todays && todays.endAt ? (await summarise([todays]))[0]! : null;
  return {
    day: open ? (await summarise([open]))[0]! : null,
    isStale: open ? open.date.toISOString().slice(0, 10) < today : false,
    endedToday,
    serverTime: now.toISOString(),
  };
}

/** The district towns used to label a GPS fix, cached per process. */
let townCache: {
  at: number;
  towns: { name: string; lat: number | null; lng: number | null }[];
} | null = null;
async function placeLabel(point: LatLng): Promise<string | null> {
  if (!townCache || Date.now() - townCache.at > 10 * 60 * 1000) {
    const towns = await prisma.town.findMany({
      where: { deletedAt: null },
      select: { name: true, lat: true, lng: true },
    });
    townCache = {
      at: Date.now(),
      towns: towns.map((t) => ({ name: t.name, lat: num(t.lat), lng: num(t.lng) })),
    };
  }
  return nearestPlaceLabel(point, townCache.towns);
}

export async function start(salesmanId: string, input: StartWorkDayInput): Promise<WorkDaySummary> {
  const now = new Date();
  const today = toIstDateString(now);

  const open = await findOpenDay(salesmanId);
  if (open) {
    if (open.date.toISOString().slice(0, 10) < today) {
      throw ApiException.conflict(
        `Your day from ${open.date.toISOString().slice(0, 10)} was never ended. End it before starting today.`,
      );
    }
    // A second tap (or a retried request) on Start Day returns the day already running.
    return summaryById(open.id);
  }

  const existing = await prisma.workDay.findUnique({
    where: { salesmanId_date: { salesmanId, date: dateColumn(today) } },
  });
  if (existing?.dayType === DayType.LEAVE || existing?.dayType === DayType.HOLIDAY) {
    throw ApiException.conflict(
      `Today is marked as ${existing.dayType.toLowerCase()}. Ask the admin to change it.`,
    );
  }
  if (existing?.endAt)
    throw ApiException.conflict('You have already ended today. Ask the admin to reopen it.');

  if (input.beatId) {
    const beat = await prisma.beat.findFirst({
      where: { id: input.beatId, salesmanId, isActive: true, deletedAt: null },
    });
    if (!beat) throw ApiException.badRequest('That beat is not assigned to you');
  }
  if (input.startOdometerPhotoPath)
    assertOwnPath(input.startOdometerPhotoPath, 'odometer', salesmanId);

  const point = { lat: input.location.lat, lng: input.location.lng };
  const data = {
    dayType: input.dayType,
    beatId: input.beatId ?? null,
    // SPEC 5.1: the server clock, never the phone's.
    startAt: now,
    startLat: new Prisma.Decimal(point.lat),
    startLng: new Prisma.Decimal(point.lng),
    startAccuracyM: input.location.accuracyM,
    startPlaceLabel: await placeLabel(point),
    startOdometer: input.startOdometer ?? null,
    startOdometerPhotoUrl: input.startOdometerPhotoPath ?? null,
    status: WorkDayStatus.OPEN,
  };

  const day = await prisma.workDay.upsert({
    where: { salesmanId_date: { salesmanId, date: dateColumn(today) } },
    create: { salesmanId, date: dateColumn(today), ...data },
    update: data,
  });

  await prisma.locationPing.create({
    data: {
      workDayId: day.id,
      salesmanId,
      lat: data.startLat,
      lng: data.startLng,
      accuracyM: input.location.accuracyM,
      source: PingSource.START,
      capturedAt: clampDeviceTime(input.location.capturedAt, now),
    },
  });

  await writeAuditLog({
    userId: salesmanId,
    action: 'CREATE',
    entity: 'WorkDay',
    entityId: day.id,
    after: data,
  });
  return summaryById(day.id);
}

async function ownDay(salesmanId: string, id: string) {
  const day = await prisma.workDay.findFirst({ where: { id, salesmanId } });
  if (!day) throw ApiException.notFound('Work day not found');
  return day;
}

/** Every position recorded for a day, in time order: pings plus visit check-ins. */
async function trackOf(dayId: string): Promise<{ at: Date; lat: number; lng: number }[]> {
  const [pings, visits] = await Promise.all([
    prisma.locationPing.findMany({
      where: { workDayId: dayId },
      select: { capturedAt: true, lat: true, lng: true },
    }),
    prisma.visit.findMany({
      where: { workDayId: dayId },
      select: { checkInAt: true, checkInLat: true, checkInLng: true },
    }),
  ]);
  return [
    ...pings.map((p) => ({ at: p.capturedAt, lat: p.lat.toNumber(), lng: p.lng.toNumber() })),
    ...visits.map((v) => ({
      at: v.checkInAt,
      lat: v.checkInLat.toNumber(),
      lng: v.checkInLng.toNumber(),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function end(
  salesmanId: string,
  id: string,
  input: EndWorkDayInput,
): Promise<WorkDaySummary> {
  const day = await ownDay(salesmanId, id);
  if (!isActive(day)) throw ApiException.conflict('This day has already been ended');

  const now = new Date();
  const isStale = day.date.toISOString().slice(0, 10) < toIstDateString(now);
  const track = await trackOf(day.id);

  let endAt: Date;
  let endPoint: LatLng | null;
  let endAccuracyM: number | null = null;

  if (isStale) {
    // Closed after the fact: the day ends where and when he was last seen.
    const last = track.at(-1);
    endAt = last && last.at > day.startAt! ? last.at : day.startAt!;
    endPoint = last ? { lat: last.lat, lng: last.lng } : null;
  } else {
    if (!input.location) throw ApiException.badRequest('Location is required to end the day');
    endAt = now;
    endPoint = { lat: input.location.lat, lng: input.location.lng };
    endAccuracyM = input.location.accuracyM;
    track.push({ at: now, ...endPoint });
  }

  if (
    input.endOdometer != null &&
    day.startOdometer != null &&
    input.endOdometer < day.startOdometer
  ) {
    throw ApiException.badRequest(`End odometer is below the start reading (${day.startOdometer})`);
  }
  if (input.endOdometerPhotoPath) assertOwnPath(input.endOdometerPhotoPath, 'odometer', salesmanId);

  const gpsKm = pathKm(track);
  const odometerKm =
    input.endOdometer != null && day.startOdometer != null
      ? input.endOdometer - day.startOdometer
      : null;

  const visitedTowns = await prisma.visit.findMany({
    where: { workDayId: day.id },
    select: { townId: true },
    distinct: ['townId'],
  });

  const data = {
    endAt,
    endLat: endPoint ? new Prisma.Decimal(endPoint.lat) : null,
    endLng: endPoint ? new Prisma.Decimal(endPoint.lng) : null,
    endAccuracyM,
    endPlaceLabel: endPoint ? await placeLabel(endPoint) : null,
    endOdometer: input.endOdometer ?? null,
    endOdometerPhotoUrl: input.endOdometerPhotoPath ?? null,
    gpsKm: new Prisma.Decimal(gpsKm),
    // SPEC 7: km from the odometer when both readings exist, otherwise GPS.
    totalKm: new Prisma.Decimal(odometerKm ?? gpsKm),
    endedProperly: !isStale,
    workingMinutes: Math.max(0, Math.round((endAt.getTime() - day.startAt!.getTime()) / 60_000)),
    remarks:
      input.remarks ??
      (isStale
        ? 'Not ended on the day. Closed later from the last recorded activity.'
        : day.remarks),
  };

  await prisma.$transaction([
    prisma.workDay.update({
      where: { id: day.id },
      data: { ...data, townsVisited: { set: visitedTowns.map((v) => ({ id: v.townId })) } },
    }),
    ...(isStale || !endPoint
      ? []
      : [
          prisma.locationPing.create({
            data: {
              workDayId: day.id,
              salesmanId,
              lat: data.endLat!,
              lng: data.endLng!,
              accuracyM: endAccuracyM,
              source: PingSource.END,
              capturedAt: clampDeviceTime(input.location!.capturedAt, now),
            },
          }),
        ]),
  ]);

  await writeAuditLog({
    userId: salesmanId,
    action: 'UPDATE',
    entity: 'WorkDay',
    entityId: day.id,
    after: data,
  });
  // SPEC 5.1.6: TA/DA drafted from the policy, ready for him to check and submit.
  await draftForDay(day.id, isStale ? null : input.travelMode);
  return summaryById(day.id);
}

/**
 * SPEC 5.1.6: submitting locks the day and sends its expense drafts for
 * approval with it. Only the admin can reopen it.
 */
export async function submit(salesmanId: string, id: string): Promise<WorkDaySummary> {
  const day = await ownDay(salesmanId, id);
  if (day.status !== WorkDayStatus.OPEN) {
    throw ApiException.conflict('This day has already been submitted');
  }
  if (!day.endAt) throw ApiException.conflict('End the day before submitting it');

  const claimed = await prisma.$transaction(async (tx) => {
    const moved = await tx.workDay.updateMany({
      where: { id: day.id, status: WorkDayStatus.OPEN },
      data: { status: WorkDayStatus.SUBMITTED, submittedAt: new Date() },
    });
    if (moved.count === 0) throw ApiException.conflict('This day has already been submitted');
    return submitDayClaims(tx, day.id);
  });

  await writeAuditLog({
    userId: salesmanId,
    action: 'UPDATE',
    entity: 'WorkDay',
    entityId: day.id,
    before: { status: day.status },
    after: { status: WorkDayStatus.SUBMITTED, claimed: claimed.toFixed(2) },
  });
  const salesman = await prisma.user.findUniqueOrThrow({
    where: { id: salesmanId },
    select: { name: true },
  });
  await notifyReviewers({
    title: 'Work day submitted',
    body: `${salesman.name} submitted ${formatDateDmy(day.date.toISOString())}, claiming ${formatInr(claimed.toFixed(2))}.`,
    link: '/admin/expenses',
  });
  return summaryById(day.id);
}

/** The admin queue (SPEC 4.6): submitted days, oldest first, with claims rolled up. */
export async function queue(): Promise<WorkDayQueueItem[]> {
  const rows = await prisma.workDay.findMany({
    where: { status: WorkDayStatus.SUBMITTED },
    include: { ...include, salesman: { select: { id: true, name: true } } },
    orderBy: [{ date: 'asc' }, { submittedAt: 'asc' }],
    take: 200,
  });
  const summaries = await summarise(rows);
  const claims = await prisma.expenseClaim.groupBy({
    by: ['workDayId', 'status'],
    where: { workDayId: { in: rows.map((r) => r.id) } },
    _sum: { amountClaimed: true },
    _count: { _all: true },
  });

  return rows.map((row, i) => {
    const summary = summaries[i]!;
    const mine = claims.filter((c) => c.workDayId === row.id);
    const claimed = mine
      .filter((c) => c.status !== 'DRAFT')
      .reduce((sum, c) => sum.add(c._sum.amountClaimed ?? 0), new Prisma.Decimal(0));
    return {
      id: row.id,
      date: summary.date,
      status: row.status,
      dayType: row.dayType,
      salesman: row.salesman,
      startAt: summary.startAt,
      endAt: summary.endAt,
      endedProperly: row.endedProperly,
      workingMinutes: row.workingMinutes,
      totalKm: summary.totalKm,
      gpsKm: summary.gpsKm,
      visits: summary.totals.visits,
      orderValue: summary.totals.orderValue,
      claimed: claimed.toFixed(2),
      pendingClaims: mine
        .filter((c) => c.status === 'SUBMITTED')
        .reduce((n, c) => n + c._count._all, 0),
      flags: Object.entries(summary.flags)
        .filter(([, on]) => on)
        .map(([flag]) => flag),
      submittedAt: summary.submittedAt,
    };
  });
}

/**
 * Approve or reject a submitted day, or reopen it so the salesman can fix it
 * (SPEC 5.1.6 "admin can reopen"). Reopening sends its unreviewed claims back
 * to draft; claims already decided stay decided.
 */
export async function review(
  id: string,
  input: ReviewWorkDayInput,
  actorId: string,
): Promise<WorkDaySummary> {
  const day = await prisma.workDay.findUnique({ where: { id } });
  if (!day) throw ApiException.notFound('Work day not found');
  if (day.status !== WorkDayStatus.SUBMITTED) {
    throw ApiException.conflict('Only a submitted day can be reviewed');
  }

  const next = {
    APPROVE: WorkDayStatus.APPROVED,
    REJECT: WorkDayStatus.REJECTED,
    REOPEN: WorkDayStatus.OPEN,
  }[input.decision];

  await prisma.$transaction(async (tx) => {
    const moved = await tx.workDay.updateMany({
      where: { id, status: WorkDayStatus.SUBMITTED },
      data: {
        status: next,
        reviewedById: input.decision === 'REOPEN' ? null : actorId,
        reviewedAt: input.decision === 'REOPEN' ? null : new Date(),
        submittedAt: input.decision === 'REOPEN' ? null : day.submittedAt,
        // Appended, so the salesman's own End Day note is kept.
        ...(input.remark
          ? {
              remarks: day.remarks
                ? `${day.remarks}
Admin: ${input.remark}`
                : `Admin: ${input.remark}`,
            }
          : {}),
      },
    });
    if (moved.count === 0)
      throw ApiException.conflict('Someone else just reviewed this day. Reload it.');
    if (input.decision === 'REOPEN') await reopenDayClaims(tx, id);
  });

  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'WorkDay',
    entityId: id,
    before: { status: day.status },
    after: { status: next, remark: input.remark },
  });
  const date = formatDateDmy(day.date.toISOString());
  const verb = { APPROVE: 'approved', REJECT: 'rejected', REOPEN: 'reopened' }[input.decision];
  await notify([day.salesmanId], {
    title: `Work day ${verb}`,
    body:
      `Your day of ${date} was ${verb}` +
      (input.decision === 'REOPEN' ? '. Make the changes and submit it again.' : '.') +
      (input.remark ? ` ${input.remark}` : ''),
    link: '/app',
  });
  return summaryById(id);
}

/** Salesmen see their own days; admins any salesman's (SPEC 6). */
export async function list(
  query: ListWorkDaysQuery,
  viewer: { userId: string; isAdmin: boolean },
): Promise<WorkDaySummary[]> {
  const salesmanId = viewer.isAdmin ? query.salesmanId : viewer.userId;
  const today = toIstDateString(new Date());
  const from = query.from ?? today;
  const to = query.to ?? today;
  if (from > to) throw ApiException.badRequest('`from` must not be after `to`');

  const rows = await prisma.workDay.findMany({
    where: {
      ...(salesmanId ? { salesmanId } : {}),
      date: { gte: dateColumn(from), lte: dateColumn(to) },
    },
    include,
    orderBy: [{ date: 'desc' }],
    take: 400,
  });
  return summarise(rows);
}

/**
 * The open day a field action belongs to. Visits, pings and leads queued
 * offline may arrive after End Day; they are accepted while the day is not yet
 * submitted, provided they happened before it ended.
 */
export async function requireWritableDay(salesmanId: string, workDayId: string, happenedAt: Date) {
  const day = await prisma.workDay.findFirst({ where: { id: workDayId, salesmanId } });
  if (!day || !day.startAt) throw ApiException.notFound('Work day not found');
  if (day.status !== WorkDayStatus.OPEN) {
    throw ApiException.conflict('This day has been submitted and is locked');
  }
  if (day.endAt && happenedAt > new Date(day.endAt.getTime() + 60_000)) {
    throw ApiException.conflict('This day has ended. Start a new day first.');
  }
  return day;
}

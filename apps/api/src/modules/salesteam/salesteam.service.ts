import { DayType, OrderStatus, Prisma, Role, VisitOutcome } from '@prisma/client';
import {
  ODOMETER_GPS_RATIO_FLAG,
  TRACK_GAP_FLAG_MS,
  VISIT_DISTANCE_FLAG_M,
  type BeatInput,
  type CalendarDay,
  type CalendarMonth,
  type DayDetail,
  type FieldFlag,
  type FlagsQuery,
  type RangeQuery,
  type RangeReport,
  type SalesmanProfile,
  type SalesmanToday,
  type TerritoryInput,
  type TimelineEvent,
  type TrackPoint,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { istDayEndUtc, istDayStartUtc, toIstDateString } from '../../lib/dates';
import { formatInr } from '../../lib/money';
import { list as listWorkDays, summaryById } from '../field/workdays.service';
import { monthBounds } from '../payroll/payroll.service';

const dateColumn = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
const OFF_DAYS: DayType[] = [DayType.LEAVE, DayType.HOLIDAY];

async function requireSalesman(id: string) {
  const user = await prisma.user.findFirst({ where: { id, role: Role.SALESMAN, deletedAt: null } });
  if (!user) throw ApiException.notFound('Salesman not found');
  return user;
}

// --- today ---------------------------------------------------------------------------

/** SPEC 4.5: where every salesman is today. */
export async function today(): Promise<SalesmanToday[]> {
  const date = toIstDateString(new Date());
  const window = { gte: istDayStartUtc(date), lt: istDayEndUtc(date) };
  const salesmen = await prisma.user.findMany({
    where: { role: Role.SALESMAN, isActive: true, deletedAt: null },
    select: { id: true, name: true, phone: true, hqTown: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  const ids = salesmen.map((s) => s.id);

  const [days, visits, orders] = await Promise.all([
    prisma.workDay.findMany({ where: { salesmanId: { in: ids }, date: dateColumn(date) } }),
    prisma.visit.groupBy({
      by: ['salesmanId'],
      where: { salesmanId: { in: ids }, checkInAt: window },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['takenBySalesmanId'],
      where: {
        takenBySalesmanId: { in: ids },
        orderDate: window,
        status: { not: OrderStatus.CANCELLED },
      },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);
  const lastPings = await Promise.all(
    days.map((d) =>
      prisma.locationPing.findFirst({
        where: { workDayId: d.id },
        orderBy: { capturedAt: 'desc' },
        select: { workDayId: true, capturedAt: true, lat: true, lng: true, source: true },
      }),
    ),
  );
  const now = Date.now();

  return salesmen.map((s) => {
    const day = days.find((d) => d.salesmanId === s.id) ?? null;
    const ping = day ? (lastPings.find((p) => p?.workDayId === day.id) ?? null) : null;
    const o = orders.find((x) => x.takenBySalesmanId === s.id);
    const status: SalesmanToday['status'] = !day
      ? 'NOT_STARTED'
      : OFF_DAYS.includes(day.dayType)
        ? 'ON_LEAVE'
        : day.endAt
          ? 'ENDED'
          : day.startAt
            ? 'IN_FIELD'
            : 'NOT_STARTED';
    return {
      salesman: { id: s.id, name: s.name, phone: s.phone, hqTown: s.hqTown?.name ?? null },
      status,
      workDayId: day?.id ?? null,
      dayType: day?.dayType ?? null,
      start:
        day?.startAt && day.startLat && day.startLng
          ? {
              at: day.startAt.toISOString(),
              lat: day.startLat.toNumber(),
              lng: day.startLng.toNumber(),
              place: day.startPlaceLabel,
            }
          : null,
      end: day?.endAt ? { at: day.endAt.toISOString(), place: day.endPlaceLabel } : null,
      lastPing: ping
        ? {
            at: ping.capturedAt.toISOString(),
            lat: ping.lat.toNumber(),
            lng: ping.lng.toNumber(),
            source: ping.source,
          }
        : null,
      visits: visits.find((v) => v.salesmanId === s.id)?._count._all ?? 0,
      orders: o?._count._all ?? 0,
      orderValue: (o?._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
      minutesSinceLastPing:
        status === 'IN_FIELD' && ping
          ? Math.round((now - ping.capturedAt.getTime()) / 60_000)
          : null,
    };
  });
}

// --- profile, territory, beats ---------------------------------------------------------------

export async function profile(id: string): Promise<SalesmanProfile> {
  const user = await prisma.user.findFirst({
    where: { id, role: Role.SALESMAN, deletedAt: null },
    include: {
      hqTown: { select: { id: true, name: true } },
      territories: {
        include: {
          district: { select: { id: true, name: true } },
          town: { select: { id: true, name: true, district: { select: { name: true } } } },
        },
      },
      beats: {
        where: { deletedAt: null },
        include: {
          stops: {
            orderBy: { sequence: 'asc' },
            include: {
              retailer: { select: { id: true, shopName: true, town: { select: { name: true } } } },
            },
          },
        },
        orderBy: [{ isActive: 'desc' }, { dayOfWeek: 'asc' }, { name: 'asc' }],
      },
    },
  });
  if (!user) throw ApiException.notFound('Salesman not found');
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    isActive: user.isActive,
    joiningDate: user.joiningDate ? isoDate(user.joiningDate) : null,
    hqTown: user.hqTown,
    territory: {
      districts: user.territories
        .flatMap((t) => (t.district ? [t.district] : []))
        .sort((a, b) => a.name.localeCompare(b.name)),
      towns: user.territories
        .flatMap((t) =>
          t.town ? [{ id: t.town.id, name: t.town.name, districtName: t.town.district.name }] : [],
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    beats: user.beats.map((b) => ({
      id: b.id,
      name: b.name,
      dayOfWeek: b.dayOfWeek,
      isActive: b.isActive,
      stops: b.stops.map((s) => ({
        sequence: s.sequence,
        retailer: s.retailer
          ? { id: s.retailer.id, shopName: s.retailer.shopName, townName: s.retailer.town.name }
          : null,
      })),
    })),
  };
}

/** SPEC 4.5 "Assign territory": replaces the salesman's districts and extra towns. */
export async function saveTerritory(
  id: string,
  input: TerritoryInput,
  actorId: string,
): Promise<SalesmanProfile> {
  await requireSalesman(id);
  const districtIds = [...new Set(input.districtIds)];
  const townIds = [...new Set(input.townIds)];
  const [d, t] = await Promise.all([
    prisma.district.count({ where: { id: { in: districtIds }, deletedAt: null } }),
    prisma.town.count({ where: { id: { in: townIds }, deletedAt: null } }),
  ]);
  if (d !== districtIds.length || t !== townIds.length)
    throw ApiException.badRequest('District or town not found');

  const before = await prisma.salesmanTerritory.findMany({ where: { salesmanId: id } });
  await prisma.$transaction([
    prisma.salesmanTerritory.deleteMany({ where: { salesmanId: id } }),
    prisma.salesmanTerritory.createMany({
      data: [
        ...districtIds.map((districtId) => ({ salesmanId: id, districtId })),
        ...townIds.map((townId) => ({ salesmanId: id, townId })),
      ],
    }),
  ]);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'SalesmanTerritory',
    entityId: id,
    before: before.map((b) => b.districtId ?? b.townId),
    after: { districtIds, townIds },
  });
  return profile(id);
}

async function assertBeatShops(salesmanId: string, retailerIds: string[]) {
  if (new Set(retailerIds).size !== retailerIds.length)
    throw ApiException.badRequest('A shop appears twice in the beat');
  const shops = await prisma.retailer.findMany({
    where: { id: { in: retailerIds }, deletedAt: null },
    select: { id: true, townId: true },
  });
  if (shops.length !== retailerIds.length) throw ApiException.badRequest('Shop not found');
  const territory = await prisma.salesmanTerritory.findMany({ where: { salesmanId } });
  const districtIds = territory.flatMap((t) => (t.districtId ? [t.districtId] : []));
  const towns = await prisma.town.findMany({
    where: {
      OR: [
        { districtId: { in: districtIds } },
        { id: { in: territory.flatMap((t) => (t.townId ? [t.townId] : [])) } },
      ],
    },
    select: { id: true },
  });
  const allowed = new Set(towns.map((t) => t.id));
  if (shops.some((s) => !allowed.has(s.townId))) {
    throw ApiException.badRequest("Every shop in a beat must be in the salesman's territory");
  }
  return shops;
}

export async function createBeat(
  salesmanId: string,
  input: BeatInput,
  actorId: string,
): Promise<SalesmanProfile> {
  await requireSalesman(salesmanId);
  const shops = await assertBeatShops(salesmanId, input.retailerIds);
  const townOf = new Map(shops.map((s) => [s.id, s.townId]));
  const beat = await prisma.beat.create({
    data: {
      name: input.name,
      salesmanId,
      dayOfWeek: input.dayOfWeek ?? null,
      stops: {
        create: input.retailerIds.map((retailerId, i) => ({
          retailerId,
          townId: townOf.get(retailerId)!,
          sequence: i + 1,
        })),
      },
    },
  });
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'Beat',
    entityId: beat.id,
    after: input,
  });
  return profile(salesmanId);
}

export async function updateBeat(
  beatId: string,
  input: BeatInput,
  actorId: string,
): Promise<SalesmanProfile> {
  const beat = await prisma.beat.findFirst({ where: { id: beatId, deletedAt: null } });
  if (!beat) throw ApiException.notFound('Beat not found');
  const shops = await assertBeatShops(beat.salesmanId, input.retailerIds);
  const townOf = new Map(shops.map((s) => [s.id, s.townId]));
  await prisma.$transaction([
    prisma.beatStop.deleteMany({ where: { beatId } }),
    prisma.beat.update({
      where: { id: beatId },
      data: {
        name: input.name,
        dayOfWeek: input.dayOfWeek ?? null,
        isActive: true,
        stops: {
          create: input.retailerIds.map((retailerId, i) => ({
            retailerId,
            townId: townOf.get(retailerId)!,
            sequence: i + 1,
          })),
        },
      },
    }),
  ]);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Beat',
    entityId: beatId,
    after: input,
  });
  return profile(beat.salesmanId);
}

/** Beats are referenced by past work days, so they are retired, never deleted. */
export async function retireBeat(beatId: string, actorId: string): Promise<SalesmanProfile> {
  const beat = await prisma.beat.findFirst({ where: { id: beatId, deletedAt: null } });
  if (!beat) throw ApiException.notFound('Beat not found');
  await prisma.beat.update({ where: { id: beatId }, data: { isActive: false } });
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Beat',
    entityId: beatId,
    after: { isActive: false },
  });
  return profile(beat.salesmanId);
}

// --- calendar ------------------------------------------------------------------------------

/** SPEC 4.5: each day coloured worked / leave / holiday / absent / not ended properly. */
export async function calendar(id: string, month: string): Promise<CalendarMonth> {
  const user = await requireSalesman(id);
  const { first, last } = monthBounds(month);
  const today = toIstDateString(new Date());
  const summaries = await listWorkDays(
    { from: first, to: last, salesmanId: id },
    { userId: id, isAdmin: true },
  );
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  const joining = user.joiningDate ? isoDate(user.joiningDate) : null;

  const days: CalendarDay[] = [];
  for (let d = Number(first.slice(8)); d <= Number(last.slice(8)); d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const s = byDate.get(date);
    let kind: CalendarDay['kind'];
    if (s) {
      if (s.dayType === DayType.LEAVE) kind = 'LEAVE';
      else if (s.dayType === DayType.HOLIDAY) kind = 'HOLIDAY';
      else if (!s.startAt) kind = 'ABSENT';
      else if (!s.endAt) kind = date < today ? 'NOT_ENDED' : 'OPEN';
      else kind = s.endedProperly ? 'WORKED' : 'NOT_ENDED';
    } else if (date > today || (date === today && !s)) kind = 'FUTURE';
    else if (joining && date < joining) kind = 'BEFORE_JOINING';
    else kind = 'ABSENT';

    days.push({
      date,
      kind,
      workDayId: s?.id ?? null,
      status: s?.status ?? null,
      startAt: s?.startAt ?? null,
      endAt: s?.endAt ?? null,
      workingMinutes: s?.workingMinutes ?? null,
      visits: s?.totals.visits ?? 0,
      flagged: s ? Object.values(s.flags).some(Boolean) : false,
    });
  }
  const count = (k: CalendarDay['kind']) => days.filter((x) => x.kind === k).length;
  return {
    month,
    days,
    summary: {
      worked: count('WORKED') + count('NOT_ENDED') + count('OPEN'),
      leave: count('LEAVE'),
      holiday: count('HOLIDAY'),
      absent: count('ABSENT'),
      notEnded: count('NOT_ENDED'),
    },
  };
}

// --- day detail / replay ----------------------------------------------------------------------

const OUTCOME_TEXT: Record<VisitOutcome, string> = {
  ORDER_TAKEN: 'order taken',
  NO_ORDER: 'no order',
  SHOP_CLOSED: 'shop closed',
  FOLLOW_UP: 'follow-up',
  NEW_SHOP_ADDED: 'new shop added',
};

const time = (d: Date) =>
  d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

/** Gaps longer than the limit between consecutive positions inside the working day. */
export function findGaps(
  points: { at: Date }[],
  start: Date | null,
  end: Date | null,
  limitMs = TRACK_GAP_FLAG_MS,
) {
  const inDay = points.filter((p) => (!start || p.at >= start) && (!end || p.at <= end));
  const gaps: { from: Date; to: Date }[] = [];
  for (let i = 1; i < inDay.length; i++) {
    if (inDay[i]!.at.getTime() - inDay[i - 1]!.at.getTime() > limitMs)
      gaps.push({ from: inDay[i - 1]!.at, to: inDay[i]!.at });
  }
  return gaps;
}

/** SPEC 4.5 day detail: the route in time order, the timeline beside it, and the day's totals. */
export async function dayDetail(workDayId: string): Promise<DayDetail> {
  const day = await prisma.workDay.findUnique({
    where: { id: workDayId },
    include: { salesman: { select: { id: true, name: true } } },
  });
  if (!day) throw ApiException.notFound('Work day not found');
  const summary = await summaryById(day.id);
  const windowEnd = day.endAt ?? new Date();

  const [pings, visits, leads, claims] = await Promise.all([
    prisma.locationPing.findMany({ where: { workDayId }, orderBy: { capturedAt: 'asc' } }),
    prisma.visit.findMany({
      where: { workDayId },
      orderBy: { checkInAt: 'asc' },
      include: {
        retailer: { select: { shopName: true } },
        town: { select: { name: true } },
        order: { select: { orderNumber: true, totalAmount: true, status: true } },
        _count: { select: { photos: true } },
      },
    }),
    day.startAt
      ? prisma.lead.findMany({
          where: {
            assignedToId: day.salesmanId,
            createdAt: { gte: day.startAt, lte: windowEnd },
            deletedAt: null,
          },
          include: { town: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    prisma.expenseClaim.groupBy({
      by: ['category'],
      where: { workDayId, status: { not: 'REJECTED' } },
      _sum: { amountClaimed: true },
    }),
  ]);

  // Visits carry their own VISIT/ORDER pings; the map uses the visit itself for those.
  const track: TrackPoint[] = [
    ...pings
      .filter((p) => p.source !== 'VISIT' && p.source !== 'ORDER')
      .map((p) => ({
        at: p.capturedAt.toISOString(),
        lat: p.lat.toNumber(),
        lng: p.lng.toNumber(),
        source: p.source,
        label: null,
      })),
    ...visits.map((v) => ({
      at: v.checkInAt.toISOString(),
      lat: v.checkInLat.toNumber(),
      lng: v.checkInLng.toNumber(),
      source: 'VISIT' as const,
      label: null,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  // Start and End always have a position on the day itself; use it when the
  // matching ping is missing (older data, or a day closed after the fact).
  if (day.startAt && day.startLat && day.startLng && !track.some((p) => p.source === 'START')) {
    track.push({
      at: day.startAt.toISOString(),
      lat: day.startLat.toNumber(),
      lng: day.startLng.toNumber(),
      source: 'START',
      label: null,
    });
  }
  if (day.endAt && day.endLat && day.endLng && !track.some((p) => p.source === 'END')) {
    track.push({
      at: day.endAt.toISOString(),
      lat: day.endLat.toNumber(),
      lng: day.endLng.toNumber(),
      source: 'END',
      label: null,
    });
  }
  track.sort((a, b) => a.at.localeCompare(b.at));
  let n = 0;
  for (const p of track)
    if (p.source === 'START' || p.source === 'VISIT' || p.source === 'END') p.label = ++n;
  const pointAt = (iso: string, source?: string) =>
    track.findIndex((p) => p.at === iso && (!source || p.source === source));

  const timeline: TimelineEvent[] = [];
  if (day.startAt) {
    timeline.push({
      at: day.startAt.toISOString(),
      kind: 'START',
      point: track.findIndex((p) => p.source === 'START'),
      title: `Started${day.startPlaceLabel ? ` at ${day.startPlaceLabel}` : ''}`,
      detail: [
        { HQ: 'HQ', EX_HQ: 'Ex-HQ', OUTSTATION: 'Outstation', LEAVE: 'Leave', HOLIDAY: 'Holiday' }[
          day.dayType
        ],
        day.startOdometer ? `odometer ${day.startOdometer}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      flags: summary.flags.poorStartAccuracy ? [`weak GPS ±${day.startAccuracyM} m`] : [],
    });
  }
  for (const v of visits) {
    const shop = v.retailer?.shopName ?? v.newShopName ?? 'Unknown shop';
    const order = v.order && v.order.status !== OrderStatus.CANCELLED ? v.order : null;
    timeline.push({
      at: v.checkInAt.toISOString(),
      kind: 'VISIT',
      point: pointAt(v.checkInAt.toISOString(), 'VISIT'),
      title: `Visit at ${shop}, ${v.town.name}`,
      detail: [
        OUTCOME_TEXT[v.outcome],
        order ? `order ${formatInr(order.totalAmount.toFixed(2))}` : null,
        v.noOrderReason,
        v._count.photos ? `${v._count.photos} photo${v._count.photos === 1 ? '' : 's'}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      flags:
        (v.distanceFromShopMeters ?? 0) > VISIT_DISTANCE_FLAG_M
          ? [`checked in ${v.distanceFromShopMeters} m from the shop`]
          : [],
      visit: {
        id: v.id,
        outcome: v.outcome,
        shop,
        town: v.town.name,
        orderNumber: order?.orderNumber ?? null,
        orderValue: order?.totalAmount.toFixed(2) ?? null,
        photos: v._count.photos,
        distanceFromShopMeters: v.distanceFromShopMeters,
      },
    });
  }
  for (const l of leads) {
    timeline.push({
      at: l.createdAt.toISOString(),
      kind: 'LEAD',
      point: null,
      title: `Added lead ${l.firmName ?? l.name}`,
      detail: `${l.type.toLowerCase()} · ${l.town.name}`,
      flags: [],
    });
  }
  const positions = track.map((p) => ({ at: new Date(p.at) }));
  for (const g of findGaps(positions, day.startAt, day.endAt)) {
    const hours = (g.to.getTime() - g.from.getTime()) / 3_600_000;
    timeline.push({
      at: g.from.toISOString(),
      kind: 'GAP',
      point: null,
      title: `No location for ${hours.toFixed(1)} hours`,
      detail: `${time(g.from)} to ${time(g.to)}. The app was closed or the phone had no signal.`,
      flags: ['gap over 2 hours'],
    });
  }
  if (day.endAt) {
    timeline.push({
      at: day.endAt.toISOString(),
      kind: 'END',
      point: track.findIndex((p) => p.source === 'END'),
      title: `Ended${day.endPlaceLabel ? ` at ${day.endPlaceLabel}` : ''}`,
      detail: day.endOdometer ? `odometer ${day.endOdometer}` : null,
      flags: day.endedProperly ? [] : ['not ended properly'],
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const claimed = (c: string) =>
    claims.find((x) => x.category === c)?._sum.amountClaimed ?? new Prisma.Decimal(0);
  const other = claims
    .filter((x) => x.category !== 'TA' && x.category !== 'DA')
    .reduce((s, x) => s.add(x._sum.amountClaimed ?? 0), new Prisma.Decimal(0));
  const odometerKm =
    day.startOdometer != null && day.endOdometer != null
      ? (day.endOdometer - day.startOdometer).toFixed(2)
      : null;

  const flags = [
    summary.flags.notEndedProperly ? 'Not ended properly' : null,
    !day.endAt && day.startAt && isoDate(day.date) < toIstDateString(new Date())
      ? 'Never ended: the day is still open'
      : null,
    summary.flags.noVisits ? 'No visits' : null,
    summary.flags.odometerAboveGps ? 'Odometer km far above GPS km' : null,
    summary.flags.poorStartAccuracy ? 'Weak GPS at start' : null,
    summary.flags.poorEndAccuracy ? 'Weak GPS at end' : null,
    timeline.some((e) => e.kind === 'GAP') ? 'Location gap over 2 hours' : null,
    visits.some((v) => (v.distanceFromShopMeters ?? 0) > VISIT_DISTANCE_FLAG_M)
      ? 'Check-in far from a shop'
      : null,
  ].filter((f): f is string => Boolean(f));

  return {
    day: {
      id: day.id,
      date: isoDate(day.date),
      dayType: day.dayType,
      status: day.status,
      endedProperly: day.endedProperly,
      startAt: day.startAt?.toISOString() ?? null,
      endAt: day.endAt?.toISOString() ?? null,
      workingMinutes: day.workingMinutes,
      startPlace: day.startPlaceLabel,
      endPlace: day.endPlaceLabel,
      remarks: day.remarks,
    },
    salesman: day.salesman,
    track,
    timeline,
    totals: {
      odometerKm,
      gpsKm: day.gpsKm?.toFixed(2) ?? null,
      visits: summary.totals.visits,
      orders: summary.totals.orders,
      orderValue: summary.totals.orderValue,
      newShops: summary.totals.newShops,
      leads: leads.length,
      taClaimed: claimed('TA').toFixed(2),
      daClaimed: claimed('DA').toFixed(2),
      otherClaimed: other.toFixed(2),
    },
    flags,
  };
}

// --- range ------------------------------------------------------------------------------------

/** SPEC 4.5 range view: towns, shops, orders and expenses for any period. */
export async function range(id: string, q: RangeQuery): Promise<RangeReport> {
  const user = await requireSalesman(id);
  const window = { gte: istDayStartUtc(q.from), lt: istDayEndUtc(q.to) };
  const dates = { gte: dateColumn(q.from), lte: dateColumn(q.to) };

  const [days, visits, orders, expenses] = await Promise.all([
    prisma.workDay.findMany({
      where: { salesmanId: id, date: dates },
      select: {
        date: true,
        dayType: true,
        startAt: true,
        endedProperly: true,
        endAt: true,
        totalKm: true,
      },
    }),
    prisma.visit.findMany({
      where: { salesmanId: id, checkInAt: window },
      include: {
        town: { select: { id: true, name: true, district: { select: { name: true } } } },
        retailer: { select: { id: true, shopName: true } },
        order: { select: { totalAmount: true, status: true } },
      },
      orderBy: { checkInAt: 'asc' },
    }),
    prisma.order.findMany({
      where: { takenBySalesmanId: id, orderDate: window },
      include: { retailer: { select: { shopName: true } } },
      orderBy: { orderDate: 'asc' },
    }),
    prisma.expenseClaim.findMany({
      where: { salesmanId: id, date: dates, status: { not: 'DRAFT' } },
      orderBy: { date: 'asc' },
    }),
  ]);

  const towns = new Map<string, RangeReport['towns'][number] & { dates: Set<string> }>();
  const shops = new Map<string, RangeReport['shops'][number] & { value: Prisma.Decimal }>();
  for (const v of visits) {
    const t = towns.get(v.town.id) ?? {
      id: v.town.id,
      name: v.town.name,
      district: v.town.district.name,
      visits: 0,
      days: 0,
      dates: new Set(),
    };
    t.visits += 1;
    t.dates.add(toIstDateString(v.checkInAt));
    towns.set(v.town.id, t);
    const key = v.retailer?.id ?? `new:${v.id}`;
    const s = shops.get(key) ?? {
      id: key,
      name: v.retailer?.shopName ?? v.newShopName ?? 'Unknown',
      town: v.town.name,
      visits: 0,
      orders: 0,
      orderValue: '0',
      lastVisit: '',
      value: new Prisma.Decimal(0),
    };
    s.visits += 1;
    if (v.order && v.order.status !== OrderStatus.CANCELLED) {
      s.orders += 1;
      s.value = s.value.add(v.order.totalAmount);
    }
    s.lastVisit = v.checkInAt.toISOString();
    shops.set(key, s);
  }
  const live = orders.filter((o) => o.status !== OrderStatus.CANCELLED);
  const sum = (xs: (Prisma.Decimal | null)[]) =>
    xs.reduce<Prisma.Decimal>((s, x) => s.add(x ?? 0), new Prisma.Decimal(0)).toFixed(2);

  return {
    from: q.from,
    to: q.to,
    salesman: { id: user.id, name: user.name },
    days: {
      worked: days.filter((d) => d.startAt && !OFF_DAYS.includes(d.dayType)).length,
      leave: days.filter((d) => d.dayType === DayType.LEAVE).length,
      // Closed after the fact, or still open from an earlier date.
      notEnded: days.filter(
        (d) =>
          d.startAt &&
          ((d.endAt && !d.endedProperly) ||
            (!d.endAt && isoDate(d.date) < toIstDateString(new Date()))),
      ).length,
      km: sum(days.map((d) => d.totalKm)),
    },
    towns: [...towns.values()]
      .map(({ dates: ds, ...t }) => ({ ...t, days: ds.size }))
      .sort((a, b) => b.visits - a.visits),
    shops: [...shops.values()]
      .map(({ value, ...s }) => ({ ...s, orderValue: value.toFixed(2) }))
      .sort((a, b) => b.visits - a.visits),
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      date: o.orderDate.toISOString(),
      shop: o.retailer?.shopName ?? '-',
      status: o.status,
      amount: o.totalAmount.toFixed(2),
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      date: isoDate(e.date),
      category: e.category,
      status: e.status,
      claimed: e.amountClaimed.toFixed(2),
      approved: e.amountApproved?.toFixed(2) ?? null,
      description: e.description,
    })),
    totals: {
      visits: visits.length,
      orders: live.length,
      orderValue: sum(live.map((o) => o.totalAmount)),
      claimed: sum(expenses.map((e) => e.amountClaimed)),
      approved: sum(
        expenses
          .filter((e) => e.status === 'APPROVED' || e.status === 'PARTIALLY_APPROVED')
          .map((e) => e.amountApproved),
      ),
    },
  };
}

// --- flags -----------------------------------------------------------------------------------------

/** SPEC 4.5 flag list across salesmen and days. */
export async function flags(q: FlagsQuery): Promise<FieldFlag[]> {
  const today = toIstDateString(new Date());
  const window = { gte: istDayStartUtc(q.from), lt: istDayEndUtc(q.to) };
  const salesmanFilter = q.salesmanId ? { salesmanId: q.salesmanId } : {};

  const [far, days] = await Promise.all([
    prisma.visit.findMany({
      where: {
        ...salesmanFilter,
        checkInAt: window,
        distanceFromShopMeters: { gt: VISIT_DISTANCE_FLAG_M },
      },
      include: {
        salesman: { select: { id: true, name: true } },
        retailer: { select: { shopName: true } },
        workDay: { select: { date: true } },
      },
    }),
    prisma.workDay.findMany({
      where: {
        ...salesmanFilter,
        date: { gte: dateColumn(q.from), lte: dateColumn(q.to) },
        startAt: { not: null },
        dayType: { notIn: OFF_DAYS },
      },
      include: {
        salesman: { select: { id: true, name: true } },
        _count: { select: { visits: true } },
      },
    }),
  ]);

  const gapRows = days.length
    ? await prisma.$queryRaw<{ workDayId: string; gapMs: number }[]>`
        SELECT "workDayId", MAX(EXTRACT(EPOCH FROM gap) * 1000)::float AS "gapMs" FROM (
          SELECT p."workDayId", p."capturedAt" - LAG(p."capturedAt") OVER (PARTITION BY p."workDayId" ORDER BY p."capturedAt") AS gap
          FROM "LocationPing" p
          JOIN "WorkDay" w ON w."id" = p."workDayId"
          WHERE p."workDayId" = ANY(${days.map((d) => d.id)})
            AND p."capturedAt" >= w."startAt" AND (w."endAt" IS NULL OR p."capturedAt" <= w."endAt")
        ) x WHERE gap > make_interval(secs => ${TRACK_GAP_FLAG_MS / 1000}) GROUP BY 1`
    : [];

  const out: FieldFlag[] = [];
  for (const v of far) {
    out.push({
      kind: 'FAR_CHECK_IN',
      date: isoDate(v.workDay.date),
      salesman: v.salesman,
      workDayId: v.workDayId,
      detail: `Checked in ${v.distanceFromShopMeters} m from ${v.retailer?.shopName ?? v.newShopName ?? 'the shop'}`,
    });
  }
  for (const d of days) {
    const date = isoDate(d.date);
    const base = { date, salesman: d.salesman, workDayId: d.id };
    if (d.endAt && d._count.visits === 0)
      out.push({ ...base, kind: 'NO_VISITS', detail: 'Day worked with no shop visits' });
    if ((d.endAt && !d.endedProperly) || (!d.endAt && date < today)) {
      out.push({ ...base, kind: 'NOT_ENDED', detail: 'End Day was never pressed' });
    }
    const gps = num(d.gpsKm);
    if (d.startOdometer != null && d.endOdometer != null && gps && gps > 0) {
      const odo = d.endOdometer - d.startOdometer;
      if (odo > gps * ODOMETER_GPS_RATIO_FLAG) {
        out.push({
          ...base,
          kind: 'ODOMETER_ABOVE_GPS',
          detail: `Odometer ${odo} km vs GPS ${gps.toFixed(1)} km`,
        });
      }
    }
    const gap = gapRows.find((g) => g.workDayId === d.id);
    if (gap)
      out.push({
        ...base,
        kind: 'TRACK_GAP',
        detail: `No location for ${(gap.gapMs / 3_600_000).toFixed(1)} hours`,
      });
  }
  return out.sort(
    (a, b) => b.date.localeCompare(a.date) || a.salesman.name.localeCompare(b.salesman.name),
  );
}

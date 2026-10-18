import { Prisma } from '@prisma/client';
import type {
  CreateTownInput,
  DistrictListItem,
  DistrictMapItem,
  DistrictSummary,
  DistrictsMapResponse,
  ListDistrictsQuery,
  ListTownsQuery,
  MapMarkersResponse,
  Paginated,
  TownListItem,
  UpdateDistrictInput,
  UpdateTownInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException, paginate } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { istMonthRange, istRangeToUtc, toIstDateString } from '../../lib/dates';
import { recomputeDistrictCoverage } from './coverage.service';

const OPEN_LEAD_STAGES = ['NEW', 'CONTACTED', 'MEETING_DONE', 'NEGOTIATION'] as const;

const num = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());
const money = (value: Prisma.Decimal | null | undefined) => (value ?? new Prisma.Decimal(0)).toFixed(2);

/** Rolls `{ townId -> n }` tallies up to `{ districtId -> n }`. */
function rollUpByDistrict(
  townToDistrict: Map<string, string>,
  rows: { townId: string; count: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { townId, count } of rows) {
    const districtId = townToDistrict.get(townId);
    if (!districtId) continue;
    out.set(districtId, (out.get(districtId) ?? 0) + count);
  }
  return out;
}

const get = (map: Map<string, number>, key: string) => map.get(key) ?? 0;

/**
 * The whole map dashboard in one round trip (SPEC 8). Counts are gathered with
 * grouped queries and rolled up in memory rather than looping per district,
 * which keeps this flat as the partner tables grow.
 */
export async function getDistrictsMap(queryInput: ListDistrictsQuery): Promise<DistrictsMapResponse> {
  const fallback = istMonthRange();
  const from = queryInput.from ?? fallback.from;
  const to = queryInput.to ?? fallback.to;
  if (from > to) throw ApiException.badRequest('`from` must not be after `to`');
  const orderWindow = istRangeToUtc(from, to);

  const districts = await prisma.district.findMany({
    where: {
      deletedAt: null,
      ...(queryInput.zone ? { zone: queryInput.zone } : {}),
      ...(queryInput.coverageStatus ? { coverageStatus: queryInput.coverageStatus } : {}),
    },
    orderBy: { name: 'asc' },
  });

  const towns = await prisma.town.findMany({
    where: { deletedAt: null },
    select: { id: true, districtId: true },
  });
  const townToDistrict = new Map(towns.map((t) => [t.id, t.districtId]));

  const [
    townCounts,
    ssByTown,
    ssCoveredDistricts,
    distributorsByTown,
    retailersByTown,
    leadsByDistrict,
    distributorTownCoverage,
    orderRows,
    activeDistributorsTotal,
    activeRetailersTotal,
    openLeadsTotal,
    salesmenInField,
  ] = await Promise.all([
    prisma.town.groupBy({ by: ['districtId'], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.superStockist.groupBy({
      by: ['townId'],
      where: { deletedAt: null, status: 'ACTIVE' },
      _count: { _all: true },
    }),
    // An SS also covers districts it is not based in.
    prisma.district.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        _count: { select: { superStockists: { where: { deletedAt: null, status: 'ACTIVE' } } } },
      },
    }),
    prisma.distributor.groupBy({
      by: ['townId'],
      where: { deletedAt: null, status: 'ACTIVE' },
      _count: { _all: true },
    }),
    prisma.retailer.groupBy({
      by: ['townId'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['districtId'],
      where: { deletedAt: null, stage: { in: [...OPEN_LEAD_STAGES] } },
      _count: { _all: true },
    }),
    // Towns explicitly listed in an active distributor's coverage.
    prisma.town.findMany({
      where: { deletedAt: null, distributorsCovering: { some: { deletedAt: null, status: 'ACTIVE' } } },
      select: { id: true },
    }),
    prisma.order.findMany({
      where: { status: { not: 'CANCELLED' }, orderDate: orderWindow },
      select: {
        totalAmount: true,
        superStockist: { select: { townId: true } },
        distributor: { select: { townId: true } },
        retailer: { select: { townId: true } },
      },
    }),
    prisma.distributor.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.retailer.count({ where: { deletedAt: null } }),
    prisma.lead.count({ where: { deletedAt: null, stage: { in: [...OPEN_LEAD_STAGES] } } }),
    prisma.workDay.findMany({
      where: { date: istRangeToUtc(toIstDateString(new Date()), toIstDateString(new Date())) },
      select: { salesmanId: true },
      distinct: ['salesmanId'],
    }),
  ]);

  const townTally = new Map(townCounts.map((r) => [r.districtId, r._count._all]));
  const ssTally = rollUpByDistrict(
    townToDistrict,
    ssByTown.map((r) => ({ townId: r.townId, count: r._count._all })),
  );
  // A district is served if an SS sits in it or explicitly covers it.
  const ssCoverTally = new Map(ssCoveredDistricts.map((d) => [d.id, d._count.superStockists]));
  const distributorTally = rollUpByDistrict(
    townToDistrict,
    distributorsByTown.map((r) => ({ townId: r.townId, count: r._count._all })),
  );
  const retailerTally = rollUpByDistrict(
    townToDistrict,
    retailersByTown.map((r) => ({ townId: r.townId, count: r._count._all })),
  );
  const leadTally = new Map(leadsByDistrict.map((r) => [r.districtId, r._count._all]));

  // Towns with their own distributor, plus towns someone covers from elsewhere.
  const coveredTownIds = new Set<string>([
    ...distributorsByTown.map((r) => r.townId),
    ...distributorTownCoverage.map((t) => t.id),
  ]);
  const coveredTownTally = new Map<string, number>();
  for (const townId of coveredTownIds) {
    const districtId = townToDistrict.get(townId);
    if (districtId) coveredTownTally.set(districtId, get(coveredTownTally, districtId) + 1);
  }

  const orderCountTally = new Map<string, number>();
  const orderValueTally = new Map<string, Prisma.Decimal>();
  for (const order of orderRows) {
    // Attribute each order to the district of whoever received it.
    const townId =
      order.retailer?.townId ?? order.distributor?.townId ?? order.superStockist?.townId ?? null;
    const districtId = townId ? townToDistrict.get(townId) : undefined;
    if (!districtId) continue;
    orderCountTally.set(districtId, get(orderCountTally, districtId) + 1);
    orderValueTally.set(
      districtId,
      (orderValueTally.get(districtId) ?? new Prisma.Decimal(0)).plus(order.totalAmount),
    );
  }

  const items: DistrictMapItem[] = districts.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    nameGu: d.nameGu,
    zone: d.zone,
    lat: d.lat.toNumber(),
    lng: d.lng.toNumber(),
    coverageStatus: d.coverageStatus,
    counts: {
      superStockists: Math.max(get(ssTally, d.id), get(ssCoverTally, d.id)),
      distributors: get(distributorTally, d.id),
      retailers: get(retailerTally, d.id),
      openLeads: get(leadTally, d.id),
      towns: get(townTally, d.id),
      townsCovered: get(coveredTownTally, d.id),
      ordersThisPeriod: get(orderCountTally, d.id),
      orderValueThisPeriod: money(orderValueTally.get(d.id)),
    },
  }));

  const totalOrderValue = orderRows.reduce(
    (sum, o) => sum.plus(o.totalAmount),
    new Prisma.Decimal(0),
  );

  return {
    districts: items,
    kpis: {
      districtsCovered: items.filter((d) => d.coverageStatus === 'COVERED').length,
      districtsTotal: items.length,
      activeDistributors: activeDistributorsTotal,
      activeRetailers: activeRetailersTotal,
      openLeads: openLeadsTotal,
      ordersThisPeriod: orderRows.length,
      orderValueThisPeriod: totalOrderValue.toFixed(2),
      salesmenInFieldToday: salesmenInField.length,
    },
  };
}

/** Everything the district side panel shows (SPEC 4.1). */
export async function getDistrictSummary(id: string): Promise<DistrictSummary> {
  const district = await prisma.district.findFirst({ where: { id, deletedAt: null } });
  if (!district) throw ApiException.notFound('District not found');

  const { from, to } = istMonthRange();
  const orderWindow = istRangeToUtc(from, to);

  const [towns, superStockists, distributors, openLeads, territories] = await Promise.all([
    prisma.town.findMany({
      where: { deletedAt: null, districtId: id },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            distributors: { where: { deletedAt: null, status: 'ACTIVE' } },
            distributorsCovering: { where: { deletedAt: null, status: 'ACTIVE' } },
            retailers: { where: { deletedAt: null } },
            leads: { where: { deletedAt: null, stage: { in: [...OPEN_LEAD_STAGES] } } },
          },
        },
      },
    }),
    prisma.superStockist.findMany({
      where: {
        deletedAt: null,
        OR: [{ town: { districtId: id } }, { coveredDistricts: { some: { id } } }],
      },
      orderBy: { firmName: 'asc' },
      include: {
        town: { select: { name: true } },
        orders: { orderBy: { orderDate: 'desc' }, take: 1, select: { orderDate: true } },
      },
    }),
    prisma.distributor.findMany({
      where: { deletedAt: null, town: { districtId: id } },
      orderBy: { firmName: 'asc' },
      include: {
        town: { select: { name: true } },
        orders: { orderBy: { orderDate: 'desc' }, take: 1, select: { orderDate: true } },
      },
    }),
    prisma.lead.findMany({
      where: { deletedAt: null, districtId: id, stage: { in: [...OPEN_LEAD_STAGES] } },
      orderBy: [{ followUpAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        town: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.salesmanTerritory.findMany({
      where: { OR: [{ districtId: id }, { town: { districtId: id } }] },
      include: { salesman: { select: { id: true, name: true, phone: true, isActive: true } } },
    }),
  ]);

  const townIds = towns.map((t) => t.id);
  const [retailerCount, orderRows] = await Promise.all([
    prisma.retailer.count({ where: { deletedAt: null, townId: { in: townIds } } }),
    prisma.order.findMany({
      where: {
        status: { not: 'CANCELLED' },
        orderDate: orderWindow,
        OR: [
          { retailer: { townId: { in: townIds } } },
          { distributor: { townId: { in: townIds } } },
          { superStockist: { townId: { in: townIds } } },
        ],
      },
      select: { totalAmount: true },
    }),
  ]);

  const orderValue = orderRows.reduce((sum, o) => sum.plus(o.totalAmount), new Prisma.Decimal(0));
  const townsCovered = towns.filter(
    (t) => t._count.distributors > 0 || t._count.distributorsCovering > 0,
  ).length;

  // One salesman can be assigned several towns in the same district.
  const salesmen = [...new Map(territories.map((t) => [t.salesman.id, t.salesman])).values()]
    .filter((s) => s.isActive)
    .map(({ id: salesmanId, name, phone }) => ({ id: salesmanId, name, phone }));

  return {
    id: district.id,
    code: district.code,
    name: district.name,
    nameGu: district.nameGu,
    zone: district.zone,
    lat: district.lat.toNumber(),
    lng: district.lng.toNumber(),
    coverageStatus: district.coverageStatus,
    counts: {
      superStockists: superStockists.filter((s) => s.status === 'ACTIVE').length,
      distributors: distributors.filter((d) => d.status === 'ACTIVE').length,
      retailers: retailerCount,
      openLeads: openLeads.length,
      towns: towns.length,
      townsCovered,
      ordersThisPeriod: orderRows.length,
      orderValueThisPeriod: orderValue.toFixed(2),
    },
    towns: towns.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      lat: t.lat.toNumber(),
      lng: t.lng.toNumber(),
      population: t.population,
      distributors: t._count.distributors,
      retailers: t._count.retailers,
      openLeads: t._count.leads,
      isCovered: t._count.distributors > 0 || t._count.distributorsCovering > 0,
    })),
    superStockists: superStockists.map((s) => ({
      id: s.id,
      firmName: s.firmName,
      ownerName: s.ownerName,
      phone: s.phone,
      address: s.address,
      townName: s.town.name,
      status: s.status,
      lastOrderAt: s.orders[0]?.orderDate.toISOString() ?? null,
    })),
    distributors: distributors.map((d) => ({
      id: d.id,
      firmName: d.firmName,
      ownerName: d.ownerName,
      phone: d.phone,
      address: d.address,
      townName: d.town.name,
      status: d.status,
      lastOrderAt: d.orders[0]?.orderDate.toISOString() ?? null,
    })),
    openLeads: openLeads.map((l) => ({
      id: l.id,
      name: l.name,
      firmName: l.firmName,
      phone: l.phone,
      townName: l.town.name,
      stage: l.stage,
      followUpAt: l.followUpAt?.toISOString() ?? null,
      assignedToName: l.assignedTo?.name ?? null,
    })),
    salesmen,
  };
}

/** Pins for the marker layers, trimmed to what the map needs. */
export async function getMapMarkers(): Promise<MapMarkersResponse> {
  const [superStockists, distributors, retailers, leads] = await Promise.all([
    prisma.superStockist.findMany({
      where: { deletedAt: null, lat: { not: null }, lng: { not: null } },
      select: {
        id: true,
        firmName: true,
        phone: true,
        status: true,
        lat: true,
        lng: true,
        town: { select: { name: true, district: { select: { code: true } } } },
      },
    }),
    prisma.distributor.findMany({
      where: { deletedAt: null, lat: { not: null }, lng: { not: null } },
      select: {
        id: true,
        firmName: true,
        phone: true,
        status: true,
        lat: true,
        lng: true,
        town: { select: { name: true, district: { select: { code: true } } } },
      },
    }),
    prisma.retailer.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        shopName: true,
        phone: true,
        isVerified: true,
        lat: true,
        lng: true,
        town: { select: { name: true, district: { select: { code: true } } } },
      },
    }),
    prisma.lead.findMany({
      where: { deletedAt: null, stage: { in: [...OPEN_LEAD_STAGES] } },
      select: {
        id: true,
        name: true,
        firmName: true,
        phone: true,
        stage: true,
        town: { select: { name: true, lat: true, lng: true, district: { select: { code: true } } } },
      },
    }),
  ]);

  return {
    superStockists: superStockists.map((s) => ({
      id: s.id,
      name: s.firmName,
      lat: num(s.lat)!,
      lng: num(s.lng)!,
      townName: s.town.name,
      districtCode: s.town.district.code,
      phone: s.phone,
      status: s.status,
    })),
    distributors: distributors.map((d) => ({
      id: d.id,
      name: d.firmName,
      lat: num(d.lat)!,
      lng: num(d.lng)!,
      townName: d.town.name,
      districtCode: d.town.district.code,
      phone: d.phone,
      status: d.status,
    })),
    retailers: retailers.map((r) => ({
      id: r.id,
      name: r.shopName,
      lat: r.lat.toNumber(),
      lng: r.lng.toNumber(),
      townName: r.town.name,
      districtCode: r.town.district.code,
      phone: r.phone,
      status: r.isVerified ? 'VERIFIED' : 'TO_VERIFY',
    })),
    // Leads have no pin of their own, so they sit on their town's coordinates.
    leads: leads.map((l) => ({
      id: l.id,
      name: l.firmName ?? l.name,
      lat: l.town.lat.toNumber(),
      lng: l.town.lng.toNumber(),
      townName: l.town.name,
      districtCode: l.town.district.code,
      phone: l.phone,
      status: l.stage,
    })),
  };
}

export async function listDistricts(
  queryInput: Pick<ListDistrictsQuery, 'zone' | 'coverageStatus'>,
): Promise<DistrictListItem[]> {
  const districts = await prisma.district.findMany({
    where: {
      deletedAt: null,
      ...(queryInput.zone ? { zone: queryInput.zone } : {}),
      ...(queryInput.coverageStatus ? { coverageStatus: queryInput.coverageStatus } : {}),
    },
    orderBy: { name: 'asc' },
    include: { _count: { select: { towns: { where: { deletedAt: null } } } } },
  });

  return districts.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    nameGu: d.nameGu,
    zone: d.zone,
    lat: d.lat.toNumber(),
    lng: d.lng.toNumber(),
    coverageStatus: d.coverageStatus,
    townCount: d._count.towns,
  }));
}

export async function updateDistrict(
  id: string,
  input: UpdateDistrictInput,
  actorId: string,
): Promise<DistrictListItem> {
  const existing = await prisma.district.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiException.notFound('District not found');

  await prisma.district.update({
    where: { id },
    data: {
      ...(input.nameGu === undefined ? {} : { nameGu: input.nameGu }),
      ...(input.lat === undefined ? {} : { lat: new Prisma.Decimal(input.lat) }),
      ...(input.lng === undefined ? {} : { lng: new Prisma.Decimal(input.lng) }),
      ...(input.zone === undefined ? {} : { zone: input.zone }),
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'District',
    entityId: id,
    before: { nameGu: existing.nameGu, lat: existing.lat.toString(), lng: existing.lng.toString(), zone: existing.zone },
    after: input,
  });

  return getDistrict(id);
}

export async function getDistrict(id: string): Promise<DistrictListItem> {
  const district = await prisma.district.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { towns: { where: { deletedAt: null } } } } },
  });
  if (!district) throw ApiException.notFound('District not found');

  return {
    id: district.id,
    code: district.code,
    name: district.name,
    nameGu: district.nameGu,
    zone: district.zone,
    lat: district.lat.toNumber(),
    lng: district.lng.toNumber(),
    coverageStatus: district.coverageStatus,
    townCount: district._count.towns,
  };
}

const townInclude = {
  district: { select: { id: true, name: true, code: true } },
  _count: {
    select: {
      distributors: { where: { deletedAt: null, status: 'ACTIVE' } },
      retailers: { where: { deletedAt: null } },
      leads: { where: { deletedAt: null, stage: { in: [...OPEN_LEAD_STAGES] } } },
    },
  },
} satisfies Prisma.TownInclude;

type TownWithRelations = Prisma.TownGetPayload<{ include: typeof townInclude }>;

function toTownListItem(town: TownWithRelations): TownListItem {
  return {
    id: town.id,
    name: town.name,
    type: town.type,
    lat: town.lat.toNumber(),
    lng: town.lng.toNumber(),
    population: town.population,
    district: town.district,
    counts: {
      distributors: town._count.distributors,
      retailers: town._count.retailers,
      openLeads: town._count.leads,
    },
  };
}

export async function listTowns(queryInput: ListTownsQuery): Promise<Paginated<TownListItem>> {
  const { page, limit, search, districtId, type } = queryInput;

  const where: Prisma.TownWhereInput = {
    deletedAt: null,
    ...(districtId ? { districtId } : {}),
    ...(type ? { type } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.town.findMany({
      where,
      include: townInclude,
      orderBy: [{ district: { name: 'asc' } }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.town.count({ where }),
  ]);

  return paginate(rows.map(toTownListItem), total, page, limit);
}

export async function createTown(input: CreateTownInput, actorId: string): Promise<TownListItem> {
  const district = await prisma.district.findFirst({
    where: { id: input.districtId, deletedAt: null },
  });
  if (!district) throw ApiException.badRequest('District not found');

  const clash = await prisma.town.findFirst({
    where: { districtId: input.districtId, name: input.name, deletedAt: null },
  });
  if (clash) throw ApiException.conflict(`${input.name} already exists in ${district.name}`);

  const town = await prisma.town.create({
    data: {
      name: input.name,
      districtId: input.districtId,
      lat: new Prisma.Decimal(input.lat),
      lng: new Prisma.Decimal(input.lng),
      type: input.type,
      population: input.population ?? null,
    },
    include: townInclude,
  });

  const result = toTownListItem(town);
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'Town',
    entityId: town.id,
    after: result,
  });
  return result;
}

export async function updateTown(
  id: string,
  input: UpdateTownInput,
  actorId: string,
): Promise<TownListItem> {
  const existing = await prisma.town.findFirst({ where: { id, deletedAt: null }, include: townInclude });
  if (!existing) throw ApiException.notFound('Town not found');

  const districtId = input.districtId ?? existing.districtId;
  const name = input.name ?? existing.name;
  if (districtId !== existing.districtId || name !== existing.name) {
    const clash = await prisma.town.findFirst({
      where: { districtId, name, deletedAt: null, NOT: { id } },
    });
    if (clash) throw ApiException.conflict(`${name} already exists in that district`);
  }

  const town = await prisma.town.update({
    where: { id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.districtId === undefined ? {} : { districtId: input.districtId }),
      ...(input.lat === undefined ? {} : { lat: new Prisma.Decimal(input.lat) }),
      ...(input.lng === undefined ? {} : { lng: new Prisma.Decimal(input.lng) }),
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.population === undefined ? {} : { population: input.population ?? null }),
    },
    include: townInclude,
  });

  // Moving a town between districts changes who covers what.
  if (input.districtId && input.districtId !== existing.districtId) {
    await recomputeDistrictCoverage(prisma, [existing.districtId, input.districtId]);
  }

  const result = toTownListItem(town);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Town',
    entityId: id,
    before: toTownListItem(existing),
    after: result,
  });
  return result;
}

export async function deleteTown(id: string, actorId: string): Promise<void> {
  const town = await prisma.town.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: {
          superStockists: { where: { deletedAt: null } },
          distributors: { where: { deletedAt: null } },
          retailers: { where: { deletedAt: null } },
          leads: { where: { deletedAt: null } },
          hqUsers: { where: { deletedAt: null } },
        },
      },
    },
  });
  if (!town) throw ApiException.notFound('Town not found');

  const attached =
    town._count.superStockists +
    town._count.distributors +
    town._count.retailers +
    town._count.leads +
    town._count.hqUsers;
  if (attached > 0) {
    throw ApiException.conflict(
      'This town still has partners, leads or salesmen attached. Move them first.',
    );
  }

  await prisma.town.update({ where: { id }, data: { deletedAt: new Date() } });
  await recomputeDistrictCoverage(prisma, [town.districtId]);

  await writeAuditLog({
    userId: actorId,
    action: 'DELETE',
    entity: 'Town',
    entityId: id,
    before: { name: town.name, districtId: town.districtId },
  });
}

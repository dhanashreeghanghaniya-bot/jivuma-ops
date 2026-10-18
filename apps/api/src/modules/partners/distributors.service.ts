import { Prisma } from '@prisma/client';
import type {
  CreateDistributorInput,
  DistributorListItem,
  ListDistributorsQuery,
  Paginated,
  UpdateDistributorInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException, paginate } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import {
  assertTownsExist,
  coordOrNull,
  decimalOrNull,
  districtsOfTowns,
  moneyOrNull,
  refreshCoverage,
  requireTownDistrict,
  toIso,
} from './partners.shared';

const include = {
  town: { select: { id: true, name: true, type: true, district: { select: { id: true, name: true, code: true } } } },
  superStockist: { select: { id: true, firmName: true, phone: true } },
  coveredTowns: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
  orders: { orderBy: { orderDate: 'desc' }, take: 1, select: { orderDate: true } },
  _count: { select: { retailers: { where: { deletedAt: null } }, orders: true } },
} satisfies Prisma.DistributorInclude;

type Row = Prisma.DistributorGetPayload<{ include: typeof include }>;

function toListItem(row: Row): DistributorListItem {
  return {
    id: row.id,
    firmName: row.firmName,
    ownerName: row.ownerName,
    phone: row.phone,
    altPhone: row.altPhone,
    email: row.email,
    gstin: row.gstin,
    address: row.address,
    status: row.status,
    lat: coordOrNull(row.lat),
    lng: coordOrNull(row.lng),
    notes: row.notes,
    onboardedAt: row.onboardedAt.toISOString(),
    creditLimit: moneyOrNull(row.creditLimit),
    creditDays: row.creditDays,
    town: row.town,
    superStockist: row.superStockist,
    coveredTowns: row.coveredTowns,
    counts: { retailers: row._count.retailers, orders: row._count.orders },
    lastOrderAt: toIso(row.orders[0]?.orderDate),
  };
}

async function requireSuperStockist(id: string): Promise<void> {
  const ss = await prisma.superStockist.findFirst({ where: { id, deletedAt: null } });
  if (!ss) throw ApiException.badRequest('Super stockist not found');
}

export async function list(
  queryInput: ListDistributorsQuery,
): Promise<Paginated<DistributorListItem>> {
  const { page, limit, search, districtId, townId, status, superStockistId } = queryInput;

  const where: Prisma.DistributorWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(townId ? { townId } : {}),
    ...(superStockistId ? { superStockistId } : {}),
    ...(districtId ? { town: { districtId } } : {}),
    ...(search
      ? {
          OR: [
            { firmName: { contains: search, mode: 'insensitive' } },
            { ownerName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.distributor.findMany({
      where,
      include,
      orderBy: [{ status: 'asc' }, { firmName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.distributor.count({ where }),
  ]);

  return paginate(rows.map(toListItem), total, page, limit);
}

export async function getById(id: string): Promise<DistributorListItem> {
  const row = await prisma.distributor.findFirst({ where: { id, deletedAt: null }, include });
  if (!row) throw ApiException.notFound('Distributor not found');
  return toListItem(row);
}

export async function create(
  input: CreateDistributorInput,
  actorId: string,
): Promise<DistributorListItem> {
  const districtId = await requireTownDistrict(input.townId);
  await requireSuperStockist(input.superStockistId);
  await assertTownsExist(input.coveredTownIds);

  const row = await prisma.distributor.create({
    data: {
      firmName: input.firmName,
      ownerName: input.ownerName,
      phone: input.phone,
      altPhone: input.altPhone ?? null,
      email: input.email ?? null,
      gstin: input.gstin ?? null,
      address: input.address,
      townId: input.townId,
      lat: decimalOrNull(input.lat),
      lng: decimalOrNull(input.lng),
      superStockistId: input.superStockistId,
      creditLimit: decimalOrNull(input.creditLimit),
      creditDays: input.creditDays ?? null,
      status: input.status,
      notes: input.notes ?? null,
      coveredTowns: { connect: input.coveredTownIds.map((id) => ({ id })) },
    },
    include,
  });

  await refreshCoverage([districtId, ...(await districtsOfTowns(input.coveredTownIds))]);

  const result = toListItem(row);
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'Distributor',
    entityId: row.id,
    after: result,
  });
  return result;
}

export async function update(
  id: string,
  input: UpdateDistributorInput,
  actorId: string,
): Promise<DistributorListItem> {
  const existing = await prisma.distributor.findFirst({ where: { id, deletedAt: null }, include });
  if (!existing) throw ApiException.notFound('Distributor not found');

  const nextDistrictId = input.townId
    ? await requireTownDistrict(input.townId)
    : existing.town.district.id;
  if (input.superStockistId) await requireSuperStockist(input.superStockistId);
  if (input.coveredTownIds) await assertTownsExist(input.coveredTownIds);

  const row = await prisma.distributor.update({
    where: { id },
    data: {
      ...(input.firmName === undefined ? {} : { firmName: input.firmName }),
      ...(input.ownerName === undefined ? {} : { ownerName: input.ownerName }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.altPhone === undefined ? {} : { altPhone: input.altPhone ?? null }),
      ...(input.email === undefined ? {} : { email: input.email ?? null }),
      ...(input.gstin === undefined ? {} : { gstin: input.gstin ?? null }),
      ...(input.address === undefined ? {} : { address: input.address }),
      ...(input.townId === undefined ? {} : { townId: input.townId }),
      ...(input.lat === undefined ? {} : { lat: decimalOrNull(input.lat) }),
      ...(input.lng === undefined ? {} : { lng: decimalOrNull(input.lng) }),
      ...(input.superStockistId === undefined ? {} : { superStockistId: input.superStockistId }),
      ...(input.creditLimit === undefined ? {} : { creditLimit: decimalOrNull(input.creditLimit) }),
      ...(input.creditDays === undefined ? {} : { creditDays: input.creditDays ?? null }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.notes === undefined ? {} : { notes: input.notes ?? null }),
      ...(input.coveredTownIds === undefined
        ? {}
        : { coveredTowns: { set: input.coveredTownIds.map((t) => ({ id: t })) } }),
    },
    include,
  });

  await refreshCoverage([
    existing.town.district.id,
    nextDistrictId,
    ...(await districtsOfTowns([
      ...existing.coveredTowns.map((t) => t.id),
      ...(input.coveredTownIds ?? []),
    ])),
  ]);

  const result = toListItem(row);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Distributor',
    entityId: id,
    before: toListItem(existing),
    after: result,
  });
  return result;
}

export async function remove(id: string, actorId: string): Promise<void> {
  const existing = await prisma.distributor.findFirst({ where: { id, deletedAt: null }, include });
  if (!existing) throw ApiException.notFound('Distributor not found');

  if (existing._count.retailers > 0) {
    throw ApiException.conflict(
      'This distributor still has retailers. Reassign them before removing it.',
    );
  }

  await prisma.distributor.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });
  await refreshCoverage([
    existing.town.district.id,
    ...(await districtsOfTowns(existing.coveredTowns.map((t) => t.id))),
  ]);

  await writeAuditLog({
    userId: actorId,
    action: 'DELETE',
    entity: 'Distributor',
    entityId: id,
    before: toListItem(existing),
  });
}

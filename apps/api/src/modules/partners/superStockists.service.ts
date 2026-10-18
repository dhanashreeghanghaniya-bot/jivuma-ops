import { Prisma } from '@prisma/client';
import type {
  CreateSuperStockistInput,
  ListSuperStockistsQuery,
  Paginated,
  SuperStockistListItem,
  UpdateSuperStockistInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException, paginate } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import {
  assertDistrictsExist,
  coordOrNull,
  decimalOrNull,
  refreshCoverage,
  requireTownDistrict,
  toIso,
} from './partners.shared';

const include = {
  town: { select: { id: true, name: true, type: true, district: { select: { id: true, name: true, code: true } } } },
  coveredDistricts: { select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } },
  orders: { orderBy: { orderDate: 'desc' }, take: 1, select: { orderDate: true } },
  _count: { select: { distributors: { where: { deletedAt: null } }, orders: true } },
} satisfies Prisma.SuperStockistInclude;

type Row = Prisma.SuperStockistGetPayload<{ include: typeof include }>;

function toListItem(row: Row): SuperStockistListItem {
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
    town: row.town,
    coveredDistricts: row.coveredDistricts,
    counts: { distributors: row._count.distributors, orders: row._count.orders },
    lastOrderAt: toIso(row.orders[0]?.orderDate),
  };
}

export async function list(
  queryInput: ListSuperStockistsQuery,
): Promise<Paginated<SuperStockistListItem>> {
  const { page, limit, search, districtId, townId, status } = queryInput;

  const where: Prisma.SuperStockistWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(townId ? { townId } : {}),
    ...(districtId
      ? { OR: [{ town: { districtId } }, { coveredDistricts: { some: { id: districtId } } }] }
      : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { firmName: { contains: search, mode: 'insensitive' } },
                { ownerName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.superStockist.findMany({
      where,
      include,
      orderBy: [{ status: 'asc' }, { firmName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.superStockist.count({ where }),
  ]);

  return paginate(rows.map(toListItem), total, page, limit);
}

export async function getById(id: string): Promise<SuperStockistListItem> {
  const row = await prisma.superStockist.findFirst({ where: { id, deletedAt: null }, include });
  if (!row) throw ApiException.notFound('Super stockist not found');
  return toListItem(row);
}

export async function create(
  input: CreateSuperStockistInput,
  actorId: string,
): Promise<SuperStockistListItem> {
  const districtId = await requireTownDistrict(input.townId);
  await assertDistrictsExist(input.coveredDistrictIds);

  const row = await prisma.superStockist.create({
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
      status: input.status,
      notes: input.notes ?? null,
      coveredDistricts: { connect: input.coveredDistrictIds.map((id) => ({ id })) },
    },
    include,
  });

  await refreshCoverage([districtId, ...input.coveredDistrictIds]);

  const result = toListItem(row);
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'SuperStockist',
    entityId: row.id,
    after: result,
  });
  return result;
}

export async function update(
  id: string,
  input: UpdateSuperStockistInput,
  actorId: string,
): Promise<SuperStockistListItem> {
  const existing = await prisma.superStockist.findFirst({ where: { id, deletedAt: null }, include });
  if (!existing) throw ApiException.notFound('Super stockist not found');

  const nextDistrictId = input.townId
    ? await requireTownDistrict(input.townId)
    : existing.town.district.id;
  if (input.coveredDistrictIds) await assertDistrictsExist(input.coveredDistrictIds);

  const row = await prisma.superStockist.update({
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
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.notes === undefined ? {} : { notes: input.notes ?? null }),
      ...(input.coveredDistrictIds === undefined
        ? {}
        : { coveredDistricts: { set: input.coveredDistrictIds.map((d) => ({ id: d })) } }),
    },
    include,
  });

  await refreshCoverage([
    existing.town.district.id,
    nextDistrictId,
    ...existing.coveredDistricts.map((d) => d.id),
    ...(input.coveredDistrictIds ?? []),
  ]);

  const result = toListItem(row);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'SuperStockist',
    entityId: id,
    before: toListItem(existing),
    after: result,
  });
  return result;
}

/** Soft delete only: master data with orders attached is never removed (SPEC 2). */
export async function remove(id: string, actorId: string): Promise<void> {
  const existing = await prisma.superStockist.findFirst({ where: { id, deletedAt: null }, include });
  if (!existing) throw ApiException.notFound('Super stockist not found');

  if (existing._count.distributors > 0) {
    throw ApiException.conflict(
      'This super stockist still has distributors. Reassign them before removing it.',
    );
  }

  await prisma.superStockist.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });
  await refreshCoverage([
    existing.town.district.id,
    ...existing.coveredDistricts.map((d) => d.id),
  ]);

  await writeAuditLog({
    userId: actorId,
    action: 'DELETE',
    entity: 'SuperStockist',
    entityId: id,
    before: toListItem(existing),
  });
}

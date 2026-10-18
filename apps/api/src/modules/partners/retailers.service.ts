import { Prisma } from '@prisma/client';
import type {
  CreateRetailerInput,
  ListRetailersQuery,
  Paginated,
  RetailerListItem,
  UpdateRetailerInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException, paginate } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { refreshCoverage, requireTownDistrict, toIso } from './partners.shared';

const include = {
  town: { select: { id: true, name: true, type: true, district: { select: { id: true, name: true, code: true } } } },
  distributor: { select: { id: true, firmName: true, phone: true } },
  addedBySalesman: { select: { id: true, name: true } },
  orders: { orderBy: { orderDate: 'desc' }, take: 1, select: { orderDate: true } },
  _count: { select: { visits: true, orders: true } },
} satisfies Prisma.RetailerInclude;

type Row = Prisma.RetailerGetPayload<{ include: typeof include }>;

function toListItem(row: Row): RetailerListItem {
  return {
    id: row.id,
    shopName: row.shopName,
    ownerName: row.ownerName,
    phone: row.phone,
    address: row.address,
    category: row.category,
    lat: row.lat.toNumber(),
    lng: row.lng.toNumber(),
    photoUrl: row.photoUrl,
    isVerified: row.isVerified,
    verifiedAt: toIso(row.verifiedAt),
    createdAt: row.createdAt.toISOString(),
    town: row.town,
    distributor: row.distributor,
    addedBySalesman: row.addedBySalesman,
    counts: { visits: row._count.visits, orders: row._count.orders },
    lastOrderAt: toIso(row.orders[0]?.orderDate),
  };
}

async function requireDistributor(id: string): Promise<void> {
  const distributor = await prisma.distributor.findFirst({ where: { id, deletedAt: null } });
  if (!distributor) throw ApiException.badRequest('Distributor not found');
}

export async function list(queryInput: ListRetailersQuery): Promise<Paginated<RetailerListItem>> {
  const { page, limit, search, districtId, townId, distributorId, category, isVerified } = queryInput;

  const where: Prisma.RetailerWhereInput = {
    deletedAt: null,
    ...(townId ? { townId } : {}),
    ...(distributorId ? { distributorId } : {}),
    ...(category ? { category } : {}),
    ...(isVerified === undefined ? {} : { isVerified }),
    ...(districtId ? { town: { districtId } } : {}),
    ...(search
      ? {
          OR: [
            { shopName: { contains: search, mode: 'insensitive' } },
            { ownerName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.retailer.findMany({
      where,
      include,
      // Unverified shops first: they are the admin's action queue (SPEC 4.2).
      orderBy: [{ isVerified: 'asc' }, { shopName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.retailer.count({ where }),
  ]);

  return paginate(rows.map(toListItem), total, page, limit);
}

export async function getById(id: string): Promise<RetailerListItem> {
  const row = await prisma.retailer.findFirst({ where: { id, deletedAt: null }, include });
  if (!row) throw ApiException.notFound('Retailer not found');
  return toListItem(row);
}

export async function create(
  input: CreateRetailerInput,
  actorId: string,
  options: { addedBySalesmanId?: string; isVerified?: boolean } = {},
): Promise<RetailerListItem> {
  const districtId = await requireTownDistrict(input.townId);
  await requireDistributor(input.distributorId);

  const row = await prisma.retailer.create({
    data: {
      shopName: input.shopName,
      ownerName: input.ownerName,
      phone: input.phone,
      address: input.address,
      townId: input.townId,
      lat: new Prisma.Decimal(input.lat),
      lng: new Prisma.Decimal(input.lng),
      distributorId: input.distributorId,
      category: input.category,
      photoUrl: input.photoUrl ?? null,
      addedBySalesmanId: options.addedBySalesmanId ?? null,
      // Admin-created shops are trusted; field-added ones wait for approval.
      isVerified: options.isVerified ?? true,
      verifiedById: options.isVerified === false ? null : actorId,
      verifiedAt: options.isVerified === false ? null : new Date(),
    },
    include,
  });

  await refreshCoverage([districtId]);

  const result = toListItem(row);
  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'Retailer',
    entityId: row.id,
    after: result,
  });
  return result;
}

export async function update(
  id: string,
  input: UpdateRetailerInput,
  actorId: string,
): Promise<RetailerListItem> {
  const existing = await prisma.retailer.findFirst({ where: { id, deletedAt: null }, include });
  if (!existing) throw ApiException.notFound('Retailer not found');

  const nextDistrictId = input.townId
    ? await requireTownDistrict(input.townId)
    : existing.town.district.id;
  if (input.distributorId) await requireDistributor(input.distributorId);

  const row = await prisma.retailer.update({
    where: { id },
    data: {
      ...(input.shopName === undefined ? {} : { shopName: input.shopName }),
      ...(input.ownerName === undefined ? {} : { ownerName: input.ownerName }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.address === undefined ? {} : { address: input.address }),
      ...(input.townId === undefined ? {} : { townId: input.townId }),
      ...(input.lat === undefined ? {} : { lat: new Prisma.Decimal(input.lat) }),
      ...(input.lng === undefined ? {} : { lng: new Prisma.Decimal(input.lng) }),
      ...(input.distributorId === undefined ? {} : { distributorId: input.distributorId }),
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.photoUrl === undefined ? {} : { photoUrl: input.photoUrl ?? null }),
    },
    include,
  });

  await refreshCoverage([existing.town.district.id, nextDistrictId]);

  const result = toListItem(row);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Retailer',
    entityId: id,
    before: toListItem(existing),
    after: result,
  });
  return result;
}

/** Admin approval for a shop added in the field (SPEC 4.2). */
export async function verify(id: string, actorId: string): Promise<RetailerListItem> {
  const existing = await prisma.retailer.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiException.notFound('Retailer not found');
  if (existing.isVerified) throw ApiException.badRequest('This shop is already verified');

  const row = await prisma.retailer.update({
    where: { id },
    data: { isVerified: true, verifiedById: actorId, verifiedAt: new Date() },
    include,
  });

  const result = toListItem(row);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Retailer',
    entityId: id,
    before: { isVerified: false },
    after: { isVerified: true },
  });
  return result;
}

export async function remove(id: string, actorId: string): Promise<void> {
  const existing = await prisma.retailer.findFirst({ where: { id, deletedAt: null }, include });
  if (!existing) throw ApiException.notFound('Retailer not found');

  await prisma.retailer.update({ where: { id }, data: { deletedAt: new Date() } });
  await refreshCoverage([existing.town.district.id]);

  await writeAuditLog({
    userId: actorId,
    action: 'DELETE',
    entity: 'Retailer',
    entityId: id,
    before: toListItem(existing),
  });
}

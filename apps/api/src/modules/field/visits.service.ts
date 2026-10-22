import {
  OrderLevel,
  OrderStatus,
  PartnerStatus,
  PartyType,
  PingSource,
  Prisma,
  VisitOutcome,
} from '@prisma/client';
import {
  VISIT_DISTANCE_FLAG_M,
  type AttachVisitPhotosInput,
  type CreateVisitInput,
  type ListVisitsQuery,
  type VisitListItem,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { istDayEndUtc, istDayStartUtc } from '../../lib/dates';
import { clampDeviceTime, haversineMeters } from '../../lib/geo';
import { nextOrderNumber } from '../../lib/orderNumber';
import { assertOwnPath } from '../../lib/storage';
import { priceLines } from '../orders/orders.service';
import { territoryOf } from './territory';
import { requireWritableDay } from './workdays.service';

const include = {
  town: { select: { id: true, name: true } },
  salesman: { select: { id: true, name: true } },
  retailer: { select: { id: true, shopName: true, addedBySalesmanId: true } },
  order: {
    select: { id: true, orderNumber: true, totalAmount: true, _count: { select: { items: true } } },
  },
  photos: { select: { id: true, url: true, type: true }, orderBy: { capturedAt: 'asc' } },
} satisfies Prisma.VisitInclude;

type Row = Prisma.VisitGetPayload<{ include: typeof include }>;

function toItem(row: Row): VisitListItem {
  return {
    id: row.id,
    clientUuid: row.clientUuid,
    workDayId: row.workDayId,
    checkInAt: row.checkInAt.toISOString(),
    outcome: row.outcome,
    noOrderReason: row.noOrderReason,
    notes: row.notes,
    distanceFromShopMeters: row.distanceFromShopMeters,
    isFarFromShop: (row.distanceFromShopMeters ?? 0) > VISIT_DISTANCE_FLAG_M,
    salesman: row.salesman,
    town: row.town,
    shop: {
      id: row.retailer?.id ?? null,
      name: row.retailer?.shopName ?? row.newShopName ?? 'Unknown shop',
      // A new shop may also take an order, so the outcome alone cannot say.
      isNew: row.newShopName !== null,
    },
    order: row.order
      ? {
          id: row.order.id,
          orderNumber: row.order.orderNumber,
          totalAmount: row.order.totalAmount.toFixed(2),
          itemCount: row.order._count.items,
        }
      : null,
    photos: row.photos.map((p) => ({ id: p.id, path: p.url, type: p.type })),
  };
}

export async function create(salesmanId: string, input: CreateVisitInput): Promise<VisitListItem> {
  // An offline retry of a visit that already reached the server returns it unchanged.
  const existing = await prisma.visit.findUnique({
    where: { clientUuid: input.clientUuid },
    include,
  });
  if (existing) {
    if (existing.salesmanId !== salesmanId) throw ApiException.conflict('Duplicate visit id');
    return toItem(existing);
  }

  const now = new Date();
  const checkInAt = clampDeviceTime(input.checkIn.capturedAt, now);
  const day = await requireWritableDay(salesmanId, input.workDayId, checkInAt);
  const territory = await territoryOf(salesmanId);
  const checkIn = { lat: input.checkIn.lat, lng: input.checkIn.lng };

  let townId = input.townId;
  let distanceFromShopMeters: number | null = null;

  if (input.retailerId) {
    const retailer = await prisma.retailer.findFirst({
      where: { id: input.retailerId, deletedAt: null },
    });
    if (!retailer || !territory.townIds.includes(retailer.townId)) {
      throw ApiException.forbidden('That shop is outside your territory');
    }
    // The shop's own town wins over whatever the picker had selected.
    townId = retailer.townId;
    distanceFromShopMeters = Math.round(
      haversineMeters(checkIn, { lat: retailer.lat.toNumber(), lng: retailer.lng.toNumber() }),
    );
  } else if (!territory.townIds.includes(townId)) {
    throw ApiException.forbidden('That town is outside your territory');
  }

  const newShop = input.newShop ?? null;
  if (newShop) {
    if (newShop.photoPath) assertOwnPath(newShop.photoPath, 'shops', salesmanId);
    distanceFromShopMeters = Math.round(
      haversineMeters(checkIn, { lat: newShop.lat, lng: newShop.lng }),
    );
  }

  const deliveringDistributorId = input.order?.distributorId ?? newShop?.distributorId;
  if (deliveringDistributorId) {
    const distributor = await prisma.distributor.findFirst({
      where: { id: deliveringDistributorId, deletedAt: null, status: PartnerStatus.ACTIVE },
    });
    if (!distributor) throw ApiException.badRequest('That distributor is not active');
  }

  const priced = input.order
    ? await priceLines(OrderLevel.DISTRIBUTOR_TO_RETAILER, input.order.items)
    : null;

  const write = () =>
    prisma.$transaction(async (tx) => {
      let retailerId = input.retailerId ?? null;
      if (newShop) {
        // Lands in the admin "To verify" queue with the salesman who added it (SPEC 4.2).
        const shop = await tx.retailer.create({
          data: {
            shopName: newShop.shopName,
            ownerName: newShop.ownerName,
            phone: newShop.phone,
            address: newShop.address,
            townId,
            lat: new Prisma.Decimal(newShop.lat),
            lng: new Prisma.Decimal(newShop.lng),
            distributorId: newShop.distributorId,
            category: newShop.category,
            photoUrl: newShop.photoPath ?? null,
            addedBySalesmanId: salesmanId,
            isVerified: false,
          },
        });
        retailerId = shop.id;
      }

      const created = await tx.visit.create({
        data: {
          clientUuid: input.clientUuid,
          workDayId: day.id,
          salesmanId,
          retailerId,
          distributorId: deliveringDistributorId ?? null,
          townId,
          newShopName: newShop?.shopName ?? null,
          newShopOwner: newShop?.ownerName ?? null,
          newShopPhone: newShop?.phone ?? null,
          checkInAt,
          checkInLat: new Prisma.Decimal(checkIn.lat),
          checkInLng: new Prisma.Decimal(checkIn.lng),
          checkOutAt: now,
          distanceFromShopMeters,
          outcome: input.outcome,
          noOrderReason:
            input.outcome === VisitOutcome.NO_ORDER ? (input.noOrderReason ?? null) : null,
          notes: input.notes ?? null,
        },
      });

      if (input.order && priced) {
        await tx.order.create({
          data: {
            level: OrderLevel.DISTRIBUTOR_TO_RETAILER,
            fromPartyType: PartyType.DISTRIBUTOR,
            toPartyType: PartyType.RETAILER,
            distributorId: input.order.distributorId,
            retailerId,
            orderNumber: await nextOrderNumber(tx, checkInAt),
            status: OrderStatus.PLACED,
            totalAmount: priced.total,
            takenBySalesmanId: salesmanId,
            visitId: created.id,
            orderDate: checkInAt,
            notes: input.order.notes ?? null,
            items: { create: priced.items },
            statusLogs: {
              create: { status: OrderStatus.PLACED, changedById: salesmanId, at: checkInAt },
            },
          },
        });
      }

      await tx.locationPing.createMany({
        data: [PingSource.VISIT, ...(input.order ? [PingSource.ORDER] : [])].map((source) => ({
          workDayId: day.id,
          salesmanId,
          lat: new Prisma.Decimal(checkIn.lat),
          lng: new Prisma.Decimal(checkIn.lng),
          accuracyM: input.checkIn.accuracyM,
          source,
          capturedAt: checkInAt,
        })),
      });

      await tx.workDay.update({
        where: { id: day.id },
        data: { townsVisited: { connect: { id: townId } } },
      });
      return created;
    });

  let visit;
  try {
    visit = await write();
  } catch (err) {
    // Two copies of the same queued visit raced past the lookup above; the
    // loser's whole transaction (shop, order, pings) rolled back.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.visit.findUnique({
        where: { clientUuid: input.clientUuid },
        include,
      });
      if (winner && winner.salesmanId === salesmanId) return toItem(winner);
    }
    throw err;
  }

  await writeAuditLog({
    userId: salesmanId,
    action: 'CREATE',
    entity: 'Visit',
    entityId: visit.id,
    after: {
      outcome: input.outcome,
      retailerId: visit.retailerId,
      newShop: newShop?.shopName,
      orderTotal: priced?.total,
    },
  });

  return toItem(await prisma.visit.findUniqueOrThrow({ where: { id: visit.id }, include }));
}

/**
 * Photos follow their visit rather than travelling with it, so a visit syncs
 * the moment the phone has signal and the heavier uploads can trail behind.
 */
export async function attachPhotos(
  salesmanId: string,
  visitId: string,
  input: AttachVisitPhotosInput,
): Promise<VisitListItem> {
  const visit = await prisma.visit.findFirst({ where: { id: visitId, salesmanId } });
  if (!visit) throw ApiException.notFound('Visit not found');
  for (const photo of input.photos) assertOwnPath(photo.path, 'visits', salesmanId);

  await prisma.visitPhoto.createMany({
    data: input.photos.map((photo) => ({
      visitId,
      url: photo.path,
      type: photo.type,
      capturedAt: clampDeviceTime(photo.capturedAt),
      lat: photo.lat == null ? null : new Prisma.Decimal(photo.lat),
      lng: photo.lng == null ? null : new Prisma.Decimal(photo.lng),
    })),
    skipDuplicates: true,
  });

  return toItem(await prisma.visit.findUniqueOrThrow({ where: { id: visitId }, include }));
}

export async function list(
  query: ListVisitsQuery,
  viewer: { userId: string; isAdmin: boolean },
): Promise<VisitListItem[]> {
  const salesmanId = viewer.isAdmin ? query.salesmanId : viewer.userId;
  const rows = await prisma.visit.findMany({
    where: {
      ...(salesmanId ? { salesmanId } : {}),
      ...(query.workDayId ? { workDayId: query.workDayId } : {}),
      ...(query.retailerId ? { retailerId: query.retailerId } : {}),
      ...(query.date
        ? { checkInAt: { gte: istDayStartUtc(query.date), lt: istDayEndUtc(query.date) } }
        : {}),
    },
    include,
    orderBy: { checkInAt: 'desc' },
    take: 200,
  });
  return rows.map(toItem);
}

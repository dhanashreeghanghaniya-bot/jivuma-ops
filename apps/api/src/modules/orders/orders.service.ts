import { OrderLevel, OrderStatus, PartnerStatus, PartyType, Prisma } from '@prisma/client';
import {
  PRICE_TIER,
  RATE_EDITABLE_STATUSES,
  type UpdateOrderRatesInput,
  allowedNextStatuses,
  type ChangeOrderStatusInput,
  type CreateOrderInput,
  type ListOrdersQuery,
  type OrderDetail,
  type OrderListItem,
  type OrderListMeta,
  type OrderParty,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { istDayStartUtc, istDayEndUtc } from '../../lib/dates';
import { nextOrderNumber } from '../../lib/orderNumber';

const place = {
  select: {
    id: true,
    name: true,
    district: { select: { id: true, name: true } },
  },
} as const;

const include = {
  superStockist: { select: { id: true, firmName: true, town: place } },
  distributor: { select: { id: true, firmName: true, town: place } },
  retailer: { select: { id: true, shopName: true, town: place } },
  takenBySalesman: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

type Row = Prisma.OrderGetPayload<{ include: typeof include }>;
type Place = NonNullable<Row['retailer']>['town'];

const COMPANY: OrderParty = {
  type: PartyType.COMPANY,
  id: null,
  name: 'Juma Food Products',
  town: null,
  district: null,
};

function party(
  type: PartyType,
  entity: { id: string; name: string; town: Place } | null,
): OrderParty {
  if (!entity) return { type, id: null, name: 'Unknown', town: null, district: null };
  return {
    type,
    id: entity.id,
    name: entity.name,
    town: { id: entity.town.id, name: entity.town.name },
    district: entity.town.district,
  };
}

/** Both ends of an order, from its level (SPEC 2.3). */
function ends(row: Row): { from: OrderParty; to: OrderParty } {
  const ss = row.superStockist && {
    id: row.superStockist.id,
    name: row.superStockist.firmName,
    town: row.superStockist.town,
  };
  const dist = row.distributor && {
    id: row.distributor.id,
    name: row.distributor.firmName,
    town: row.distributor.town,
  };
  const shop = row.retailer && {
    id: row.retailer.id,
    name: row.retailer.shopName,
    town: row.retailer.town,
  };
  switch (row.level) {
    case OrderLevel.COMPANY_TO_SS:
      return { from: COMPANY, to: party(PartyType.SUPER_STOCKIST, ss) };
    case OrderLevel.SS_TO_DISTRIBUTOR:
      return { from: party(PartyType.SUPER_STOCKIST, ss), to: party(PartyType.DISTRIBUTOR, dist) };
    case OrderLevel.DISTRIBUTOR_TO_RETAILER:
      return { from: party(PartyType.DISTRIBUTOR, dist), to: party(PartyType.RETAILER, shop) };
  }
}

function toListItem(row: Row): OrderListItem {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    level: row.level,
    status: row.status,
    orderDate: row.orderDate.toISOString(),
    expectedDelivery: row.expectedDelivery?.toISOString() ?? null,
    totalAmount: row.totalAmount.toFixed(2),
    itemCount: row._count.items,
    ...ends(row),
    takenBy: row.takenBySalesman,
    fromVisit: row.visitId !== null,
  };
}

export interface Viewer {
  userId: string;
  isAdmin: boolean;
}

function buildWhere(q: ListOrdersQuery, viewer: Viewer): Prisma.OrderWhereInput {
  const districtId = q.districtId;
  return {
    // A salesman sees the orders he took, whatever filter he sends (SPEC 6).
    ...(viewer.isAdmin
      ? q.takenBySalesmanId
        ? { takenBySalesmanId: q.takenBySalesmanId }
        : {}
      : { takenBySalesmanId: viewer.userId }),
    ...(q.level ? { level: q.level } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.superStockistId ? { superStockistId: q.superStockistId } : {}),
    ...(q.distributorId ? { distributorId: q.distributorId } : {}),
    ...(q.retailerId ? { retailerId: q.retailerId } : {}),
    ...(q.search ? { orderNumber: { contains: q.search.toUpperCase() } } : {}),
    ...(q.from || q.to
      ? {
          orderDate: {
            ...(q.from ? { gte: istDayStartUtc(q.from) } : {}),
            ...(q.to ? { lt: istDayEndUtc(q.to) } : {}),
          },
        }
      : {}),
    // "District" means where the goods are going: the receiving party's district.
    ...(districtId
      ? {
          OR: [
            { level: OrderLevel.COMPANY_TO_SS, superStockist: { town: { districtId } } },
            { level: OrderLevel.SS_TO_DISTRIBUTOR, distributor: { town: { districtId } } },
            { level: OrderLevel.DISTRIBUTOR_TO_RETAILER, retailer: { town: { districtId } } },
          ],
        }
      : {}),
  };
}

export async function list(
  q: ListOrdersQuery,
  viewer: Viewer,
): Promise<{ items: OrderListItem[]; meta: OrderListMeta }> {
  if (q.from && q.to && q.from > q.to)
    throw ApiException.badRequest('`from` must not be after `to`');
  const where = buildWhere(q, viewer);
  const [rows, total, value] = await Promise.all([
    prisma.order.findMany({
      where,
      include,
      orderBy: [{ orderDate: 'desc' }, { orderNumber: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({
      where: { AND: [where, { status: { not: OrderStatus.CANCELLED } }] },
      _sum: { totalAmount: true },
    }),
  ]);
  return {
    items: rows.map(toListItem),
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
      totalValue: (value._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
    },
  };
}

export async function getById(id: string, viewer: Viewer): Promise<OrderDetail> {
  const row = await prisma.order.findUnique({
    where: { id },
    include: {
      ...include,
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, packSize: true, unitsPerCase: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      statusLogs: {
        include: { changedBy: { select: { id: true, name: true } } },
        orderBy: { at: 'asc' },
      },
      visit: { select: { id: true, checkInAt: true, distanceFromShopMeters: true } },
    },
  });
  // Not found and not yours look the same to a salesman.
  if (!row || (!viewer.isAdmin && row.takenBySalesmanId !== viewer.userId)) {
    throw ApiException.notFound('Order not found');
  }

  return {
    ...toListItem(row),
    notes: row.notes,
    items: row.items.map((item) => ({
      id: item.id,
      product: item.product,
      qtyCases: item.qtyCases,
      qtyUnits: item.qtyUnits,
      totalUnits: item.qtyCases * item.product.unitsPerCase + item.qtyUnits,
      rate: item.rate.toFixed(2),
      amount: item.amount.toFixed(2),
    })),
    timeline: row.statusLogs.map((log) => ({
      id: log.id,
      status: log.status,
      note: log.note,
      at: log.at.toISOString(),
      by: log.changedBy,
    })),
    visit: row.visit
      ? {
          id: row.visit.id,
          checkInAt: row.visit.checkInAt.toISOString(),
          distanceFromShopMeters: row.visit.distanceFromShopMeters,
        }
      : null,
    nextStatuses: viewer.isAdmin ? allowedNextStatuses(row.status) : [],
  };
}

const activePartner = { deletedAt: null, status: PartnerStatus.ACTIVE };

async function assertParties(input: CreateOrderInput) {
  if (input.superStockistId) {
    const ss = await prisma.superStockist.findFirst({
      where: { id: input.superStockistId, ...activePartner },
    });
    if (!ss) throw ApiException.badRequest('That super stockist is not active');
  }
  if (input.distributorId) {
    const dist = await prisma.distributor.findFirst({
      where: { id: input.distributorId, ...activePartner },
    });
    if (!dist) throw ApiException.badRequest('That distributor is not active');
    // A distributor buys from its own super stockist; anything else breaks the chain.
    if (
      input.level === OrderLevel.SS_TO_DISTRIBUTOR &&
      dist.superStockistId !== input.superStockistId
    ) {
      throw ApiException.badRequest('This distributor buys from a different super stockist');
    }
  }
  if (input.retailerId) {
    const shop = await prisma.retailer.findFirst({
      where: { id: input.retailerId, deletedAt: null },
    });
    if (!shop) throw ApiException.badRequest('That shop does not exist');
  }
}

/** Prices every line from the product master at the level's tier; clients never send money. */
export async function priceLines(level: OrderLevel, lines: CreateOrderInput['items']) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true, deletedAt: null },
  });
  if (products.length !== ids.length)
    throw ApiException.badRequest('One or more products are not available');
  const byId = new Map(products.map((p) => [p.id, p]));
  const tier = PRICE_TIER[level];

  let total = new Prisma.Decimal(0);
  const items = lines.map((line) => {
    const product = byId.get(line.productId)!;
    const rate = product[tier];
    const amount = rate
      .mul(line.qtyCases * product.unitsPerCase + line.qtyUnits)
      .toDecimalPlaces(2);
    total = total.add(amount);
    return {
      productId: product.id,
      qtyCases: line.qtyCases,
      qtyUnits: line.qtyUnits,
      rate,
      amount,
    };
  });
  return { items, total };
}

const PARTY_TYPES: Record<OrderLevel, { from: PartyType; to: PartyType }> = {
  COMPANY_TO_SS: { from: PartyType.COMPANY, to: PartyType.SUPER_STOCKIST },
  SS_TO_DISTRIBUTOR: { from: PartyType.SUPER_STOCKIST, to: PartyType.DISTRIBUTOR },
  DISTRIBUTOR_TO_RETAILER: { from: PartyType.DISTRIBUTOR, to: PartyType.RETAILER },
};

/** Admin-placed order at any level (SPEC 4.4). Field orders come in with visits. */
export async function create(input: CreateOrderInput, actorId: string): Promise<OrderDetail> {
  await assertParties(input);
  const priced = await priceLines(input.level, input.items);
  const now = new Date();

  const order = await prisma.$transaction(async (tx) =>
    tx.order.create({
      data: {
        level: input.level,
        fromPartyType: PARTY_TYPES[input.level].from,
        toPartyType: PARTY_TYPES[input.level].to,
        superStockistId: input.superStockistId ?? null,
        distributorId: input.distributorId ?? null,
        retailerId: input.retailerId ?? null,
        orderNumber: await nextOrderNumber(tx, now),
        status: OrderStatus.PLACED,
        totalAmount: priced.total,
        orderDate: now,
        expectedDelivery: input.expectedDelivery
          ? new Date(`${input.expectedDelivery}T00:00:00+05:30`)
          : null,
        notes: input.notes ?? null,
        items: { create: priced.items },
        statusLogs: { create: { status: OrderStatus.PLACED, changedById: actorId, at: now } },
      },
    }),
  );

  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'Order',
    entityId: order.id,
    after: { orderNumber: order.orderNumber, level: input.level, total: priced.total.toFixed(2) },
  });
  return getById(order.id, { userId: actorId, isAdmin: true });
}

export async function changeStatus(
  id: string,
  input: ChangeOrderStatusInput,
  actorId: string,
): Promise<OrderDetail> {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw ApiException.notFound('Order not found');
  if (!allowedNextStatuses(order.status).includes(input.status)) {
    throw ApiException.badRequest(
      `An order that is ${order.status.toLowerCase()} cannot become ${input.status.toLowerCase()}`,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Guarded on the status we read, so two admins clicking at once cannot both win.
    const moved = await tx.order.updateMany({
      where: { id, status: order.status },
      data: { status: input.status },
    });
    if (moved.count === 0)
      throw ApiException.conflict('Someone else just changed this order. Reload it.');
    await tx.orderStatusLog.create({
      data: {
        orderId: id,
        status: input.status,
        changedById: actorId,
        note: input.note ?? null,
        at: now,
      },
    });
  });

  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Order',
    entityId: id,
    before: { status: order.status },
    after: { status: input.status, note: input.note },
  });
  return getById(id, { userId: actorId, isAdmin: true });
}

/** Admin price change for one order; the product's standard prices stay as they are. */
export async function updateRates(
  id: string,
  input: UpdateOrderRatesInput,
  actorId: string,
): Promise<OrderDetail> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: { select: { unitsPerCase: true } } } } },
  });
  if (!order) throw ApiException.notFound('Order not found');
  if (!RATE_EDITABLE_STATUSES.includes(order.status)) {
    throw ApiException.badRequest('Prices can only be changed before the order is dispatched');
  }

  const rates = new Map(input.items.map((i) => [i.id, new Prisma.Decimal(i.rate)]));
  if ([...rates.keys()].some((itemId) => !order.items.some((i) => i.id === itemId))) {
    throw ApiException.badRequest('One or more lines are not on this order');
  }

  let total = new Prisma.Decimal(0);
  const lines = order.items.map((item) => {
    const rate = rates.get(item.id) ?? item.rate;
    const amount = rate
      .mul(item.qtyCases * item.product.unitsPerCase + item.qtyUnits)
      .toDecimalPlaces(2);
    total = total.add(amount);
    return { id: item.id, rate, amount };
  });

  await prisma.$transaction(async (tx) => {
    // Guarded on the status we read, so a dispatch at the same moment wins cleanly.
    const moved = await tx.order.updateMany({
      where: { id, status: order.status },
      data: { totalAmount: total },
    });
    if (moved.count === 0)
      throw ApiException.conflict('Someone else just changed this order. Reload it.');
    for (const line of lines) {
      await tx.orderItem.update({
        where: { id: line.id },
        data: { rate: line.rate, amount: line.amount },
      });
    }
  });

  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Order',
    entityId: id,
    before: {
      totalAmount: order.totalAmount.toFixed(2),
      rates: order.items.map((i) => ({ id: i.id, rate: i.rate.toFixed(2) })),
    },
    after: {
      totalAmount: total.toFixed(2),
      rates: lines.map((l) => ({ id: l.id, rate: l.rate.toFixed(2) })),
    },
  });
  return getById(id, { userId: actorId, isAdmin: true });
}

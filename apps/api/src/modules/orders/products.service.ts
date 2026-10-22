import { Prisma, type Product } from '@prisma/client';
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductItem,
  UpdateProductInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';

function toItem(p: Product & { _count: { orderItems: number } }): ProductItem {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    packSize: p.packSize,
    unitsPerCase: p.unitsPerCase,
    mrp: p.mrp.toFixed(2),
    ssPrice: p.ssPrice.toFixed(2),
    distributorPrice: p.distributorPrice.toFixed(2),
    retailerPrice: p.retailerPrice.toFixed(2),
    isActive: p.isActive,
    orderCount: p._count.orderItems,
  };
}

const include = { _count: { select: { orderItems: true } } } as const;

/** Inactive products stay for history but are hidden from pickers unless asked for. */
export async function list(q: ListProductsQuery, isAdmin: boolean): Promise<ProductItem[]> {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null, ...(isAdmin && q.includeInactive ? {} : { isActive: true }) },
    include,
    orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toItem);
}

function data(input: CreateProductInput) {
  return {
    name: input.name,
    sku: input.sku,
    category: input.category,
    packSize: input.packSize,
    unitsPerCase: input.unitsPerCase,
    mrp: new Prisma.Decimal(input.mrp),
    ssPrice: new Prisma.Decimal(input.ssPrice),
    distributorPrice: new Prisma.Decimal(input.distributorPrice),
    retailerPrice: new Prisma.Decimal(input.retailerPrice),
    isActive: input.isActive,
  };
}

const duplicateSku = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export async function create(input: CreateProductInput, actorId: string): Promise<ProductItem> {
  try {
    const row = await prisma.product.create({ data: data(input), include });
    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      entity: 'Product',
      entityId: row.id,
      after: toItem(row),
    });
    return toItem(row);
  } catch (err) {
    if (duplicateSku(err)) throw ApiException.conflict(`SKU ${input.sku} is already in use`);
    throw err;
  }
}

/**
 * Price changes apply to new orders only: every order line keeps the rate it
 * was priced at, so history and past totals never move.
 */
export async function update(
  id: string,
  input: UpdateProductInput,
  actorId: string,
): Promise<ProductItem> {
  const before = await prisma.product.findFirst({ where: { id, deletedAt: null }, include });
  if (!before) throw ApiException.notFound('Product not found');
  try {
    const row = await prisma.product.update({ where: { id }, data: data(input), include });
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      before: toItem(before),
      after: toItem(row),
    });
    return toItem(row);
  } catch (err) {
    if (duplicateSku(err)) throw ApiException.conflict(`SKU ${input.sku} is already in use`);
    throw err;
  }
}

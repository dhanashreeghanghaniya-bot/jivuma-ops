import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  allowedNextStatuses,
  changeOrderStatusSchema,
  createOrderSchema,
  createProductSchema,
  tierPrices,
} from '@juma/shared';
import { changeStatus, priceLines } from './orders.service';

const prismaMock = vi.hoisted(() => ({
  product: { findMany: vi.fn() },
  order: { findUnique: vi.fn(), updateMany: vi.fn() },
  orderStatusLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/audit', () => ({ writeAuditLog: vi.fn() }));

const D = (v: number) => new Prisma.Decimal(v);
const bhujia = {
  id: 'p_1',
  unitsPerCase: 30,
  ssPrice: D(26.5),
  distributorPrice: D(28.5),
  retailerPrice: D(32),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) =>
    fn(prismaMock),
  );
});

describe('allowedNextStatuses', () => {
  it('moves forward, may skip steps, and can cancel until delivery', () => {
    expect(allowedNextStatuses('PLACED')).toEqual([
      'CONFIRMED',
      'DISPATCHED',
      'DELIVERED',
      'CANCELLED',
    ]);
    expect(allowedNextStatuses('DISPATCHED')).toEqual(['DELIVERED', 'CANCELLED']);
  });

  it('is final after DELIVERED or CANCELLED', () => {
    expect(allowedNextStatuses('DELIVERED')).toEqual([]);
    expect(allowedNextStatuses('CANCELLED')).toEqual([]);
  });
});

describe('createOrderSchema', () => {
  const items = [{ productId: 'p_1', qtyCases: 1 }];
  const issues = (input: unknown) => {
    const r = createOrderSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('needs exactly the two parties of the level', () => {
    expect(issues({ level: 'COMPANY_TO_SS', superStockistId: 'ss', items })).toEqual([]);
    expect(issues({ level: 'SS_TO_DISTRIBUTOR', superStockistId: 'ss', items })).toContain(
      'distributorId: Required for this order level',
    );
    expect(
      issues({ level: 'COMPANY_TO_SS', superStockistId: 'ss', retailerId: 'r', items }),
    ).toContain('retailerId: Not part of this order level');
  });

  it('rejects the same product twice', () => {
    expect(
      issues({ level: 'COMPANY_TO_SS', superStockistId: 'ss', items: [...items, ...items] }),
    ).toContain('items: Each product once per order');
  });
});

describe('changeOrderStatusSchema', () => {
  it('demands a reason to cancel', () => {
    expect(changeOrderStatusSchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
    expect(
      changeOrderStatusSchema.safeParse({ status: 'CANCELLED', note: 'Out of stock' }).success,
    ).toBe(true);
    expect(changeOrderStatusSchema.safeParse({ status: 'CONFIRMED' }).success).toBe(true);
  });
});

describe('createProductSchema', () => {
  const base = {
    name: 'Juma Aloo Bhujia',
    sku: 'jf-abj-150',
    category: 'Namkeen',
    packSize: '150 g',
    unitsPerCase: 30,
    mrp: 100,
    retailMargin: 20,
    distributorMargin: 8,
    ssMargin: 5,
  };

  it('upper-cases the SKU', () => {
    expect(createProductSchema.parse(base).sku).toBe('JF-ABJ-150');
  });

  it('rejects a margin of 100% or more', () => {
    expect(createProductSchema.safeParse({ ...base, ssMargin: 100 }).success).toBe(false);
  });

  it('takes each margin off the price above it', () => {
    expect(tierPrices(base)).toEqual({
      retailerPrice: 80,
      distributorPrice: 73.6,
      ssPrice: 69.92,
    });
  });
});

describe('priceLines', () => {
  beforeEach(() => prismaMock.product.findMany.mockResolvedValue([bhujia]));

  it('prices each level at its own tier: cases x units per case + loose units', async () => {
    const lines = [{ productId: 'p_1', qtyCases: 2, qtyUnits: 5 }]; // 65 units
    expect((await priceLines('COMPANY_TO_SS', lines)).total.toFixed(2)).toBe('1722.50');
    expect((await priceLines('SS_TO_DISTRIBUTOR', lines)).total.toFixed(2)).toBe('1852.50');
    expect((await priceLines('DISTRIBUTOR_TO_RETAILER', lines)).total.toFixed(2)).toBe('2080.00');
  });

  it('records the rate it used on each line', async () => {
    const { items } = await priceLines('SS_TO_DISTRIBUTOR', [
      { productId: 'p_1', qtyCases: 1, qtyUnits: 0 },
    ]);
    expect(items[0]).toMatchObject({ rate: D(28.5), qtyCases: 1, qtyUnits: 0 });
    expect(items[0]!.amount.toFixed(2)).toBe('855.00');
  });

  it('refuses an inactive or unknown product', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    await expect(
      priceLines('COMPANY_TO_SS', [{ productId: 'p_x', qtyCases: 1, qtyUnits: 0 }]),
    ).rejects.toMatchObject({
      message: 'One or more products are not available',
    });
  });
});

describe('changeStatus', () => {
  it('refuses a move the flow does not allow', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: 'o_1', status: 'DELIVERED' });
    await expect(
      changeStatus('o_1', { status: 'CANCELLED', note: 'x' }, 'admin'),
    ).rejects.toMatchObject({
      message: 'An order that is delivered cannot become cancelled',
    });
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('loses cleanly to a concurrent change and writes no log', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: 'o_1', status: 'PLACED' });
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(changeStatus('o_1', { status: 'CONFIRMED' }, 'admin')).rejects.toMatchObject({
      message: 'Someone else just changed this order. Reload it.',
    });
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o_1', status: 'PLACED' },
      data: { status: 'CONFIRMED' },
    });
    expect(prismaMock.orderStatusLog.create).not.toHaveBeenCalled();
  });
});

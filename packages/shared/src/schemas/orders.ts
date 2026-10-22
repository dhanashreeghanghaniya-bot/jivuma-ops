import { z } from 'zod';
import { OrderLevel, OrderStatus, enumValues } from '../enums';
import { idSchema, paginationQuerySchema } from './common';
import { orderLineSchema } from './field';

export const orderLevelSchema = z.enum(enumValues(OrderLevel) as [OrderLevel, ...OrderLevel[]]);
export const orderStatusSchema = z.enum(enumValues(OrderStatus) as [OrderStatus, ...OrderStatus[]]);

/** The happy path, in order (SPEC 2.3). CANCELLED sits outside it. */
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.CONFIRMED,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

/** Goods already delivered cannot be cancelled; anything before that can. */
const CANCELLABLE: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.CONFIRMED,
  OrderStatus.DISPATCHED,
];

/**
 * Where an order may go from its current status: any later step on the path
 * (a step can be skipped, e.g. recording a delivery that was never confirmed),
 * or CANCELLED. Never backwards, and nothing after DELIVERED or CANCELLED.
 */
export function allowedNextStatuses(current: OrderStatus): OrderStatus[] {
  const index = ORDER_STATUS_FLOW.indexOf(current);
  const forward = index === -1 ? [] : ORDER_STATUS_FLOW.slice(index + 1);
  return CANCELLABLE.includes(current) ? [...forward, OrderStatus.CANCELLED] : forward;
}

/** Which product price each level of the chain buys at. */
export const PRICE_TIER: Record<OrderLevel, 'ssPrice' | 'distributorPrice' | 'retailerPrice'> = {
  COMPANY_TO_SS: 'ssPrice',
  SS_TO_DISTRIBUTOR: 'distributorPrice',
  DISTRIBUTOR_TO_RETAILER: 'retailerPrice',
};

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const createOrderSchema = z
  .object({
    level: orderLevelSchema,
    superStockistId: idSchema.nullish(),
    distributorId: idSchema.nullish(),
    retailerId: idSchema.nullish(),
    items: z.array(orderLineSchema).min(1, 'Add at least one product').max(100),
    expectedDelivery: z
      .union([z.literal(''), dateOnly])
      .transform((v) => v || null)
      .nullish(),
    notes: z
      .string()
      .trim()
      .max(1000)
      .transform((v) => v || null)
      .nullish(),
  })
  .superRefine((v, ctx) => {
    // Each level names exactly the two parties at its ends (SPEC 2.3).
    const needs: Record<OrderLevel, ('superStockistId' | 'distributorId' | 'retailerId')[]> = {
      COMPANY_TO_SS: ['superStockistId'],
      SS_TO_DISTRIBUTOR: ['superStockistId', 'distributorId'],
      DISTRIBUTOR_TO_RETAILER: ['distributorId', 'retailerId'],
    };
    const required = needs[v.level];
    for (const key of ['superStockistId', 'distributorId', 'retailerId'] as const) {
      if (required.includes(key) && !v[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Required for this order level',
        });
      }
      if (!required.includes(key) && v[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Not part of this order level',
        });
      }
    }
    const ids = v.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Each product once per order',
      });
    }
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const changeOrderStatusSchema = z
  .object({
    status: orderStatusSchema,
    note: z
      .string()
      .trim()
      .max(500)
      .transform((v) => v || null)
      .nullish(),
  })
  .refine((v) => v.status !== OrderStatus.CANCELLED || Boolean(v.note), {
    path: ['note'],
    message: 'Say why the order is cancelled',
  });
export type ChangeOrderStatusInput = z.infer<typeof changeOrderStatusSchema>;

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(60).optional(),
  level: orderLevelSchema.optional(),
  status: orderStatusSchema.optional(),
  superStockistId: idSchema.optional(),
  distributorId: idSchema.optional(),
  retailerId: idSchema.optional(),
  /** District of the receiving party. */
  districtId: idSchema.optional(),
  takenBySalesmanId: idSchema.optional(),
  /** Inclusive IST dates on the order date. */
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// --- products ----------------------------------------------------------------

const money = z.coerce.number().min(0, 'Cannot be negative').max(9_999_999);

export const createProductSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(120),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,40}$/, 'Letters, digits and dashes only'),
    category: z.string().trim().min(2, 'Category is required').max(60),
    packSize: z.string().trim().min(1, 'Pack size is required').max(40),
    unitsPerCase: z.coerce.number().int().min(1).max(1000),
    mrp: money,
    ssPrice: money,
    distributorPrice: money,
    retailerPrice: money,
    isActive: z.boolean().default(true),
  })
  // Each step down the chain must leave the next one a margin, and MRP caps it all.
  .refine((p) => p.ssPrice <= p.distributorPrice, {
    path: ['distributorPrice'],
    message: 'Distributor price cannot be below the SS price',
  })
  .refine((p) => p.distributorPrice <= p.retailerPrice, {
    path: ['retailerPrice'],
    message: 'Retailer price cannot be below the distributor price',
  })
  .refine((p) => p.retailerPrice <= p.mrp, {
    path: ['mrp'],
    message: 'MRP cannot be below the retailer price',
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema;
export type UpdateProductInput = CreateProductInput;

export const listProductsQuerySchema = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

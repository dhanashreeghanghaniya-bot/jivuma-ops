import { describe, expect, it } from 'vitest';
import { createVisitSchema, presignUploadSchema, storagePathSchema } from '@juma/shared';
import { assertOwnPath, objectPath } from '../../lib/storage';

const base = {
  clientUuid: '6f1c0f4e-8c1b-4f7a-9a4e-2d3c4b5a6f70',
  workDayId: 'day_1',
  townId: 'town_1',
  checkIn: { lat: 22.3, lng: 70.8, accuracyM: 12, capturedAt: '2026-10-22T05:00:00.000Z' },
};
const order = { distributorId: 'dist_1', items: [{ productId: 'p_1', qtyCases: 2 }] };
const newShop = {
  shopName: 'Shree Kirana',
  ownerName: 'Ramesh Patel',
  phone: '98123 45678',
  address: 'Station Road',
  lat: 22.3,
  lng: 70.8,
  distributorId: 'dist_1',
};

const messages = (input: unknown) => {
  const result = createVisitSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('createVisitSchema', () => {
  it('accepts an order taken at an existing shop', () => {
    expect(messages({ ...base, retailerId: 'r_1', outcome: 'ORDER_TAKEN', order })).toEqual([]);
  });

  it('needs exactly one of an existing shop or a new one', () => {
    expect(messages({ ...base, outcome: 'SHOP_CLOSED' })).toContain(
      'Pick an existing shop or add a new one',
    );
    expect(messages({ ...base, retailerId: 'r_1', newShop, outcome: 'NEW_SHOP_ADDED' })).toContain(
      'Pick an existing shop or add a new one',
    );
  });

  it('ties the order to the ORDER_TAKEN outcome both ways', () => {
    const msg = 'An order goes with the "Order taken" outcome, and only with it';
    expect(messages({ ...base, retailerId: 'r_1', outcome: 'ORDER_TAKEN' })).toContain(msg);
    expect(messages({ ...base, retailerId: 'r_1', outcome: 'FOLLOW_UP', order })).toContain(msg);
  });

  it('demands a reason for no order', () => {
    expect(messages({ ...base, retailerId: 'r_1', outcome: 'NO_ORDER' })).toContain(
      'Say why there was no order',
    );
  });

  it('rejects an order line with zero quantity', () => {
    const empty = {
      distributorId: 'dist_1',
      items: [{ productId: 'p_1', qtyCases: 0, qtyUnits: 0 }],
    };
    expect(
      messages({ ...base, retailerId: 'r_1', outcome: 'ORDER_TAKEN', order: empty }),
    ).toContain('Quantity must be more than zero');
  });

  it('normalises a new shop phone to E.164', () => {
    const parsed = createVisitSchema.parse({ ...base, newShop, outcome: 'NEW_SHOP_ADDED' });
    expect(parsed.newShop?.phone).toBe('+919812345678');
    expect(parsed.newShop?.category).toBe('KIRANA');
  });

  it('requires a real client UUID for idempotency', () => {
    expect(
      messages({ ...base, clientUuid: 'abc', retailerId: 'r_1', outcome: 'SHOP_CLOSED' }),
    ).toContain('Invalid client id');
  });
});

describe('storage paths', () => {
  it('builds the SPEC folder layout in IST months', () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in India.
    expect(objectPath('visits', 'user_1', 'abc-1', new Date('2026-10-31T20:00:00.000Z'))).toBe(
      'visits/user_1/2026-11/abc-1.jpg',
    );
  });

  it('lets a salesman reference only his own folder', () => {
    expect(() => assertOwnPath('visits/user_1/2026-10/a.jpg', 'visits', 'user_1')).not.toThrow();
    expect(() => assertOwnPath('visits/user_2/2026-10/a.jpg', 'visits', 'user_1')).toThrow(
      'That file does not belong to you',
    );
    expect(() => assertOwnPath('bills/user_1/2026-10/a.jpg', 'visits', 'user_1')).toThrow();
  });

  it('rejects traversal and odd characters in paths and keys', () => {
    expect(storagePathSchema.safeParse('visits/user_1/2026-10/../x.jpg').success).toBe(false);
    expect(storagePathSchema.safeParse('visits/user_1/2026-10/a.jpg').success).toBe(true);
    expect(presignUploadSchema.safeParse({ kind: 'visits', key: '../etc' }).success).toBe(false);
    expect(presignUploadSchema.safeParse({ kind: 'avatars', key: 'a' }).success).toBe(false);
  });
});

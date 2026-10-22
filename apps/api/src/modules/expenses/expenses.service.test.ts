import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  createExpenseSchema,
  daFor,
  reviewExpenseSchema,
  reviewWorkDaySchema,
  taFor,
  type AllowanceRates,
} from '@juma/shared';
import { assessClaim, review, type ClaimContext } from './expenses.service';

const prismaMock = vi.hoisted(() => ({
  expenseClaim: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/audit', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../notifications/notifications.service', () => ({
  notify: vi.fn(),
  notifyReviewers: vi.fn(),
}));

const rates: AllowanceRates = {
  daHq: 200,
  daExHq: 300,
  daOutstation: 500,
  taPerKmBike: 4,
  taPerKmCar: 10,
  taPerKmAuto: 6,
  maxLodgingPerNight: 900,
  monthlyPhoneAllowance: 300,
  publicTransportNeedsBill: true,
  daRequiresVisit: true,
};

const ctx = (over: Partial<ClaimContext> = {}): ClaimContext => ({
  rates,
  day: { dayType: 'HQ', visits: 3, totalKm: 40 },
  otherPhoneThisMonth: 0,
  sameKindSameDay: 0,
  ...over,
});
const claim = (over: Partial<Parameters<typeof assessClaim>[0]> = {}) => ({
  category: 'MISC' as const,
  travelMode: null,
  km: null,
  amountClaimed: 100,
  billCount: 0,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('daFor', () => {
  it('pays by day type', () => {
    expect(daFor(rates, 'HQ', 2)).toBe(200);
    expect(daFor(rates, 'EX_HQ', 2)).toBe(300);
    expect(daFor(rates, 'OUTSTATION', 2)).toBe(500);
  });

  it('pays nothing on leave or a holiday', () => {
    expect(daFor(rates, 'LEAVE', 5)).toBe(0);
    expect(daFor(rates, 'HOLIDAY', 5)).toBe(0);
  });

  it('pays nothing for a day without visits, only when the policy says so', () => {
    expect(daFor(rates, 'HQ', 0)).toBe(0);
    expect(daFor({ ...rates, daRequiresVisit: false }, 'HQ', 0)).toBe(200);
  });
});

describe('taFor', () => {
  it('is km x the vehicle rate', () => {
    expect(taFor(rates, 'BIKE', 42.5)).toBe(170);
    expect(taFor(rates, 'CAR', 12.34)).toBe(123.4);
  });

  it('has no formula for bus or train, which are paid at actuals', () => {
    expect(taFor(rates, 'BUS', 50)).toBeNull();
    expect(taFor(rates, 'TRAIN', 50)).toBeNull();
  });
});

describe('assessClaim', () => {
  it('caps DA at the day-type rate and flags anything above', () => {
    expect(assessClaim(claim({ category: 'DA', amountClaimed: 200 }), ctx())).toEqual({
      limit: 200,
      flags: [],
    });
    expect(assessClaim(claim({ category: 'DA', amountClaimed: 250 }), ctx()).flags).toContain(
      'OVER_LIMIT',
    );
  });

  it('allows no DA for a zero-visit day', () => {
    const r = assessClaim(
      claim({ category: 'DA', amountClaimed: 200 }),
      ctx({ day: { dayType: 'HQ', visits: 0, totalKm: 0 } }),
    );
    expect(r).toEqual({ limit: 0, flags: ['OVER_LIMIT'] });
  });

  it('caps own-vehicle TA at km x rate, and flags km above the day', () => {
    expect(
      assessClaim(claim({ category: 'TA', travelMode: 'BIKE', km: 40, amountClaimed: 160 }), ctx()),
    ).toEqual({
      limit: 160,
      flags: [],
    });
    expect(
      assessClaim(claim({ category: 'TA', travelMode: 'BIKE', km: 60, amountClaimed: 240 }), ctx())
        .flags,
    ).toEqual(['KM_ABOVE_DAY']);
  });

  it('wants a bill for bus/train when the policy says so, with no ceiling', () => {
    expect(
      assessClaim(claim({ category: 'TA', travelMode: 'BUS', amountClaimed: 85 }), ctx()),
    ).toEqual({
      limit: null,
      flags: ['BILL_MISSING'],
    });
    expect(
      assessClaim(
        claim({ category: 'TA', travelMode: 'BUS', amountClaimed: 85, billCount: 1 }),
        ctx(),
      ).flags,
    ).toEqual([]);
    const relaxed = ctx({ rates: { ...rates, publicTransportNeedsBill: false } });
    expect(
      assessClaim(claim({ category: 'TA', travelMode: 'TRAIN', amountClaimed: 85 }), relaxed).flags,
    ).toEqual([]);
  });

  it('caps lodging per night and flags a second one the same day', () => {
    expect(assessClaim(claim({ category: 'LODGING', amountClaimed: 1250 }), ctx()).flags).toEqual([
      'OVER_LIMIT',
    ]);
    expect(
      assessClaim(claim({ category: 'LODGING', amountClaimed: 800 }), ctx({ sameKindSameDay: 1 }))
        .flags,
    ).toEqual(['DUPLICATE']);
  });

  it('caps phone at what is left of the monthly allowance', () => {
    const r = assessClaim(
      claim({ category: 'PHONE', amountClaimed: 150 }),
      ctx({ otherPhoneThisMonth: 200 }),
    );
    expect(r).toEqual({ limit: 100, flags: ['OVER_LIMIT'] });
  });

  it('sets no ceiling on food and misc', () => {
    expect(assessClaim(claim({ category: 'FOOD', amountClaimed: 9999 }), ctx())).toEqual({
      limit: null,
      flags: [],
    });
  });

  it('has no limit when no policy covers the date', () => {
    expect(
      assessClaim(claim({ category: 'LODGING', amountClaimed: 5000 }), ctx({ rates: null })),
    ).toEqual({
      limit: null,
      flags: [],
    });
  });
});

describe('claim and review schemas', () => {
  const base = {
    clientUuid: '6f1c0f4e-8c1b-4f7a-9a4e-2d3c4b5a6f70',
    date: '2026-10-22',
    amountClaimed: 120,
  };
  const messages = (input: unknown) => {
    const r = createExpenseSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('never lets DA be claimed by hand', () => {
    expect(messages({ ...base, category: 'DA' })).toContain(
      'DA is worked out from your day; it cannot be claimed by hand',
    );
  });

  it('needs a travel mode for TA, and only for TA', () => {
    expect(messages({ ...base, category: 'TA' })).toContain('How did you travel?');
    expect(messages({ ...base, category: 'FOOD', travelMode: 'BUS' })).toContain(
      'Only TA has a travel mode',
    );
  });

  it('needs a date when not tied to a day', () => {
    expect(messages({ ...base, date: undefined, category: 'FOOD' })).toContain('Pick the date');
  });

  it('needs a reason and an amount for a partial approval, a reason for a rejection', () => {
    expect(reviewExpenseSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
    expect(reviewExpenseSchema.safeParse({ decision: 'REJECT' }).success).toBe(false);
    expect(reviewExpenseSchema.safeParse({ decision: 'PARTIAL', remark: 'Cap' }).success).toBe(
      false,
    );
    expect(
      reviewExpenseSchema.safeParse({ decision: 'PARTIAL', amountApproved: 900, remark: 'Cap' })
        .success,
    ).toBe(true);
    expect(reviewWorkDaySchema.safeParse({ decision: 'REOPEN' }).success).toBe(false);
  });
});

describe('review', () => {
  const submitted = {
    id: 'e1',
    salesmanId: 's1',
    status: 'SUBMITTED',
    amountClaimed: new Prisma.Decimal(1250),
  };

  it('refuses a partial approval that is not less than the claim', async () => {
    prismaMock.expenseClaim.findUnique.mockResolvedValue(submitted);
    await expect(
      review('e1', { decision: 'PARTIAL', amountApproved: 1250, remark: 'x' }, 'admin'),
    ).rejects.toMatchObject({
      message: 'A partial approval must be less than the amount claimed',
    });
    expect(prismaMock.expenseClaim.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to review a claim that is not submitted', async () => {
    prismaMock.expenseClaim.findUnique.mockResolvedValue({ ...submitted, status: 'APPROVED' });
    await expect(review('e1', { decision: 'APPROVE' }, 'admin')).rejects.toMatchObject({
      message: 'Only a submitted expense can be reviewed',
    });
  });

  it('loses cleanly to a concurrent review', async () => {
    prismaMock.expenseClaim.findUnique.mockResolvedValue(submitted);
    prismaMock.expenseClaim.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      review('e1', { decision: 'REJECT', remark: 'No bill' }, 'admin'),
    ).rejects.toMatchObject({
      message: 'Someone else just reviewed this expense. Reload it.',
    });
    expect(prismaMock.expenseClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'e1', status: 'SUBMITTED' } }),
    );
  });
});

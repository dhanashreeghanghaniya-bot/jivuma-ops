import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { allowedReportMoves, incentiveSchema, salaryStructureSchema } from '@juma/shared';
import { monthBounds, totalsFor, type CostFigures } from './payroll.service';

vi.mock('../../lib/prisma', () => ({ prisma: {} }));

const D = (v: number) => new Prisma.Decimal(v);
const figures = (over: Partial<CostFigures> = {}): CostFigures => ({
  workingDays: 22,
  leaves: 1,
  salary: D(27000),
  taTotal: D(3120.5),
  daTotal: D(5200),
  otherExpenses: D(900),
  incentives: D(2500),
  ordersCount: 30,
  orderValue: D(450000),
  visitsCount: 90,
  newRetailers: 3,
  ...over,
});

describe('totalsFor', () => {
  it('is salary + TA + DA + other + incentives - deductions', () => {
    const { grandTotal } = totalsFor(figures(), D(1000));
    expect(grandTotal.toFixed(2)).toBe('37720.50');
  });

  it('works out cost to sales on the grand total', () => {
    const { costToSalesRatio } = totalsFor(figures(), D(0));
    // 38720.50 / 450000
    expect(costToSalesRatio?.toFixed(4)).toBe('0.0860');
  });

  it('has no cost-to-sales ratio without sales', () => {
    expect(totalsFor(figures({ orderValue: D(0) }), D(0)).costToSalesRatio).toBeNull();
  });
});

describe('monthBounds', () => {
  it('knows month lengths, leap years included', () => {
    expect(monthBounds('2026-10')).toEqual({ first: '2026-10-01', last: '2026-10-31' });
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthBounds('2028-02').last).toBe('2028-02-29');
  });
});

describe('report status', () => {
  it('runs DRAFT -> FINAL -> PAID, FINAL can step back, PAID is final', () => {
    expect(allowedReportMoves('DRAFT')).toEqual(['FINAL']);
    expect(allowedReportMoves('FINAL')).toEqual(['PAID', 'DRAFT']);
    expect(allowedReportMoves('PAID')).toEqual([]);
  });
});

describe('payroll schemas', () => {
  it('rejects negative salary parts and a reasonless incentive', () => {
    expect(
      salaryStructureSchema.safeParse({
        salesmanId: 'u',
        basic: -1,
        hra: 0,
        fixedAllowance: 0,
        effectiveFrom: '2026-10-01',
      }).success,
    ).toBe(false);
    expect(
      incentiveSchema.safeParse({ salesmanId: 'u', month: '2026-10', amount: 500, reason: '' })
        .success,
    ).toBe(false);
    expect(
      incentiveSchema.safeParse({
        salesmanId: 'u',
        month: '2026-13',
        amount: 500,
        reason: 'Target',
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { salesReportQuerySchema } from '@juma/shared';
import { momChange, monthsBetween, shiftMonth } from './analytics.service';

vi.mock('../../lib/prisma', () => ({ prisma: {} }));

describe('month helpers', () => {
  it('lists months across a year end', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(monthsBetween('2026-10', '2026-10')).toEqual(['2026-10']);
  });

  it('shifts months both ways', () => {
    expect(shiftMonth('2026-03', -5)).toBe('2025-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('momChange', () => {
  const months = ['2026-08', '2026-09', '2026-10'];
  it('is the last month over the one before', () => {
    expect(momChange({ '2026-09': '100000.00', '2026-10': '112000.00' }, months)).toBe(0.12);
    expect(momChange({ '2026-09': '200.00', '2026-10': '50.00' }, months)).toBe(-0.75);
  });

  it('is unknown without a base month', () => {
    expect(momChange({ '2026-10': '500.00' }, months)).toBeNull();
    expect(momChange({ '2026-10': '500.00' }, ['2026-10'])).toBeNull();
  });
});

describe('salesReportQuerySchema', () => {
  it('defaults to secondary sales by district', () => {
    expect(salesReportQuerySchema.parse({})).toMatchObject({
      groupBy: 'district',
      level: 'DISTRIBUTOR_TO_RETAILER',
    });
  });

  it('rejects a reversed or over-long range', () => {
    expect(salesReportQuerySchema.safeParse({ from: '2026-10', to: '2026-01' }).success).toBe(
      false,
    );
    expect(salesReportQuerySchema.safeParse({ from: '2024-01', to: '2026-01' }).success).toBe(
      false,
    );
    expect(salesReportQuerySchema.safeParse({ from: '2025-02', to: '2026-01' }).success).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { beatSchema, rangeQuerySchema } from '@juma/shared';
import { findGaps } from './salesteam.service';

vi.mock('../../lib/prisma', () => ({ prisma: {} }));

const at = (hhmm: string) => ({ at: new Date(`2026-10-20T${hhmm}:00+05:30`) });

describe('findGaps', () => {
  const start = at('09:00').at;
  const end = at('19:00').at;

  it('flags only gaps longer than two hours', () => {
    const points = [at('09:00'), at('09:10'), at('11:10'), at('13:30'), at('19:00')];
    const gaps = findGaps(points, start, end);
    expect(gaps).toHaveLength(2);
    // 11:10 -> 13:30 and 13:30 -> 19:00; 09:10 -> 11:10 is exactly two hours.
    expect(gaps[0]!.from.toISOString()).toBe(at('11:10').at.toISOString());
    expect(gaps[1]!.to.toISOString()).toBe(at('19:00').at.toISOString());
  });

  it('treats exactly two hours as fine', () => {
    expect(findGaps([at('09:00'), at('11:00')], start, end)).toHaveLength(0);
  });

  it('ignores positions outside the working day', () => {
    // A ping the night before and one after End Day must not create a gap.
    const day = ['09:00', '10:30', '12:00', '13:45', '15:30', '17:15', '19:00'].map(at);
    expect(findGaps([at('06:00'), ...day, at('23:00')], start, end)).toHaveLength(0);
  });
});

describe('sales-team schemas', () => {
  it('limits a range to three months, in order', () => {
    expect(rangeQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-31' }).success).toBe(true);
    expect(rangeQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' }).success).toBe(
      false,
    );
    expect(rangeQuerySchema.safeParse({ from: '2026-01-01', to: '2026-10-01' }).success).toBe(
      false,
    );
  });

  it('needs a named beat with at least one shop and a real weekday', () => {
    expect(
      beatSchema.safeParse({ name: 'Rajkot city', dayOfWeek: 1, retailerIds: ['r1'] }).success,
    ).toBe(true);
    expect(beatSchema.safeParse({ name: 'Rajkot city', retailerIds: [] }).success).toBe(false);
    expect(
      beatSchema.safeParse({ name: 'Rajkot city', dayOfWeek: 8, retailerIds: ['r1'] }).success,
    ).toBe(false);
  });
});

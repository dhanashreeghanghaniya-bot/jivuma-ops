import { describe, expect, it } from 'vitest';
import { deriveCoverageStatus } from './coverage.service';

const counts = (over: Partial<Parameters<typeof deriveCoverageStatus>[0]> = {}) => ({
  activeDistributors: 0,
  activeSuperStockists: 0,
  openLeads: 0,
  ...over,
});

describe('deriveCoverageStatus', () => {
  it('is COVERED as soon as there is an active distributor', () => {
    expect(deriveCoverageStatus(counts({ activeDistributors: 1 }))).toBe('COVERED');
  });

  it('prefers COVERED over the weaker states', () => {
    expect(
      deriveCoverageStatus(counts({ activeDistributors: 1, activeSuperStockists: 2, openLeads: 5 })),
    ).toBe('COVERED');
  });

  it('is SS_ONLY with a super stockist but no distributor', () => {
    expect(deriveCoverageStatus(counts({ activeSuperStockists: 1, openLeads: 3 }))).toBe('SS_ONLY');
  });

  it('is LEADS_ONLY when only leads are open', () => {
    expect(deriveCoverageStatus(counts({ openLeads: 1 }))).toBe('LEADS_ONLY');
  });

  it('is UNTOUCHED with nothing at all', () => {
    expect(deriveCoverageStatus(counts())).toBe('UNTOUCHED');
  });

  it('ignores inactive partners, which the caller excludes from the counts', () => {
    // A district whose only distributor went ON_HOLD falls back to its leads.
    expect(deriveCoverageStatus(counts({ activeDistributors: 0, openLeads: 2 }))).toBe('LEADS_ONLY');
  });
});

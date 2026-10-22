import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadStage, LeadType } from '@prisma/client';
import { convert } from './leads.convert';

// `vi.mock` is hoisted above the imports, so the converter receives these stubs
// instead of a real database client and the real partner services.
const prismaMock = vi.hoisted(() => ({
  lead: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  leadActivity: { create: vi.fn() },
}));
const partners = vi.hoisted(() => ({
  superStockists: { create: vi.fn() },
  distributors: { create: vi.fn() },
  retailers: { create: vi.fn() },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/audit', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../partners/superStockists.service', () => partners.superStockists);
vi.mock('../partners/distributors.service', () => partners.distributors);
vi.mock('../partners/retailers.service', () => partners.retailers);

const wonLead = (over: Record<string, unknown> = {}) => ({
  id: 'lead_1',
  type: LeadType.DISTRIBUTOR,
  name: 'Hitesh Shah',
  firmName: 'Shah Traders',
  phone: '+919812300099',
  townId: 'town_1',
  districtId: 'district_1',
  stage: LeadStage.WON,
  convertedAt: null,
  notes: null,
  town: { id: 'town_1', name: 'Anand' },
  ...over,
});

const address = 'Station Road, Anand';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.lead.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.lead.update.mockResolvedValue({});
  prismaMock.leadActivity.create.mockResolvedValue({});
  partners.superStockists.create.mockResolvedValue({ id: 'ss_new', firmName: 'Shah Traders' });
  partners.distributors.create.mockResolvedValue({ id: 'dist_new', firmName: 'Shah Traders' });
  partners.retailers.create.mockResolvedValue({ id: 'ret_new', shopName: 'Shah Traders' });
});

describe('convert lead to partner', () => {
  it('refuses a missing lead', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(null);
    await expect(convert('lead_x', { address }, 'admin_1')).rejects.toMatchObject({
      message: 'Lead not found',
    });
  });

  it('refuses a lead that is not WON', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead({ stage: LeadStage.NEGOTIATION }));
    await expect(convert('lead_1', { address }, 'admin_1')).rejects.toMatchObject({
      message: 'Only a WON lead can be converted',
    });
    expect(partners.distributors.create).not.toHaveBeenCalled();
  });

  it('refuses a lead that was already converted', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead({ convertedAt: new Date() }));
    await expect(convert('lead_1', { address }, 'admin_1')).rejects.toMatchObject({
      message: 'This lead has already been converted',
    });
  });

  it('creates only one partner when two converts race past the first check', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead());
    prismaMock.lead.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const input = { address, superStockistId: 'ss_1' };

    const results = await Promise.allSettled([
      convert('lead_1', input, 'admin_1'),
      convert('lead_1', input, 'admin_1'),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(partners.distributors.create).toHaveBeenCalledTimes(1);
  });

  it('turns an SS lead into a super stockist covering its own district', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead({ type: LeadType.SS }));

    const result = await convert('lead_1', { address }, 'admin_1');

    expect(partners.superStockists.create).toHaveBeenCalledWith(
      expect.objectContaining({
        firmName: 'Shah Traders',
        ownerName: 'Hitesh Shah',
        phone: '+919812300099',
        coveredDistrictIds: ['district_1'],
        status: 'ACTIVE',
      }),
      'admin_1',
    );
    expect(result).toEqual({
      leadId: 'lead_1',
      partnerType: LeadType.SS,
      partnerId: 'ss_new',
      partnerName: 'Shah Traders',
    });
    expect(prismaMock.leadActivity.create).toHaveBeenCalledOnce();
  });

  it('requires a super stockist for a distributor and writes nothing without one', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead());
    await expect(convert('lead_1', { address }, 'admin_1')).rejects.toMatchObject({
      message: 'Pick the super stockist this distributor will buy from',
    });
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it('turns a distributor lead into a distributor covering its own town', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead());

    await convert('lead_1', { address, superStockistId: 'ss_1' }, 'admin_1');

    expect(partners.distributors.create).toHaveBeenCalledWith(
      expect.objectContaining({ superStockistId: 'ss_1', coveredTownIds: ['town_1'] }),
      'admin_1',
    );
  });

  it('requires a distributor and a map location for a shop', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead({ type: LeadType.RETAILER }));

    await expect(
      convert('lead_1', { address, lat: 22.5, lng: 72.9 }, 'admin_1'),
    ).rejects.toMatchObject({ message: 'Pick the distributor that will supply this shop' });
    await expect(
      convert('lead_1', { address, distributorId: 'dist_1' }, 'admin_1'),
    ).rejects.toMatchObject({ message: 'A shop needs a location on the map' });
    expect(partners.retailers.create).not.toHaveBeenCalled();
  });

  it('uses the overrides over the lead details for a shop', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead({ type: LeadType.RETAILER }));

    await convert(
      'lead_1',
      { address, distributorId: 'dist_1', lat: 22.5, lng: 72.9, firmName: 'Shah Kirana' },
      'admin_1',
    );

    expect(partners.retailers.create).toHaveBeenCalledWith(
      expect.objectContaining({ shopName: 'Shah Kirana', distributorId: 'dist_1', lat: 22.5 }),
      'admin_1',
    );
  });

  it('releases the claim when the partner is rejected, so the admin can retry', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(wonLead());
    partners.distributors.create.mockRejectedValue(new Error('Super stockist not found'));

    await expect(
      convert('lead_1', { address, superStockistId: 'ss_missing' }, 'admin_1'),
    ).rejects.toThrow('Super stockist not found');

    expect(prismaMock.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { convertedAt: null },
    });
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });
});

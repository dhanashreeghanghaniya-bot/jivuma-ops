import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadStage } from '@prisma/client';
import { changeLeadStageSchema, createLeadActivitySchema } from '@juma/shared';
import { changeStage } from './leads.service';

const prismaMock = vi.hoisted(() => ({
  lead: { findFirst: vi.fn(), update: vi.fn() },
  leadActivity: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/audit', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../partners/partners.shared', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  refreshCoverage: vi.fn(),
}));

const lead = (over: Record<string, unknown> = {}) => ({
  id: 'lead_1',
  stage: LeadStage.NEGOTIATION,
  districtId: 'district_1',
  convertedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockResolvedValue([]);
  prismaMock.lead.update.mockReturnValue('update-op');
  prismaMock.leadActivity.create.mockReturnValue('activity-op');
});

describe('changeLeadStageSchema', () => {
  it('demands a reason when a lead is lost', () => {
    expect(changeLeadStageSchema.safeParse({ stage: 'LOST' }).success).toBe(false);
    expect(changeLeadStageSchema.safeParse({ stage: 'LOST', lostReason: '   ' }).success).toBe(
      false,
    );
    expect(changeLeadStageSchema.safeParse({ stage: 'LOST', lostReason: 'Price' }).success).toBe(
      true,
    );
  });

  it('needs no reason for any other stage', () => {
    expect(changeLeadStageSchema.safeParse({ stage: 'WON' }).success).toBe(true);
  });
});

describe('createLeadActivitySchema', () => {
  it('never lets a client post a stage change entry', () => {
    expect(
      createLeadActivitySchema.safeParse({ type: 'STAGE_CHANGE', note: 'Moved' }).success,
    ).toBe(false);
  });

  it('treats a cleared follow-up date as null', () => {
    const parsed = createLeadActivitySchema.parse({ type: 'CALL', note: 'Rang', followUpAt: '' });
    expect(parsed.followUpAt).toBeNull();
  });
});

describe('changeStage', () => {
  // getById runs after the write; failing it stops the test at the point of interest.
  const stopAfterWrite = () => prismaMock.lead.findFirst.mockResolvedValueOnce(null);

  it('refuses a move to the stage the lead is already in', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(lead());
    await expect(
      changeStage('lead_1', { stage: LeadStage.NEGOTIATION }, 'admin_1'),
    ).rejects.toMatchObject({ message: 'The lead is already at that stage' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to move a converted lead', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(
      lead({ stage: LeadStage.WON, convertedAt: new Date() }),
    );
    await expect(
      changeStage('lead_1', { stage: LeadStage.NEGOTIATION }, 'admin_1'),
    ).rejects.toMatchObject({ message: 'This lead has been converted and can no longer move' });
  });

  it('clears the follow-up and keeps the reason when a lead is lost', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(lead());
    stopAfterWrite();

    await changeStage('lead_1', { stage: LeadStage.LOST, lostReason: 'Price' }, 'admin_1').catch(
      () => undefined,
    );

    expect(prismaMock.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { stage: LeadStage.LOST, lostReason: 'Price', followUpAt: null },
    });
    expect(prismaMock.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'STAGE_CHANGE',
        note: 'Moved from NEGOTIATION to LOST: Price',
      }),
    });
  });

  it('keeps the follow-up and drops any old lost reason when a lead stays open', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(lead({ stage: LeadStage.NEW }));
    stopAfterWrite();

    await changeStage(
      'lead_1',
      { stage: LeadStage.CONTACTED, lostReason: 'stale' },
      'admin_1',
    ).catch(() => undefined);

    expect(prismaMock.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { stage: LeadStage.CONTACTED, lostReason: null },
    });
  });
});

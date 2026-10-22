import { LeadActivityType, LeadStage, LeadType } from '@prisma/client';
import type { ConvertLeadInput, LeadConversionResult } from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import * as distributors from '../partners/distributors.service';
import * as retailers from '../partners/retailers.service';
import * as superStockists from '../partners/superStockists.service';

/**
 * Turns a WON lead into the partner it was always going to become (SPEC 2.2).
 * The partner services are reused verbatim so a converted partner is validated,
 * audited and coverage-refreshed exactly like a hand-entered one.
 */
export async function convert(
  leadId: string,
  input: ConvertLeadInput,
  actorId: string,
): Promise<LeadConversionResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    include: { town: { select: { id: true, name: true } } },
  });
  if (!lead) throw ApiException.notFound('Lead not found');
  if (lead.stage !== LeadStage.WON) {
    throw ApiException.badRequest('Only a WON lead can be converted');
  }
  if (lead.convertedAt) throw ApiException.badRequest('This lead has already been converted');

  if (lead.type === LeadType.DISTRIBUTOR && !input.superStockistId) {
    throw ApiException.badRequest('Pick the super stockist this distributor will buy from');
  }
  if (lead.type === LeadType.RETAILER) {
    if (!input.distributorId) {
      throw ApiException.badRequest('Pick the distributor that will supply this shop');
    }
    if (
      input.lat === null ||
      input.lat === undefined ||
      input.lng === null ||
      input.lng === undefined
    ) {
      throw ApiException.badRequest('A shop needs a location on the map');
    }
  }

  // Claim the lead before creating anything: a double-submitted convert would
  // otherwise pass the `convertedAt` check twice and create two partners.
  const claimed = await prisma.lead.updateMany({
    where: { id: leadId, deletedAt: null, stage: LeadStage.WON, convertedAt: null },
    data: { convertedAt: new Date() },
  });
  if (claimed.count === 0) throw ApiException.badRequest('This lead has already been converted');

  const firmName = input.firmName ?? lead.firmName ?? lead.name;
  const ownerName = input.ownerName ?? lead.name;

  const contact = {
    firmName,
    ownerName,
    phone: lead.phone,
    altPhone: null,
    email: null,
    gstin: null,
    address: input.address,
    townId: lead.townId,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    status: 'ACTIVE' as const,
    notes: lead.notes,
  };

  let partnerId = '';
  let partnerName = '';

  try {
    if (lead.type === LeadType.SS) {
      const created = await superStockists.create(
        // A new super stockist starts with its own district covered.
        { ...contact, coveredDistrictIds: [lead.districtId] },
        actorId,
      );
      partnerId = created.id;
      partnerName = created.firmName;
    } else if (lead.type === LeadType.DISTRIBUTOR) {
      const created = await distributors.create(
        {
          ...contact,
          superStockistId: input.superStockistId!,
          coveredTownIds: [lead.townId],
          creditLimit: null,
          creditDays: null,
        },
        actorId,
      );
      partnerId = created.id;
      partnerName = created.firmName;
    } else {
      const created = await retailers.create(
        {
          shopName: firmName,
          ownerName,
          phone: lead.phone,
          address: input.address,
          townId: lead.townId,
          lat: input.lat!,
          lng: input.lng!,
          distributorId: input.distributorId!,
          category: 'KIRANA',
          photoUrl: null,
        },
        actorId,
      );
      partnerId = created.id;
      partnerName = created.shopName;
    }
  } catch (err) {
    // The partner was rejected (bad super stockist, duplicate phone, ...), so
    // release the claim and let the admin fix the input and retry.
    await prisma.lead.update({ where: { id: leadId }, data: { convertedAt: null } });
    throw err;
  }

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: actorId,
      type: LeadActivityType.STAGE_CHANGE,
      note: `Converted to ${lead.type}: ${partnerName}`,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE',
    entity: 'Lead',
    entityId: leadId,
    after: { convertedTo: lead.type, partnerId },
  });

  return { leadId, partnerType: lead.type, partnerId, partnerName };
}

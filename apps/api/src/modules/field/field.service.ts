import { PartnerStatus, PingSource, Prisma } from '@prisma/client';
import {
  LeadSource,
  LeadStage,
  type FieldBootstrap,
  type FieldLeadInput,
  type FieldLeadResult,
  type PingBatchInput,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { clampDeviceTime } from '../../lib/geo';
import * as leads from '../leads/leads.service';
import { assertTownInTerritory, territoryOf } from './territory';
import { requireWritableDay } from './workdays.service';

const num = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());

/** Everything the phone caches for offline work, scoped to the salesman's territory. */
export async function bootstrap(salesmanId: string): Promise<FieldBootstrap> {
  const territory = await territoryOf(salesmanId);
  const inTowns = { in: territory.townIds };

  const [user, districts, towns, distributors, retailers, products, beats] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: salesmanId },
      select: { id: true, name: true, hqTown: { select: { id: true, name: true } } },
    }),
    prisma.district.findMany({
      where: { id: { in: territory.districtIds } },
      select: { id: true, name: true, nameGu: true },
      orderBy: { name: 'asc' },
    }),
    prisma.town.findMany({
      where: { id: inTowns },
      select: { id: true, name: true, type: true, districtId: true, lat: true, lng: true },
      orderBy: { name: 'asc' },
    }),
    // A distributor serves the territory if it sits in it or covers any of its towns.
    prisma.distributor.findMany({
      where: {
        deletedAt: null,
        status: PartnerStatus.ACTIVE,
        OR: [{ townId: inTowns }, { coveredTowns: { some: { id: inTowns } } }],
      },
      select: {
        id: true,
        firmName: true,
        phone: true,
        townId: true,
        coveredTowns: { select: { id: true } },
      },
      orderBy: { firmName: 'asc' },
    }),
    prisma.retailer.findMany({
      where: { deletedAt: null, townId: inTowns },
      orderBy: { shopName: 'asc' },
    }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    prisma.beat.findMany({
      where: { salesmanId, isActive: true, deletedAt: null },
      include: { stops: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ dayOfWeek: 'asc' }, { name: 'asc' }],
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    salesman: { id: user.id, name: user.name, hqTown: user.hqTown },
    districts,
    towns: towns.map((t) => ({ ...t, lat: num(t.lat), lng: num(t.lng) })),
    distributors: distributors.map((d) => ({
      id: d.id,
      firmName: d.firmName,
      phone: d.phone,
      townId: d.townId,
      coveredTownIds: d.coveredTowns.map((t) => t.id),
    })),
    retailers: retailers.map((r) => ({
      id: r.id,
      shopName: r.shopName,
      ownerName: r.ownerName,
      phone: r.phone,
      address: r.address,
      townId: r.townId,
      lat: r.lat.toNumber(),
      lng: r.lng.toNumber(),
      category: r.category,
      distributorId: r.distributorId,
      isVerified: r.isVerified,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      packSize: p.packSize,
      unitsPerCase: p.unitsPerCase,
      retailerPrice: p.retailerPrice.toFixed(2),
      mrp: p.mrp.toFixed(2),
    })),
    beats: beats.map((b) => ({
      id: b.id,
      name: b.name,
      dayOfWeek: b.dayOfWeek,
      stops: b.stops.map((s) => ({
        sequence: s.sequence,
        townId: s.townId,
        retailerId: s.retailerId,
      })),
    })),
  };
}

/** Background and action pings. Re-sent batches are absorbed by the client UUIDs. */
export async function recordPings(
  salesmanId: string,
  input: PingBatchInput,
): Promise<{ accepted: number }> {
  const latest = input.pings.reduce(
    (max, p) => Math.max(max, clampDeviceTime(p.capturedAt).getTime()),
    0,
  );
  const day = await requireWritableDay(salesmanId, input.workDayId, new Date(latest));

  const result = await prisma.locationPing.createMany({
    data: input.pings.map((p) => ({
      clientUuid: p.clientUuid,
      workDayId: day.id,
      salesmanId,
      lat: new Prisma.Decimal(p.lat),
      lng: new Prisma.Decimal(p.lng),
      accuracyM: p.accuracyM,
      source: p.source,
      capturedAt: clampDeviceTime(p.capturedAt),
      battery: p.battery ?? null,
    })),
    skipDuplicates: true,
  });
  return { accepted: result.count };
}

/**
 * SPEC 5.1.4: a prospect spotted in the field becomes a NEW lead assigned to the
 * salesman who found it. It needs no open day, so it works from any screen.
 */
export async function createLead(
  salesmanId: string,
  input: FieldLeadInput,
): Promise<FieldLeadResult> {
  const select = {
    id: true,
    type: true,
    name: true,
    town: { select: { id: true, name: true } },
  } as const;
  const existing = await prisma.lead.findUnique({
    where: { clientUuid: input.clientUuid },
    select: { ...select, assignedToId: true },
  });
  if (existing) {
    if (existing.assignedToId !== salesmanId) throw ApiException.conflict('Duplicate lead id');
    return { id: existing.id, type: existing.type, name: existing.name, town: existing.town };
  }

  await assertTownInTerritory(salesmanId, input.townId);

  let leadId: string;
  try {
    const lead = await leads.create(
      {
        type: input.type,
        name: input.name,
        firmName: input.firmName ?? null,
        phone: input.phone,
        townId: input.townId,
        source: LeadSource.FIELD,
        stage: LeadStage.NEW,
        assignedToId: salesmanId,
        expectedInvestment: input.expectedInvestment ?? null,
        followUpAt: input.followUpAt ?? null,
        notes: input.notes ?? null,
      },
      salesmanId,
      { createdBySalesmanId: salesmanId, clientUuid: input.clientUuid },
    );
    leadId = lead.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.lead.findUnique({
        where: { clientUuid: input.clientUuid },
        select,
      });
      if (winner) return winner;
    }
    throw err;
  }

  if (input.location) {
    const open = await prisma.workDay.findFirst({
      where: { salesmanId, status: 'OPEN', endAt: null, startAt: { not: null } },
      select: { id: true },
    });
    await prisma.locationPing.create({
      data: {
        workDayId: open?.id ?? null,
        salesmanId,
        lat: new Prisma.Decimal(input.location.lat),
        lng: new Prisma.Decimal(input.location.lng),
        accuracyM: input.location.accuracyM,
        source: PingSource.LEAD,
        capturedAt: clampDeviceTime(input.location.capturedAt),
      },
    });
  }

  return prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select });
}

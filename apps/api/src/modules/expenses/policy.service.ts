import { Prisma, type AllowancePolicy } from '@prisma/client';
import type { AllowancePolicyInput, AllowancePolicyItem, AllowanceRates } from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { toIstDateString } from '../../lib/dates';

const dateColumn = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

export function ratesOf(p: AllowancePolicy): AllowanceRates {
  return {
    daHq: p.daHq.toNumber(),
    daExHq: p.daExHq.toNumber(),
    daOutstation: p.daOutstation.toNumber(),
    taPerKmBike: p.taPerKmBike.toNumber(),
    taPerKmCar: p.taPerKmCar.toNumber(),
    taPerKmAuto: p.taPerKmAuto.toNumber(),
    maxLodgingPerNight: p.maxLodgingPerNight.toNumber(),
    monthlyPhoneAllowance: p.monthlyPhoneAllowance.toNumber(),
    publicTransportNeedsBill: p.publicTransportNeedsBill,
    daRequiresVisit: p.daRequiresVisit,
  };
}

/** Every version, newest first. Small: a handful per year at most. */
export async function versions(): Promise<AllowancePolicy[]> {
  return prisma.allowancePolicy.findMany({ orderBy: { effectiveFrom: 'desc' } });
}

/**
 * The version in force on a date: the latest one effective on or before it
 * (SPEC 2.5). Claims are always judged by the policy of their own date, so a
 * new version never re-prices old claims.
 */
export function policyOn(all: AllowancePolicy[], isoDate: string): AllowancePolicy | null {
  return all.find((p) => p.effectiveFrom.toISOString().slice(0, 10) <= isoDate) ?? null;
}

export async function requirePolicyOn(isoDate: string): Promise<AllowancePolicy> {
  const policy = policyOn(await versions(), isoDate);
  if (!policy) throw ApiException.badRequest(`No allowance policy is in force on ${isoDate}`);
  return policy;
}

function toItem(p: AllowancePolicy, currentId: string | null): AllowancePolicyItem {
  return {
    id: p.id,
    name: p.name,
    effectiveFrom: p.effectiveFrom.toISOString().slice(0, 10),
    isCurrent: p.id === currentId,
    ...ratesOf(p),
  };
}

export async function list(): Promise<{
  current: AllowancePolicyItem | null;
  versions: AllowancePolicyItem[];
}> {
  const all = await versions();
  const current = policyOn(all, toIstDateString(new Date()));
  return {
    current: current ? toItem(current, current.id) : null,
    versions: all.map((p) => toItem(p, current?.id ?? null)),
  };
}

/**
 * Saves a version effective from a date. Saving on a date that already has a
 * version replaces it; another date adds a version. Past dates are refused:
 * claims already drafted under the old rates would silently disagree with the
 * policy shown for their date.
 */
export async function save(input: AllowancePolicyInput, actorId: string) {
  const today = toIstDateString(new Date());
  if (input.effectiveFrom < today) {
    throw ApiException.badRequest('A policy change can start today at the earliest');
  }
  const data = {
    name: input.name,
    effectiveFrom: dateColumn(input.effectiveFrom),
    daHq: new Prisma.Decimal(input.daHq),
    daExHq: new Prisma.Decimal(input.daExHq),
    daOutstation: new Prisma.Decimal(input.daOutstation),
    taPerKmBike: new Prisma.Decimal(input.taPerKmBike),
    taPerKmCar: new Prisma.Decimal(input.taPerKmCar),
    taPerKmAuto: new Prisma.Decimal(input.taPerKmAuto),
    maxLodgingPerNight: new Prisma.Decimal(input.maxLodgingPerNight),
    monthlyPhoneAllowance: new Prisma.Decimal(input.monthlyPhoneAllowance),
    publicTransportNeedsBill: input.publicTransportNeedsBill,
    daRequiresVisit: input.daRequiresVisit,
  };

  const existing = await prisma.allowancePolicy.findFirst({
    where: { effectiveFrom: data.effectiveFrom },
  });
  const saved = existing
    ? await prisma.allowancePolicy.update({ where: { id: existing.id }, data })
    : await prisma.allowancePolicy.create({ data });

  await writeAuditLog({
    userId: actorId,
    action: existing ? 'UPDATE' : 'CREATE',
    entity: 'AllowancePolicy',
    entityId: saved.id,
    before: existing ? ratesOf(existing) : undefined,
    after: { effectiveFrom: input.effectiveFrom, ...ratesOf(saved) },
  });
  return list();
}

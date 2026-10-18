import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { recomputeDistrictCoverage } from '../geo/coverage.service';

export const decimalOrNull = (value: number | null | undefined) =>
  value === null || value === undefined ? null : new Prisma.Decimal(value);

export const toIso = (value: Date | null | undefined) => value?.toISOString() ?? null;

export const moneyOrNull = (value: Prisma.Decimal | null) => value?.toFixed(2) ?? null;

export const coordOrNull = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());

/** Only set a field when the caller actually sent it, so PATCH stays partial. */
export function patch<T extends object>(input: T, keys: (keyof T)[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) data[key as string] = input[key];
  }
  return data;
}

export async function requireTownDistrict(townId: string): Promise<string> {
  const town = await prisma.town.findFirst({
    where: { id: townId, deletedAt: null },
    select: { districtId: true },
  });
  if (!town) throw ApiException.badRequest('Town not found');
  return town.districtId;
}

export async function assertDistrictsExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await prisma.district.count({ where: { id: { in: ids }, deletedAt: null } });
  if (found !== new Set(ids).size) throw ApiException.badRequest('One or more districts not found');
}

export async function assertTownsExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await prisma.town.count({ where: { id: { in: ids }, deletedAt: null } });
  if (found !== new Set(ids).size) throw ApiException.badRequest('One or more towns not found');
}

/**
 * Coverage is derived, so any partner write has to refresh the districts it
 * could have changed — both where it used to sit and where it sits now
 * (SPEC 7).
 */
export async function refreshCoverage(districtIds: (string | null | undefined)[]): Promise<void> {
  await recomputeDistrictCoverage(prisma, districtIds);
}

/** Districts reachable from a set of town ids, for coverage refreshes. */
export async function districtsOfTowns(townIds: string[]): Promise<string[]> {
  if (townIds.length === 0) return [];
  const towns = await prisma.town.findMany({
    where: { id: { in: townIds } },
    select: { districtId: true },
  });
  return towns.map((t) => t.districtId);
}

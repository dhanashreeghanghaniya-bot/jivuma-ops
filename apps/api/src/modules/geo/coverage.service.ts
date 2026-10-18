import { CoverageStatus, type PrismaClient } from '@prisma/client';

/**
 * Coverage is always derived, never set by hand (SPEC 4.1):
 *   COVERED    at least one active distributor
 *   SS_ONLY    a super stockist but no distributor
 *   LEADS_ONLY no partner, but at least one open lead
 *   UNTOUCHED  nothing
 */
export function deriveCoverageStatus(counts: {
  activeDistributors: number;
  activeSuperStockists: number;
  openLeads: number;
}): CoverageStatus {
  if (counts.activeDistributors > 0) return CoverageStatus.COVERED;
  if (counts.activeSuperStockists > 0) return CoverageStatus.SS_ONLY;
  if (counts.openLeads > 0) return CoverageStatus.LEADS_ONLY;
  return CoverageStatus.UNTOUCHED;
}

/**
 * Recomputes the districts whose ids are given, or every district when none are.
 *
 * Takes the client explicitly so the seed script can run it without pulling in
 * the API's env-validated singleton.
 */
async function recompute(client: PrismaClient, ids?: string[]): Promise<void> {
  const districts = await client.district.findMany({
    where: { deletedAt: null, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, coverageStatus: true },
  });

  for (const district of districts) {
    const [activeDistributors, activeSuperStockists, openLeads] = await Promise.all([
      client.distributor.count({
        where: { deletedAt: null, status: 'ACTIVE', town: { districtId: district.id } },
      }),
      client.superStockist.count({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          OR: [
            { town: { districtId: district.id } },
            { coveredDistricts: { some: { id: district.id } } },
          ],
        },
      }),
      client.lead.count({
        where: { deletedAt: null, districtId: district.id, stage: { notIn: ['WON', 'LOST'] } },
      }),
    ]);

    const coverageStatus = deriveCoverageStatus({
      activeDistributors,
      activeSuperStockists,
      openLeads,
    });

    if (coverageStatus !== district.coverageStatus) {
      await client.district.update({ where: { id: district.id }, data: { coverageStatus } });
    }
  }
}

/** Full sweep; cheap at 33 districts. Used by the seed and the import commit. */
export const recomputeAllCoverage = (client: PrismaClient) => recompute(client);

/**
 * Targeted sweep for partner create/update/status changes (SPEC 7). Duplicate
 * and empty ids are tolerated so callers can pass "before and after" districts.
 */
export async function recomputeDistrictCoverage(
  client: PrismaClient,
  districtIds: (string | null | undefined)[],
): Promise<void> {
  const ids = [...new Set(districtIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  await recompute(client, ids);
}

/**
 * The districts a partner affects: the one its town sits in, plus any it
 * explicitly covers.
 */
export async function districtsAffectedByTown(
  client: PrismaClient,
  townId: string | null | undefined,
): Promise<string[]> {
  if (!townId) return [];
  const town = await client.town.findUnique({ where: { id: townId }, select: { districtId: true } });
  return town ? [town.districtId] : [];
}

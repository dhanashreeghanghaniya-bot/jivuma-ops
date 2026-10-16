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
 * Recomputes every district in one pass. Cheap at 33 districts; Phase 2 can add a
 * targeted single-district version for partner create/update hooks.
 *
 * Takes the client explicitly so the seed script can run it without pulling in
 * the API's env-validated singleton.
 */
export async function recomputeAllCoverage(client: PrismaClient): Promise<void> {
  const districts = await client.district.findMany({
    where: { deletedAt: null },
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

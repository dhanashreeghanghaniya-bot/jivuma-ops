import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';

export interface Territory {
  districtIds: string[];
  townIds: string[];
}

/**
 * A salesman's territory is the union of the towns assigned to him directly
 * and every town in the districts assigned to him (SPEC 2.4). Everything the
 * field app reads or writes is scoped to it (SPEC 6).
 */
export async function territoryOf(salesmanId: string): Promise<Territory> {
  const rows = await prisma.salesmanTerritory.findMany({
    where: { salesmanId },
    select: { districtId: true, townId: true },
  });

  const assignedDistricts = rows.flatMap((r) => (r.districtId ? [r.districtId] : []));
  const assignedTowns = rows.flatMap((r) => (r.townId ? [r.townId] : []));

  const towns = await prisma.town.findMany({
    where: {
      deletedAt: null,
      OR: [{ districtId: { in: assignedDistricts } }, { id: { in: assignedTowns } }],
    },
    select: { id: true, districtId: true },
  });

  return {
    districtIds: [...new Set(towns.map((t) => t.districtId))],
    townIds: towns.map((t) => t.id),
  };
}

export async function assertTownInTerritory(
  salesmanId: string,
  townId: string,
): Promise<Territory> {
  const territory = await territoryOf(salesmanId);
  if (!territory.townIds.includes(townId)) {
    throw ApiException.forbidden('That town is outside your territory');
  }
  return territory;
}

import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { sendOk } from '../../lib/http';
import { requireAuth, requireRole } from '../../middleware/auth';
import { query, validateQuery } from '../../middleware/validate';

export const geoRouter = Router();

const listTownsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  districtId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/**
 * Read-only town lookup, enough to power the HQ-town picker in Settings -> Users.
 * Full geography CRUD arrives in Phase 2.
 */
geoRouter.get(
  '/towns',
  requireAuth,
  requireRole(Role.ADMIN, Role.MANAGER),
  validateQuery(listTownsQuerySchema),
  async (req, res, next) => {
    try {
      const { search, districtId, limit } = query(req, listTownsQuerySchema);

      const towns = await prisma.town.findMany({
        where: {
          deletedAt: null,
          ...(districtId ? { districtId } : {}),
          ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        },
        select: {
          id: true,
          name: true,
          type: true,
          district: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ district: { name: 'asc' } }, { name: 'asc' }],
        take: limit,
      });

      return sendOk(res, towns);
    } catch (err) {
      next(err);
    }
  },
);

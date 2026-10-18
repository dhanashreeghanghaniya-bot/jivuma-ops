import { Router } from 'express';
import { z } from 'zod';
import {
  Role,
  createTownSchema,
  idSchema,
  listDistrictsQuerySchema,
  listTownsQuerySchema,
  updateDistrictSchema,
  updateTownSchema,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { sendOk } from '../../lib/http';
import { requireAdmin, requireAuth, requireRole } from '../../middleware/auth';
import { query, validateBody, validateQuery } from '../../middleware/validate';
import * as controller from './geo.controller';

export const geoRouter = Router();

// Everything here is read-only for salesmen and writable only by admins.
geoRouter.use(requireAuth);

const readRoles = requireRole(Role.ADMIN, Role.MANAGER);

geoRouter.get('/districts', readRoles, validateQuery(listDistrictsQuerySchema), controller.listDistricts);
geoRouter.get(
  '/districts/map',
  readRoles,
  validateQuery(listDistrictsQuerySchema),
  controller.districtsMap,
);
geoRouter.get('/districts/:id/summary', readRoles, controller.districtSummary);
geoRouter.patch(
  '/districts/:id',
  requireAdmin,
  validateBody(updateDistrictSchema),
  controller.updateDistrict,
);

geoRouter.get('/markers', readRoles, controller.mapMarkers);

geoRouter.get('/towns', validateQuery(listTownsQuerySchema), controller.listTowns);
geoRouter.post('/towns', requireAdmin, validateBody(createTownSchema), controller.createTown);
geoRouter.patch('/towns/:id', requireAdmin, validateBody(updateTownSchema), controller.updateTown);
geoRouter.delete('/towns/:id', requireAdmin, controller.deleteTown);

/**
 * Flat town lookup for pickers. Separate from the paginated list so forms can
 * fetch every town in one call and filter client-side.
 */
const townOptionsQuerySchema = z.object({
  districtId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(1000),
});

geoRouter.get('/towns/options', validateQuery(townOptionsQuerySchema), async (req, res, next) => {
  try {
    const { districtId, limit } = query(req, townOptionsQuerySchema);
    const towns = await prisma.town.findMany({
      where: { deletedAt: null, ...(districtId ? { districtId } : {}) },
      select: {
        id: true,
        name: true,
        type: true,
        lat: true,
        lng: true,
        district: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ district: { name: 'asc' } }, { name: 'asc' }],
      take: limit,
    });

    // Coordinates let a form centre its map picker on the chosen town.
    return sendOk(
      res,
      towns.map((town) => ({ ...town, lat: town.lat.toNumber(), lng: town.lng.toNumber() })),
    );
  } catch (err) {
    next(err);
  }
});

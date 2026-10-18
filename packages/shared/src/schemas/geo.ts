import { z } from 'zod';
import { TownType, Zone, CoverageStatus, enumValues } from '../enums';
import { idSchema, latitudeSchema, longitudeSchema, paginationQuerySchema } from './common';

export const zoneSchema = z.enum(enumValues(Zone) as [Zone, ...Zone[]]);
export const townTypeSchema = z.enum(enumValues(TownType) as [TownType, ...TownType[]]);
export const coverageStatusSchema = z.enum(
  enumValues(CoverageStatus) as [CoverageStatus, ...CoverageStatus[]],
);

/**
 * Districts are reference data: the 33 are seeded and never created or deleted
 * through the UI, so only the editable fields are exposed (SPEC 4.8).
 */
export const updateDistrictSchema = z.object({
  nameGu: z.string().trim().min(1).max(120).optional(),
  lat: latitudeSchema.optional(),
  lng: longitudeSchema.optional(),
  zone: zoneSchema.optional(),
});
export type UpdateDistrictInput = z.infer<typeof updateDistrictSchema>;

export const createTownSchema = z.object({
  name: z.string().trim().min(2, 'Town name is required').max(120),
  districtId: idSchema,
  lat: latitudeSchema,
  lng: longitudeSchema,
  type: townTypeSchema.default(TownType.TOWN),
  population: z.coerce.number().int().min(0).max(50_000_000).nullish(),
});
export type CreateTownInput = z.infer<typeof createTownSchema>;

export const updateTownSchema = createTownSchema.partial();
export type UpdateTownInput = z.infer<typeof updateTownSchema>;

export const listTownsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  districtId: idSchema.optional(),
  type: townTypeSchema.optional(),
});
export type ListTownsQuery = z.infer<typeof listTownsQuerySchema>;

export const listDistrictsQuerySchema = z.object({
  zone: zoneSchema.optional(),
  coverageStatus: coverageStatusSchema.optional(),
  /** Inclusive `YYYY-MM-DD` bounds for the order metrics on the map. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
});
export type ListDistrictsQuery = z.infer<typeof listDistrictsQuerySchema>;

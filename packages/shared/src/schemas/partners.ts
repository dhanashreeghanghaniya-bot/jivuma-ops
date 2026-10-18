import { z } from 'zod';
import { PartnerStatus, RetailerCategory, enumValues } from '../enums';
import {
  idSchema,
  latitudeSchema,
  longitudeSchema,
  optionalPhoneSchema,
  paginationQuerySchema,
  phoneSchema,
} from './common';

export const partnerStatusSchema = z.enum(
  enumValues(PartnerStatus) as [PartnerStatus, ...PartnerStatus[]],
);
export const retailerCategorySchema = z.enum(
  enumValues(RetailerCategory) as [RetailerCategory, ...RetailerCategory[]],
);

/** GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum. */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN');

/** Optional free-text fields arrive as '' from empty form inputs; treat that as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullish();

const contactFields = {
  firmName: z.string().trim().min(2, 'Firm name is required').max(160),
  ownerName: z.string().trim().min(2, 'Owner name is required').max(120),
  phone: phoneSchema,
  altPhone: optionalPhoneSchema,
  email: z.union([z.literal(''), z.string().email('Enter a valid email')]).transform((v) => v || null)
    .nullish(),
  gstin: z.union([z.literal(''), gstinSchema]).transform((v) => v || null).nullish(),
  address: z.string().trim().min(5, 'Address is required').max(400),
  townId: idSchema,
  lat: latitudeSchema.nullish(),
  lng: longitudeSchema.nullish(),
  status: partnerStatusSchema.default(PartnerStatus.ACTIVE),
  notes: optionalText(2000),
};

export const createSuperStockistSchema = z.object({
  ...contactFields,
  /** Districts this SS is responsible for; drives coverage alongside its own town. */
  coveredDistrictIds: z.array(idSchema).max(33).default([]),
});
export type CreateSuperStockistInput = z.infer<typeof createSuperStockistSchema>;

export const updateSuperStockistSchema = createSuperStockistSchema.partial();
export type UpdateSuperStockistInput = z.infer<typeof updateSuperStockistSchema>;

export const createDistributorSchema = z.object({
  ...contactFields,
  superStockistId: idSchema,
  coveredTownIds: z.array(idSchema).max(500).default([]),
  creditLimit: z.coerce.number().min(0).max(99_999_999).nullish(),
  creditDays: z.coerce.number().int().min(0).max(365).nullish(),
});
export type CreateDistributorInput = z.infer<typeof createDistributorSchema>;

export const updateDistributorSchema = createDistributorSchema.partial();
export type UpdateDistributorInput = z.infer<typeof updateDistributorSchema>;

export const createRetailerSchema = z.object({
  shopName: z.string().trim().min(2, 'Shop name is required').max(160),
  ownerName: z.string().trim().min(2, 'Owner name is required').max(120),
  phone: phoneSchema,
  address: z.string().trim().min(5, 'Address is required').max(400),
  townId: idSchema,
  // Retailers are visited in person, so their pin is required rather than optional.
  lat: latitudeSchema,
  lng: longitudeSchema,
  distributorId: idSchema,
  category: retailerCategorySchema.default(RetailerCategory.KIRANA),
  photoUrl: z.union([z.literal(''), z.string().url()]).transform((v) => v || null).nullish(),
});
export type CreateRetailerInput = z.infer<typeof createRetailerSchema>;

export const updateRetailerSchema = createRetailerSchema.partial();
export type UpdateRetailerInput = z.infer<typeof updateRetailerSchema>;

const partnerListFilters = {
  search: z.string().trim().max(120).optional(),
  districtId: idSchema.optional(),
  townId: idSchema.optional(),
  status: partnerStatusSchema.optional(),
};

export const listSuperStockistsQuerySchema = paginationQuerySchema.extend(partnerListFilters);
export type ListSuperStockistsQuery = z.infer<typeof listSuperStockistsQuerySchema>;

export const listDistributorsQuerySchema = paginationQuerySchema.extend({
  ...partnerListFilters,
  superStockistId: idSchema.optional(),
});
export type ListDistributorsQuery = z.infer<typeof listDistributorsQuerySchema>;

const booleanParam = z
  .union([z.literal('true'), z.literal('false')])
  .transform((v) => v === 'true');

export const listRetailersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  districtId: idSchema.optional(),
  townId: idSchema.optional(),
  distributorId: idSchema.optional(),
  category: retailerCategorySchema.optional(),
  isVerified: booleanParam.optional(),
});
export type ListRetailersQuery = z.infer<typeof listRetailersQuerySchema>;

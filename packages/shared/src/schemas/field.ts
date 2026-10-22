import { z } from 'zod';
import {
  DayType,
  PingSource,
  TravelMode,
  RetailerCategory,
  VisitOutcome,
  VisitPhotoType,
  enumValues,
} from '../enums';
import { idSchema, latitudeSchema, longitudeSchema, phoneSchema } from './common';
import { createLeadSchema } from './leads';

/** Spec 5.1: a fix worse than this is accepted only after retries, and flagged. */
export const GPS_ACCURACY_LIMIT_M = 200;
/** Spec 2.4: a check-in further than this from the shop's saved pin is flagged. */
export const VISIT_DISTANCE_FLAG_M = 300;
/** Spec 5.1.5: background pings while the app is open. */
export const PING_INTERVAL_MS = 10 * 60 * 1000;

/** Field-day types a salesman picks at Start Day. LEAVE / HOLIDAY are admin-marked. */
export const FIELD_DAY_TYPES = [DayType.HQ, DayType.EX_HQ, DayType.OUTSTATION] as const;

const clientUuidSchema = z.string().uuid('Invalid client id');

/** One reading from `navigator.geolocation`, as the device reported it. */
export const gpsFixSchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema,
  accuracyM: z.coerce.number().int().min(0).max(100_000),
  /** Device clock. The server records its own time alongside and trusts that one. */
  capturedAt: z.string().datetime({ offset: true }),
});
export type GpsFix = z.infer<typeof gpsFixSchema>;

/**
 * Storage object paths the API handed out earlier. Only the shape is checked
 * here; the service confirms the path sits inside the caller's own folder.
 */
export const storagePathSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^[a-z]+\/[A-Za-z0-9_-]+\/\d{4}-\d{2}\/[A-Za-z0-9_.-]+$/, 'Invalid file path');

const odometerSchema = z.coerce.number().int().min(0).max(9_999_999).nullish();

export const startWorkDaySchema = z.object({
  location: gpsFixSchema,
  dayType: z.enum(FIELD_DAY_TYPES),
  beatId: idSchema.nullish(),
  startOdometer: odometerSchema,
  startOdometerPhotoPath: storagePathSchema.nullish(),
});
export type StartWorkDayInput = z.infer<typeof startWorkDaySchema>;

export const endWorkDaySchema = z.object({
  /**
   * How he travelled, for the TA draft. Own vehicles are paid per km from the
   * policy; bus and train are claimed by hand at actuals with a bill. Null: no
   * travel to claim.
   */
  travelMode: z.enum(enumValues(TravelMode) as [TravelMode, ...TravelMode[]]).nullish(),
  /**
   * Mandatory for today's day. Ignored when closing a day left open from an
   * earlier date: that day ends at its last recorded activity instead, since
   * where the salesman stands this morning says nothing about yesterday.
   */
  location: gpsFixSchema.nullish(),
  endOdometer: odometerSchema,
  endOdometerPhotoPath: storagePathSchema.nullish(),
  remarks: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => v || null)
    .nullish(),
});
export type EndWorkDayInput = z.infer<typeof endWorkDaySchema>;

export const pingSchema = gpsFixSchema.extend({
  clientUuid: clientUuidSchema,
  source: z.enum(enumValues(PingSource) as [PingSource, ...PingSource[]]),
  battery: z.coerce.number().int().min(0).max(100).nullish(),
});
export type PingInput = z.infer<typeof pingSchema>;

export const pingBatchSchema = z.object({
  workDayId: idSchema,
  pings: z.array(pingSchema).min(1).max(200),
});
export type PingBatchInput = z.infer<typeof pingBatchSchema>;

export const newShopSchema = z.object({
  shopName: z.string().trim().min(2, 'Shop name is required').max(160),
  ownerName: z.string().trim().min(2, 'Owner name is required').max(120),
  phone: phoneSchema,
  category: z
    .enum(enumValues(RetailerCategory) as [RetailerCategory, ...RetailerCategory[]])
    .default(RetailerCategory.KIRANA),
  address: z.string().trim().min(3, 'Address is required').max(400),
  lat: latitudeSchema,
  lng: longitudeSchema,
  distributorId: idSchema,
  photoPath: storagePathSchema.nullish(),
});
export type NewShopInput = z.infer<typeof newShopSchema>;

export const orderLineSchema = z
  .object({
    productId: idSchema,
    qtyCases: z.coerce.number().int().min(0).max(10_000).default(0),
    qtyUnits: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .refine((line) => line.qtyCases + line.qtyUnits > 0, {
    message: 'Quantity must be more than zero',
    path: ['qtyCases'],
  });
export type OrderLineInput = z.infer<typeof orderLineSchema>;

export const fieldOrderSchema = z.object({
  distributorId: idSchema,
  items: z.array(orderLineSchema).min(1, 'Add at least one product').max(100),
  notes: z.string().trim().max(1000).nullish(),
});
export type FieldOrderInput = z.infer<typeof fieldOrderSchema>;

export const createVisitSchema = z
  .object({
    clientUuid: clientUuidSchema,
    workDayId: idSchema,
    retailerId: idSchema.nullish(),
    newShop: newShopSchema.nullish(),
    townId: idSchema,
    checkIn: gpsFixSchema,
    outcome: z.enum(enumValues(VisitOutcome) as [VisitOutcome, ...VisitOutcome[]]),
    noOrderReason: z.string().trim().max(300).nullish(),
    notes: z.string().trim().max(2000).nullish(),
    order: fieldOrderSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.retailerId) === Boolean(v.newShop)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retailerId'],
        message: 'Pick an existing shop or add a new one',
      });
    }
    if ((v.outcome === VisitOutcome.ORDER_TAKEN) !== Boolean(v.order)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['order'],
        message: 'An order goes with the "Order taken" outcome, and only with it',
      });
    }
    if (v.outcome === VisitOutcome.NO_ORDER && !v.noOrderReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['noOrderReason'],
        message: 'Say why there was no order',
      });
    }
    if (v.outcome === VisitOutcome.NEW_SHOP_ADDED && !v.newShop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: '"New shop added" needs the new shop details',
      });
    }
  });
export type CreateVisitInput = z.infer<typeof createVisitSchema>;

export const visitPhotoInputSchema = z.object({
  path: storagePathSchema,
  type: z.enum(enumValues(VisitPhotoType) as [VisitPhotoType, ...VisitPhotoType[]]),
  capturedAt: z.string().datetime({ offset: true }),
  lat: latitudeSchema.nullish(),
  lng: longitudeSchema.nullish(),
});
export type VisitPhotoInput = z.infer<typeof visitPhotoInputSchema>;

export const attachVisitPhotosSchema = z.object({
  photos: z.array(visitPhotoInputSchema).min(1).max(10),
});
export type AttachVisitPhotosInput = z.infer<typeof attachVisitPhotosSchema>;

export const UPLOAD_KINDS = ['visits', 'shops', 'odometer', 'bills'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const presignUploadSchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  /**
   * Chosen by the client (normally `<clientUuid>-<n>`) so a retried upload
   * lands on the same object instead of leaving an orphan behind.
   */
  key: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, 'Invalid file key'),
  contentType: z.enum(['image/jpeg', 'image/webp']).default('image/jpeg'),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const signedReadSchema = z.object({
  paths: z.array(storagePathSchema).min(1).max(50),
});
export type SignedReadInput = z.infer<typeof signedReadSchema>;

/** A lead added from the field: the admin form's fields minus assignment. */
export const fieldLeadSchema = createLeadSchema
  .pick({
    type: true,
    name: true,
    firmName: true,
    phone: true,
    townId: true,
    expectedInvestment: true,
    followUpAt: true,
    notes: true,
  })
  .extend({
    clientUuid: clientUuidSchema,
    location: gpsFixSchema.nullish(),
  });
export type FieldLeadInput = z.infer<typeof fieldLeadSchema>;

export const listWorkDaysQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  salesmanId: idSchema.optional(),
});
export type ListWorkDaysQuery = z.infer<typeof listWorkDaysQuerySchema>;

export const listVisitsQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  workDayId: idSchema.optional(),
  salesmanId: idSchema.optional(),
  retailerId: idSchema.optional(),
});
export type ListVisitsQuery = z.infer<typeof listVisitsQuerySchema>;

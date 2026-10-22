import { z } from 'zod';
import { LeadActivityType, LeadSource, LeadStage, LeadType, enumValues } from '../enums';
import { idSchema, paginationQuerySchema, phoneSchema } from './common';

export const leadTypeSchema = z.enum(enumValues(LeadType) as [LeadType, ...LeadType[]]);
export const leadSourceSchema = z.enum(enumValues(LeadSource) as [LeadSource, ...LeadSource[]]);
export const leadStageSchema = z.enum(enumValues(LeadStage) as [LeadStage, ...LeadStage[]]);
export const leadActivityTypeSchema = z.enum(
  enumValues(LeadActivityType) as [LeadActivityType, ...LeadActivityType[]],
);

/** Stages a lead can sit in while still worth chasing. */
export const OPEN_LEAD_STAGES: LeadStage[] = [
  LeadStage.NEW,
  LeadStage.CONTACTED,
  LeadStage.MEETING_DONE,
  LeadStage.NEGOTIATION,
];

/** Left-to-right order of the kanban columns. */
export const LEAD_STAGE_ORDER: LeadStage[] = [...OPEN_LEAD_STAGES, LeadStage.WON, LeadStage.LOST];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullish();

/** `YYYY-MM-DD` from a date input, or null when cleared. */
const optionalDate = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')])
  .transform((v) => v || null)
  .nullish();

export const createLeadSchema = z.object({
  type: leadTypeSchema,
  name: z.string().trim().min(2, 'Contact name is required').max(120),
  firmName: optionalText(160),
  phone: phoneSchema,
  townId: idSchema,
  source: leadSourceSchema.default(LeadSource.FIELD),
  stage: leadStageSchema.default(LeadStage.NEW),
  assignedToId: idSchema.nullish(),
  expectedInvestment: z.coerce.number().min(0).max(999_999_999).nullish(),
  followUpAt: optionalDate,
  notes: optionalText(2000),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial();
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/**
 * Stage moves are their own endpoint rather than part of the update: they write
 * an activity entry, and LOST demands a reason.
 */
export const changeLeadStageSchema = z
  .object({
    stage: leadStageSchema,
    lostReason: optionalText(500),
    note: optionalText(1000),
  })
  .refine((v) => v.stage !== LeadStage.LOST || Boolean(v.lostReason), {
    path: ['lostReason'],
    message: 'Say why the lead was lost',
  });
export type ChangeLeadStageInput = z.infer<typeof changeLeadStageSchema>;

export const createLeadActivitySchema = z.object({
  // STAGE_CHANGE entries are written by the server, never posted by a client.
  type: z.enum([LeadActivityType.CALL, LeadActivityType.VISIT, LeadActivityType.NOTE]),
  note: z.string().trim().min(1, 'Write what happened').max(2000),
  /** Optional: push the next follow-up out in the same action. */
  followUpAt: optionalDate,
});
export type CreateLeadActivityInput = z.infer<typeof createLeadActivitySchema>;

/** Overrides applied on top of the lead's own details when creating the partner. */
export const convertLeadSchema = z.object({
  address: z.string().trim().min(5, 'Address is required').max(400),
  ownerName: z.string().trim().min(2).max(120).optional(),
  firmName: z.string().trim().min(2).max(160).optional(),
  /** Required when converting to DISTRIBUTOR or RETAILER. */
  superStockistId: idSchema.optional(),
  distributorId: idSchema.optional(),
  lat: z.coerce.number().min(-90).max(90).nullish(),
  lng: z.coerce.number().min(-180).max(180).nullish(),
});
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

const booleanParam = z
  .union([z.literal('true'), z.literal('false')])
  .transform((v) => v === 'true');

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  type: leadTypeSchema.optional(),
  stage: leadStageSchema.optional(),
  districtId: idSchema.optional(),
  townId: idSchema.optional(),
  assignedToId: idSchema.optional(),
  source: leadSourceSchema.optional(),
  /** Only leads whose follow-up date has already passed. */
  overdue: booleanParam.optional(),
  /** Only the four open stages, i.e. hide WON and LOST. */
  openOnly: booleanParam.optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

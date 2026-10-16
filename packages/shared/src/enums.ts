/**
 * Mirrors the Prisma enums. Kept as const objects (not TS `enum`) so the values
 * can be used in Zod schemas and iterated in the UI.
 */

export const Role = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SALESMAN: 'SALESMAN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Zone = {
  SAURASHTRA: 'SAURASHTRA',
  KUTCH: 'KUTCH',
  NORTH_GUJARAT: 'NORTH_GUJARAT',
  CENTRAL_GUJARAT: 'CENTRAL_GUJARAT',
  SOUTH_GUJARAT: 'SOUTH_GUJARAT',
} as const;
export type Zone = (typeof Zone)[keyof typeof Zone];

export const CoverageStatus = {
  COVERED: 'COVERED',
  SS_ONLY: 'SS_ONLY',
  LEADS_ONLY: 'LEADS_ONLY',
  UNTOUCHED: 'UNTOUCHED',
} as const;
export type CoverageStatus = (typeof CoverageStatus)[keyof typeof CoverageStatus];

export const TownType = {
  CITY: 'CITY',
  TOWN: 'TOWN',
  VILLAGE: 'VILLAGE',
} as const;
export type TownType = (typeof TownType)[keyof typeof TownType];

export const PartnerStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ON_HOLD: 'ON_HOLD',
} as const;
export type PartnerStatus = (typeof PartnerStatus)[keyof typeof PartnerStatus];

export const RetailerCategory = {
  KIRANA: 'KIRANA',
  SUPERMARKET: 'SUPERMARKET',
  GENERAL: 'GENERAL',
  HORECA: 'HORECA',
  OTHER: 'OTHER',
} as const;
export type RetailerCategory = (typeof RetailerCategory)[keyof typeof RetailerCategory];

export const LeadType = {
  SS: 'SS',
  DISTRIBUTOR: 'DISTRIBUTOR',
  RETAILER: 'RETAILER',
} as const;
export type LeadType = (typeof LeadType)[keyof typeof LeadType];

export const LeadSource = {
  FIELD: 'FIELD',
  REFERRAL: 'REFERRAL',
  INBOUND_CALL: 'INBOUND_CALL',
  EXPO: 'EXPO',
  OTHER: 'OTHER',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const LeadStage = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  MEETING_DONE: 'MEETING_DONE',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];

export const LeadActivityType = {
  CALL: 'CALL',
  VISIT: 'VISIT',
  NOTE: 'NOTE',
  STAGE_CHANGE: 'STAGE_CHANGE',
} as const;
export type LeadActivityType = (typeof LeadActivityType)[keyof typeof LeadActivityType];

export const OrderLevel = {
  COMPANY_TO_SS: 'COMPANY_TO_SS',
  SS_TO_DISTRIBUTOR: 'SS_TO_DISTRIBUTOR',
  DISTRIBUTOR_TO_RETAILER: 'DISTRIBUTOR_TO_RETAILER',
} as const;
export type OrderLevel = (typeof OrderLevel)[keyof typeof OrderLevel];

export const OrderStatus = {
  PLACED: 'PLACED',
  CONFIRMED: 'CONFIRMED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PartyType = {
  COMPANY: 'COMPANY',
  SUPER_STOCKIST: 'SUPER_STOCKIST',
  DISTRIBUTOR: 'DISTRIBUTOR',
  RETAILER: 'RETAILER',
} as const;
export type PartyType = (typeof PartyType)[keyof typeof PartyType];

export const DayType = {
  HQ: 'HQ',
  EX_HQ: 'EX_HQ',
  OUTSTATION: 'OUTSTATION',
  LEAVE: 'LEAVE',
  HOLIDAY: 'HOLIDAY',
} as const;
export type DayType = (typeof DayType)[keyof typeof DayType];

export const WorkDayStatus = {
  OPEN: 'OPEN',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type WorkDayStatus = (typeof WorkDayStatus)[keyof typeof WorkDayStatus];

export const PingSource = {
  START: 'START',
  END: 'END',
  TIMER: 'TIMER',
  VISIT: 'VISIT',
  ORDER: 'ORDER',
  LEAD: 'LEAD',
  EXPENSE: 'EXPENSE',
} as const;
export type PingSource = (typeof PingSource)[keyof typeof PingSource];

export const VisitOutcome = {
  ORDER_TAKEN: 'ORDER_TAKEN',
  NO_ORDER: 'NO_ORDER',
  SHOP_CLOSED: 'SHOP_CLOSED',
  FOLLOW_UP: 'FOLLOW_UP',
  NEW_SHOP_ADDED: 'NEW_SHOP_ADDED',
} as const;
export type VisitOutcome = (typeof VisitOutcome)[keyof typeof VisitOutcome];

export const VisitPhotoType = {
  SHELF: 'SHELF',
  SHOP_FRONT: 'SHOP_FRONT',
  DISPLAY: 'DISPLAY',
  OTHER: 'OTHER',
} as const;
export type VisitPhotoType = (typeof VisitPhotoType)[keyof typeof VisitPhotoType];

export const ExpenseCategory = {
  TA: 'TA',
  DA: 'DA',
  LODGING: 'LODGING',
  FOOD: 'FOOD',
  PHONE: 'PHONE',
  MISC: 'MISC',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export const TravelMode = {
  BIKE: 'BIKE',
  CAR: 'CAR',
  BUS: 'BUS',
  TRAIN: 'TRAIN',
  AUTO: 'AUTO',
} as const;
export type TravelMode = (typeof TravelMode)[keyof typeof TravelMode];

export const ExpenseStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PARTIALLY_APPROVED: 'PARTIALLY_APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const ReportStatus = {
  DRAFT: 'DRAFT',
  FINAL: 'FINAL',
  PAID: 'PAID',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const enumValues = <T extends Record<string, string>>(e: T): [string, ...string[]] =>
  Object.values(e) as [string, ...string[]];

import type { LeadActivityType, LeadSource, LeadStage, LeadType } from '@juma/shared';

export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  MEETING_DONE: 'Meeting done',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

/** Column accents for the kanban, matching the map's coverage palette. */
export const STAGE_ACCENTS: Record<LeadStage, string> = {
  NEW: 'bg-slate-400',
  CONTACTED: 'bg-sky-500',
  MEETING_DONE: 'bg-indigo-500',
  NEGOTIATION: 'bg-amber-500',
  WON: 'bg-emerald-600',
  LOST: 'bg-rose-500',
};

export const TYPE_LABELS: Record<LeadType, string> = {
  SS: 'Super stockist',
  DISTRIBUTOR: 'Distributor',
  RETAILER: 'Retailer',
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  FIELD: 'Field',
  REFERRAL: 'Referral',
  INBOUND_CALL: 'Inbound call',
  EXPO: 'Expo',
  OTHER: 'Other',
};

export const ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  CALL: 'Call',
  VISIT: 'Visit',
  NOTE: 'Note',
  STAGE_CHANGE: 'Stage change',
};

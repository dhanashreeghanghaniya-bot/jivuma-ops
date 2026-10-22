import type { DayType, RetailerCategory, VisitOutcome, VisitPhotoType } from '@juma/shared';

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  HQ: 'HQ',
  EX_HQ: 'Ex-HQ',
  OUTSTATION: 'Outstation',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
};

export const DAY_TYPE_HINTS: Partial<Record<DayType, string>> = {
  HQ: 'Working in your headquarter town',
  EX_HQ: 'Out of HQ, back home tonight',
  OUTSTATION: 'Staying overnight away from HQ',
};

export const OUTCOME_LABELS: Record<VisitOutcome, string> = {
  ORDER_TAKEN: 'Order taken',
  NO_ORDER: 'No order',
  SHOP_CLOSED: 'Shop closed',
  FOLLOW_UP: 'Follow-up',
  NEW_SHOP_ADDED: 'New shop added',
};

export const OUTCOME_TONE: Record<VisitOutcome, string> = {
  ORDER_TAKEN: 'bg-emerald-100 text-emerald-900',
  NO_ORDER: 'bg-muted text-muted-foreground',
  SHOP_CLOSED: 'bg-muted text-muted-foreground',
  FOLLOW_UP: 'bg-sky-100 text-sky-900',
  NEW_SHOP_ADDED: 'bg-violet-100 text-violet-900',
};

export const PHOTO_TYPE_LABELS: Record<VisitPhotoType, string> = {
  SHELF: 'Shelf',
  DISPLAY: 'Display',
  SHOP_FRONT: 'Shop front',
  OTHER: 'Other',
};

export const CATEGORY_LABELS: Record<RetailerCategory, string> = {
  KIRANA: 'Kirana',
  SUPERMARKET: 'Supermarket',
  GENERAL: 'General store',
  HORECA: 'Hotel / restaurant',
  OTHER: 'Other',
};

export const NO_ORDER_REASONS = [
  'Enough stock',
  'Owner not available',
  'Price issue',
  'Buys from another distributor',
  'Payment pending',
  'Other',
];

export const formatMinutes = (minutes: number | null) => {
  if (minutes === null) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

import type { DayType, ExpenseCategory, ExpenseStatus, TravelMode, WorkDayStatus } from '../enums';
import type { AllowanceRates } from '../schemas/expenses';

export interface AllowancePolicyItem extends AllowanceRates {
  id: string;
  name: string;
  effectiveFrom: string;
  /** The version in force today. */
  isCurrent: boolean;
}

export type ExpenseFlag =
  /** Claimed more than the policy allows for this claim. */
  | 'OVER_LIMIT'
  /** Bus/train fare without the bill the policy asks for. */
  | 'BILL_MISSING'
  /** TA km above the km recorded for the day. */
  | 'KM_ABOVE_DAY'
  /** Another claim of the same kind on the same date. */
  | 'DUPLICATE';

export interface ExpenseItem {
  id: string;
  clientUuid: string | null;
  salesman: { id: string; name: string };
  workDayId: string | null;
  date: string;
  category: ExpenseCategory;
  travelMode: TravelMode | null;
  km: string | null;
  fromTown: { id: string; name: string } | null;
  toTown: { id: string; name: string } | null;
  description: string | null;
  amountClaimed: string;
  amountApproved: string | null;
  billPhotoPaths: string[];
  status: ExpenseStatus;
  adminRemark: string | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  isAutoDrafted: boolean;
  /** What the policy allows for this claim, when it sets a ceiling. */
  policyLimit: string | null;
  flags: ExpenseFlag[];
}

export interface ExpenseSummary {
  month: string;
  claimed: string;
  approved: string;
  pending: string;
  rejected: string;
  byStatus: Record<ExpenseStatus, number>;
}

export interface ExpenseListResult {
  items: ExpenseItem[];
  summary: ExpenseSummary;
}

/** A submitted work day in the admin queue, with its claims rolled up. */
export interface WorkDayQueueItem {
  id: string;
  date: string;
  status: WorkDayStatus;
  dayType: DayType;
  salesman: { id: string; name: string };
  startAt: string | null;
  endAt: string | null;
  endedProperly: boolean;
  workingMinutes: number | null;
  totalKm: string | null;
  gpsKm: string | null;
  visits: number;
  orderValue: string;
  claimed: string;
  pendingClaims: number;
  flags: string[];
  submittedAt: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationItem[];
  unread: number;
}

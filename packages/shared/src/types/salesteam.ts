import type {
  DayType,
  ExpenseCategory,
  ExpenseStatus,
  OrderStatus,
  PingSource,
  VisitOutcome,
  WorkDayStatus,
} from '../enums';

export type TodayStatus = 'NOT_STARTED' | 'IN_FIELD' | 'ENDED' | 'ON_LEAVE';

/** One row of the live "today" view (SPEC 4.5). */
export interface SalesmanToday {
  salesman: { id: string; name: string; phone: string; hqTown: string | null };
  status: TodayStatus;
  workDayId: string | null;
  dayType: DayType | null;
  start: { at: string; lat: number; lng: number; place: string | null } | null;
  end: { at: string; place: string | null } | null;
  lastPing: { at: string; lat: number; lng: number; source: PingSource } | null;
  visits: number;
  orders: number;
  orderValue: string;
  /** Minutes since the last recorded position, while in the field. */
  minutesSinceLastPing: number | null;
}

export interface SalesmanProfile {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  joiningDate: string | null;
  hqTown: { id: string; name: string } | null;
  territory: {
    districts: { id: string; name: string }[];
    towns: { id: string; name: string; districtName: string }[];
  };
  beats: {
    id: string;
    name: string;
    dayOfWeek: number | null;
    isActive: boolean;
    stops: {
      sequence: number;
      retailer: { id: string; shopName: string; townName: string } | null;
    }[];
  }[];
}

export type CalendarKind =
  'WORKED' | 'NOT_ENDED' | 'OPEN' | 'LEAVE' | 'HOLIDAY' | 'ABSENT' | 'FUTURE' | 'BEFORE_JOINING';

export interface CalendarDay {
  date: string;
  kind: CalendarKind;
  workDayId: string | null;
  status: WorkDayStatus | null;
  startAt: string | null;
  endAt: string | null;
  workingMinutes: number | null;
  visits: number;
  flagged: boolean;
}

export interface CalendarMonth {
  month: string;
  days: CalendarDay[];
  summary: { worked: number; leave: number; holiday: number; absent: number; notEnded: number };
}

export type TimelineEventKind = 'START' | 'VISIT' | 'LEAD' | 'PING' | 'GAP' | 'END';

export interface TimelineEvent {
  at: string;
  kind: TimelineEventKind;
  /** Index into `track` for the event's position, if it has one. */
  point: number | null;
  title: string;
  detail: string | null;
  flags: string[];
  /** For visits: the shop, outcome, order and photos. */
  visit?: {
    id: string;
    outcome: VisitOutcome;
    shop: string;
    town: string;
    orderNumber: string | null;
    orderValue: string | null;
    photos: number;
    distanceFromShopMeters: number | null;
  };
}

export interface TrackPoint {
  at: string;
  lat: number;
  lng: number;
  /** START, END, VISIT, ORDER, LEAD, TIMER, EXPENSE. */
  source: PingSource | 'VISIT';
  /** Running number shown on the map for starts, visits and ends. */
  label: number | null;
}

export interface DayDetail {
  day: {
    id: string;
    date: string;
    dayType: DayType;
    status: WorkDayStatus;
    endedProperly: boolean;
    startAt: string | null;
    endAt: string | null;
    workingMinutes: number | null;
    startPlace: string | null;
    endPlace: string | null;
    remarks: string | null;
  };
  salesman: { id: string; name: string };
  track: TrackPoint[];
  timeline: TimelineEvent[];
  totals: {
    odometerKm: string | null;
    gpsKm: string | null;
    visits: number;
    orders: number;
    orderValue: string;
    newShops: number;
    leads: number;
    taClaimed: string;
    daClaimed: string;
    otherClaimed: string;
  };
  flags: string[];
}

export interface RangeReport {
  from: string;
  to: string;
  salesman: { id: string; name: string };
  days: { worked: number; leave: number; notEnded: number; km: string };
  towns: { id: string; name: string; district: string; visits: number; days: number }[];
  shops: {
    id: string;
    name: string;
    town: string;
    visits: number;
    orders: number;
    orderValue: string;
    lastVisit: string;
  }[];
  orders: {
    id: string;
    orderNumber: string;
    date: string;
    shop: string;
    status: OrderStatus;
    amount: string;
  }[];
  expenses: {
    id: string;
    date: string;
    category: ExpenseCategory;
    status: ExpenseStatus;
    claimed: string;
    approved: string | null;
    description: string | null;
  }[];
  totals: { visits: number; orders: number; orderValue: string; claimed: string; approved: string };
}

export type FieldFlagKind =
  'FAR_CHECK_IN' | 'NO_VISITS' | 'ODOMETER_ABOVE_GPS' | 'NOT_ENDED' | 'TRACK_GAP';

export interface FieldFlag {
  kind: FieldFlagKind;
  date: string;
  salesman: { id: string; name: string };
  workDayId: string;
  detail: string;
}

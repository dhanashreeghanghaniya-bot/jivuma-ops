import type {
  DayType,
  LeadType,
  RetailerCategory,
  TownType,
  VisitOutcome,
  VisitPhotoType,
  WorkDayStatus,
} from '../enums';

/**
 * Everything the field app needs to work offline for one salesman, fetched once
 * after login and cached on the phone (SPEC 5.3). Only his territory is in it.
 */
export interface FieldBootstrap {
  generatedAt: string;
  salesman: { id: string; name: string; hqTown: { id: string; name: string } | null };
  districts: { id: string; name: string; nameGu: string | null }[];
  towns: {
    id: string;
    name: string;
    type: TownType;
    districtId: string;
    lat: number | null;
    lng: number | null;
  }[];
  distributors: {
    id: string;
    firmName: string;
    phone: string;
    townId: string;
    coveredTownIds: string[];
  }[];
  retailers: FieldRetailer[];
  products: FieldProduct[];
  beats: { id: string; name: string; dayOfWeek: number | null; stops: FieldBeatStop[] }[];
}

export interface FieldRetailer {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  townId: string;
  lat: number;
  lng: number;
  category: RetailerCategory;
  distributorId: string;
  isVerified: boolean;
}

export interface FieldProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  packSize: string;
  unitsPerCase: number;
  /** Price per unit to a retailer, as a decimal string. */
  retailerPrice: string;
  mrp: string;
}

export interface FieldBeatStop {
  sequence: number;
  townId: string | null;
  retailerId: string | null;
}

export interface WorkDayFlags {
  /** Start or end GPS fix was worse than the accuracy limit. */
  poorStartAccuracy: boolean;
  poorEndAccuracy: boolean;
  /** The salesman never pressed End Day; closed later. */
  notEndedProperly: boolean;
  /** Odometer km more than 1.3x GPS km (SPEC 7). */
  odometerAboveGps: boolean;
  noVisits: boolean;
}

export interface WorkDaySummary {
  id: string;
  date: string;
  status: WorkDayStatus;
  dayType: DayType;
  beat: { id: string; name: string } | null;
  startAt: string | null;
  startPlaceLabel: string | null;
  startAccuracyM: number | null;
  startOdometer: number | null;
  endAt: string | null;
  endPlaceLabel: string | null;
  endAccuracyM: number | null;
  endOdometer: number | null;
  endedProperly: boolean;
  workingMinutes: number | null;
  totalKm: string | null;
  gpsKm: string | null;
  remarks: string | null;
  submittedAt: string | null;
  totals: { visits: number; orders: number; orderValue: string; newShops: number; leads: number };
  flags: WorkDayFlags;
}

/** `GET /workdays/current`: what the Today screen renders. */
export interface CurrentWorkDay {
  /** The open day, if any — today's or one left open from an earlier date. */
  day: WorkDaySummary | null;
  /** True when `day` is from an earlier date and must be closed before starting. */
  isStale: boolean;
  /** Today's day once ended, so the screen can show its summary. */
  endedToday: WorkDaySummary | null;
  serverTime: string;
}

export interface VisitListItem {
  id: string;
  clientUuid: string | null;
  workDayId: string;
  checkInAt: string;
  outcome: VisitOutcome;
  noOrderReason: string | null;
  notes: string | null;
  distanceFromShopMeters: number | null;
  isFarFromShop: boolean;
  salesman: { id: string; name: string };
  town: { id: string; name: string };
  shop: { id: string | null; name: string; isNew: boolean };
  order: { id: string; orderNumber: string; totalAmount: string; itemCount: number } | null;
  photos: { id: string; path: string; type: VisitPhotoType }[];
}

export interface PresignedUpload {
  path: string;
  /** PUT the file body here, with the same Content-Type, before it expires. */
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface FieldLeadResult {
  id: string;
  type: LeadType;
  name: string;
  town: { id: string; name: string };
}

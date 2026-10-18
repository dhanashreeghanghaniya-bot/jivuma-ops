import type { CoverageStatus, LeadStage, PartnerStatus, TownType, Zone } from '../enums';

export interface DistrictCounts {
  superStockists: number;
  distributors: number;
  retailers: number;
  openLeads: number;
  towns: number;
  townsCovered: number;
  ordersThisPeriod: number;
  orderValueThisPeriod: string;
}

/** One row per district, everything the map needs in a single call (SPEC 8). */
export interface DistrictMapItem {
  id: string;
  /** Join key against the GeoJSON feature property of the same name. */
  code: string;
  name: string;
  nameGu: string;
  zone: Zone;
  lat: number;
  lng: number;
  coverageStatus: CoverageStatus;
  counts: DistrictCounts;
}

export interface CoverageKpis {
  districtsCovered: number;
  districtsTotal: number;
  activeDistributors: number;
  activeRetailers: number;
  openLeads: number;
  ordersThisPeriod: number;
  orderValueThisPeriod: string;
  salesmenInFieldToday: number;
}

export interface DistrictsMapResponse {
  districts: DistrictMapItem[];
  kpis: CoverageKpis;
}

export interface TownCoverage {
  id: string;
  name: string;
  type: TownType;
  lat: number;
  lng: number;
  population: number | null;
  distributors: number;
  retailers: number;
  openLeads: number;
  isCovered: boolean;
}

export interface PartnerSummaryCard {
  id: string;
  firmName: string;
  ownerName: string;
  phone: string;
  address: string;
  townName: string;
  status: PartnerStatus;
  lastOrderAt: string | null;
}

export interface LeadSummaryCard {
  id: string;
  name: string;
  firmName: string | null;
  phone: string;
  townName: string;
  stage: LeadStage;
  followUpAt: string | null;
  assignedToName: string | null;
}

/** Everything the district side panel renders (SPEC 4.1). */
export interface DistrictSummary {
  id: string;
  code: string;
  name: string;
  nameGu: string;
  zone: Zone;
  lat: number;
  lng: number;
  coverageStatus: CoverageStatus;
  counts: DistrictCounts;
  towns: TownCoverage[];
  superStockists: PartnerSummaryCard[];
  distributors: PartnerSummaryCard[];
  openLeads: LeadSummaryCard[];
  salesmen: { id: string; name: string; phone: string }[];
}

export interface TownListItem {
  id: string;
  name: string;
  type: TownType;
  lat: number;
  lng: number;
  population: number | null;
  district: { id: string; name: string; code: string };
  counts: { distributors: number; retailers: number; openLeads: number };
}

export interface DistrictListItem {
  id: string;
  code: string;
  name: string;
  nameGu: string;
  zone: Zone;
  lat: number;
  lng: number;
  coverageStatus: CoverageStatus;
  townCount: number;
}

/** Map pins, kept deliberately small because they are fetched in bulk. */
export interface MapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  townName: string;
  districtCode: string;
  phone?: string;
  status?: string;
}

export interface MapMarkersResponse {
  superStockists: MapMarker[];
  distributors: MapMarker[];
  retailers: MapMarker[];
  leads: MapMarker[];
}

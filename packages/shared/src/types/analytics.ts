import type { CoverageStatus, LeadSource, LeadStage, LeadType, OrderLevel, Zone } from '../enums';
import type { SalesGroup } from '../schemas/analytics';

export interface SalesReportRow {
  key: string;
  label: string;
  /** e.g. the district of a town, the town of a distributor, the SKU of a product. */
  detail: string | null;
  /** Order value per month (`YYYY-MM` -> rupees as a decimal string). */
  byMonth: Record<string, string>;
  total: string;
  orders: number;
  /** Change of the last month over the one before, e.g. 0.12 = +12%. Null when it cannot be worked out. */
  momChange: number | null;
}

export interface SalesReport {
  groupBy: SalesGroup;
  level: OrderLevel;
  months: string[];
  rows: SalesReportRow[];
  monthTotals: Record<string, string>;
  grandTotal: string;
  orders: number;
}

export interface CoverageReportRow {
  district: { id: string; code: string; name: string; zone: Zone };
  status: CoverageStatus;
  towns: number;
  townsCovered: number;
  superStockists: number;
  distributors: number;
  retailers: number;
  openLeads: number;
  /** Secondary sales in the current month. */
  salesThisMonth: string;
}

export interface CoverageReport {
  rows: CoverageReportRow[];
  byStatus: Record<CoverageStatus, number>;
  towns: number;
  townsCovered: number;
}

export interface LeadFunnelReport {
  stages: { stage: LeadStage; count: number; value: string }[];
  byType: {
    type: LeadType;
    total: number;
    won: number;
    lost: number;
    open: number;
    conversionRate: number;
  }[];
  bySource: { source: LeadSource; total: number; won: number; conversionRate: number }[];
  bySalesman: {
    salesman: { id: string; name: string } | null;
    total: number;
    won: number;
    open: number;
    overdue: number;
  }[];
  totals: { total: number; won: number; lost: number; open: number; conversionRate: number };
}

import type { ReportStatus } from '../enums';

export interface SalaryStructureItem {
  id: string;
  salesman: { id: string; name: string };
  basic: string;
  hra: string;
  fixedAllowance: string;
  monthly: string;
  effectiveFrom: string;
  /** The revision in force today for this salesman. */
  isCurrent: boolean;
}

export interface IncentiveItem {
  id: string;
  salesman: { id: string; name: string };
  month: string;
  amount: string;
  reason: string;
  createdBy: { id: string; name: string } | null;
  /** False once the month's report for this salesman is FINAL or PAID. */
  editable: boolean;
}

export interface CostReportItem {
  id: string;
  salesman: { id: string; name: string; isActive: boolean };
  month: string;
  workingDays: number;
  leaves: number;
  salary: string;
  taTotal: string;
  daTotal: string;
  otherExpenses: string;
  incentives: string;
  deductions: string;
  deductionNote: string | null;
  grandTotal: string;
  ordersCount: number;
  orderValue: string;
  visitsCount: number;
  newRetailers: number;
  /** Grand total / order value, e.g. 0.0824 = 8.24%. Null with no sales. */
  costToSalesRatio: string | null;
  status: ReportStatus;
  generatedAt: string;
  finalisedAt: string | null;
  paidAt: string | null;
  /** Claims for the month still waiting for review; they are not in the totals. */
  pendingClaims: number;
}

export interface CostReportMonth {
  month: string;
  items: CostReportItem[];
  totals: {
    salary: string;
    expenses: string;
    incentives: string;
    deductions: string;
    grandTotal: string;
    orderValue: string;
  };
}

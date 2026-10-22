import type { LeadActivityType, LeadSource, LeadStage, LeadType } from '../enums';

export interface LeadListItem {
  id: string;
  type: LeadType;
  name: string;
  firmName: string | null;
  phone: string;
  source: LeadSource;
  stage: LeadStage;
  lostReason: string | null;
  expectedInvestment: string | null;
  followUpAt: string | null;
  /** Derived server-side so every screen agrees on what "overdue" means. */
  isOverdue: boolean;
  notes: string | null;
  convertedAt: string | null;
  createdAt: string;
  town: { id: string; name: string };
  district: { id: string; name: string; code: string };
  assignedTo: { id: string; name: string } | null;
  activityCount: number;
  lastActivityAt: string | null;
}

export interface LeadActivityItem {
  id: string;
  type: LeadActivityType;
  note: string;
  at: string;
  user: { id: string; name: string };
}

export interface LeadDetail extends LeadListItem {
  activities: LeadActivityItem[];
}

/** One kanban column: the cards plus the true total behind them. */
export interface LeadPipelineColumn {
  stage: LeadStage;
  total: number;
  value: string;
  leads: LeadListItem[];
}

export interface LeadPipeline {
  columns: LeadPipelineColumn[];
  overdueCount: number;
}

export interface LeadFunnelStage {
  stage: LeadStage;
  count: number;
  value: string;
}

export interface LeadFunnel {
  stages: LeadFunnelStage[];
  totalLeads: number;
  wonCount: number;
  lostCount: number;
  /** Won as a share of everything that reached a terminal stage, 0-100. */
  conversionRate: number;
}

/** What a conversion produced, so the UI can link straight to the new partner. */
export interface LeadConversionResult {
  leadId: string;
  partnerType: LeadType;
  partnerId: string;
  partnerName: string;
}

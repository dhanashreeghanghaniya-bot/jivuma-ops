import { z } from 'zod';

/** The entities the owner can bulk-load (SPEC 3). */
export const ImportEntity = {
  TOWNS: 'towns',
  SUPER_STOCKISTS: 'super-stockists',
  DISTRIBUTORS: 'distributors',
  RETAILERS: 'retailers',
  LEADS: 'leads',
  DISTRICTS: 'districts',
} as const;
export type ImportEntity = (typeof ImportEntity)[keyof typeof ImportEntity];

export const importEntitySchema = z.enum(
  Object.values(ImportEntity) as [ImportEntity, ...ImportEntity[]],
);

export const importEntityParamsSchema = z.object({ entity: importEntitySchema });

/** Rows come straight from the sheet, so every cell starts life as a string. */
export const importRowSchema = z.record(z.string(), z.string());
export type ImportRow = z.infer<typeof importRowSchema>;

export const IMPORT_MAX_ROWS = 5_000;

export const importCommitSchema = z.object({
  rows: z.array(importRowSchema).min(1, 'Nothing to import').max(IMPORT_MAX_ROWS),
});
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export type ImportRowAction = 'CREATE' | 'UPDATE' | 'ERROR';

export interface ImportRowIssue {
  column: string;
  message: string;
}

export interface ImportRowResult {
  /** 1-based row number as it appears in the sheet, excluding the header. */
  rowNumber: number;
  action: ImportRowAction;
  issues: ImportRowIssue[];
  /** Human-readable summary of what the row resolved to, for the preview table. */
  summary: string;
}

export interface ImportPreview {
  entity: ImportEntity;
  columns: string[];
  totalRows: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  rows: ImportRowResult[];
}

export interface ImportCommitResult {
  entity: ImportEntity;
  created: number;
  updated: number;
  skipped: number;
}

/** Column definitions drive both the downloadable template and the preview header. */
export interface ImportColumn {
  key: string;
  required: boolean;
  hint: string;
  example: string;
}

export const IMPORT_COLUMNS: Record<ImportEntity, ImportColumn[]> = {
  districts: [
    { key: 'code', required: true, hint: 'Existing district code', example: 'RJT' },
    { key: 'nameGu', required: false, hint: 'Gujarati name', example: 'રાજકોટ' },
    { key: 'lat', required: false, hint: 'Latitude', example: '22.303900' },
    { key: 'lng', required: false, hint: 'Longitude', example: '70.802200' },
    {
      key: 'zone',
      required: false,
      hint: 'SAURASHTRA | KUTCH | NORTH_GUJARAT | CENTRAL_GUJARAT | SOUTH_GUJARAT',
      example: 'SAURASHTRA',
    },
  ],
  towns: [
    { key: 'districtCode', required: true, hint: 'District code', example: 'RJT' },
    { key: 'name', required: true, hint: 'Town name', example: 'Gondal' },
    { key: 'lat', required: true, hint: 'Latitude', example: '21.960800' },
    { key: 'lng', required: true, hint: 'Longitude', example: '70.802200' },
    { key: 'type', required: false, hint: 'CITY | TOWN | VILLAGE', example: 'TOWN' },
    { key: 'population', required: false, hint: 'Whole number', example: '112000' },
  ],
  'super-stockists': [
    { key: 'firmName', required: true, hint: 'Firm name', example: 'Shree Traders' },
    { key: 'ownerName', required: true, hint: 'Owner name', example: 'Mahesh Patel' },
    { key: 'phone', required: true, hint: '10-digit mobile', example: '9876543210' },
    { key: 'altPhone', required: false, hint: '10-digit mobile', example: '' },
    { key: 'email', required: false, hint: 'Email', example: '' },
    { key: 'gstin', required: false, hint: '15-character GSTIN', example: '' },
    { key: 'address', required: true, hint: 'Full address', example: 'Main Bazaar, Rajkot' },
    { key: 'districtCode', required: true, hint: 'District of the town', example: 'RJT' },
    { key: 'townName', required: true, hint: 'Existing town name', example: 'Rajkot' },
    { key: 'status', required: false, hint: 'ACTIVE | INACTIVE | ON_HOLD', example: 'ACTIVE' },
    {
      key: 'coveredDistrictCodes',
      required: false,
      hint: 'Semicolon-separated district codes',
      example: 'RJT;JND',
    },
  ],
  distributors: [
    { key: 'firmName', required: true, hint: 'Firm name', example: 'Gondal Distributors' },
    { key: 'ownerName', required: true, hint: 'Owner name', example: 'Kiran Solanki' },
    { key: 'phone', required: true, hint: '10-digit mobile', example: '9876543211' },
    { key: 'altPhone', required: false, hint: '10-digit mobile', example: '' },
    { key: 'email', required: false, hint: 'Email', example: '' },
    { key: 'gstin', required: false, hint: '15-character GSTIN', example: '' },
    { key: 'address', required: true, hint: 'Full address', example: 'Station Road, Gondal' },
    { key: 'districtCode', required: true, hint: 'District of the town', example: 'RJT' },
    { key: 'townName', required: true, hint: 'Existing town name', example: 'Gondal' },
    {
      key: 'superStockistFirmName',
      required: true,
      hint: 'Existing super stockist firm',
      example: 'Shree Traders',
    },
    { key: 'creditLimit', required: false, hint: 'Rupees', example: '250000' },
    { key: 'creditDays', required: false, hint: 'Days', example: '30' },
    { key: 'status', required: false, hint: 'ACTIVE | INACTIVE | ON_HOLD', example: 'ACTIVE' },
  ],
  retailers: [
    { key: 'shopName', required: true, hint: 'Shop name', example: 'Shree Kirana Store' },
    { key: 'ownerName', required: true, hint: 'Owner name', example: 'Ramesh Shah' },
    { key: 'phone', required: true, hint: '10-digit mobile', example: '9876543212' },
    { key: 'address', required: true, hint: 'Full address', example: 'Bus Stand Road, Gondal' },
    { key: 'districtCode', required: true, hint: 'District of the town', example: 'RJT' },
    { key: 'townName', required: true, hint: 'Existing town name', example: 'Gondal' },
    {
      key: 'distributorFirmName',
      required: true,
      hint: 'Existing distributor firm',
      example: 'Gondal Distributors',
    },
    { key: 'lat', required: true, hint: 'Latitude', example: '21.961200' },
    { key: 'lng', required: true, hint: 'Longitude', example: '70.801500' },
    {
      key: 'category',
      required: false,
      hint: 'KIRANA | SUPERMARKET | GENERAL | HORECA | OTHER',
      example: 'KIRANA',
    },
  ],
  leads: [
    { key: 'type', required: true, hint: 'SS | DISTRIBUTOR | RETAILER', example: 'DISTRIBUTOR' },
    { key: 'name', required: true, hint: 'Contact name', example: 'Bhavesh Mehta' },
    { key: 'firmName', required: false, hint: 'Firm name', example: 'Mehta Agencies' },
    { key: 'phone', required: true, hint: '10-digit mobile', example: '9876543213' },
    { key: 'districtCode', required: true, hint: 'District code', example: 'PBR' },
    { key: 'townName', required: true, hint: 'Existing town name', example: 'Porbandar' },
    {
      key: 'source',
      required: false,
      hint: 'FIELD | REFERRAL | INBOUND_CALL | EXPO | OTHER',
      example: 'FIELD',
    },
    {
      key: 'stage',
      required: false,
      hint: 'NEW | CONTACTED | MEETING_DONE | NEGOTIATION | WON | LOST',
      example: 'NEW',
    },
    { key: 'expectedInvestment', required: false, hint: 'Rupees', example: '500000' },
    { key: 'followUpAt', required: false, hint: 'YYYY-MM-DD', example: '2026-11-15' },
    { key: 'notes', required: false, hint: 'Free text', example: '' },
  ],
};

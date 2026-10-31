import type { ImportRow, ImportRowIssue } from '@juma/shared';

/** Lookups shared by every row so the whole file costs a fixed number of queries. */
export interface ImportContext {
  districtsByCode: Map<string, { id: string; name: string }>;
  /** Keyed `<districtId>::<lowercased town name>`. */
  townsByDistrictAndName: Map<string, { id: string; name: string }>;
  superStockistsByFirm: Map<string, { id: string; firmName: string }>;
  distributorsByFirm: Map<string, { id: string; firmName: string }>;
  existingSkus: Set<string>;
}

export interface RowOutcome<T> {
  issues: ImportRowIssue[];
  /** Present only when the row is valid. */
  value?: T;
  /** What the row will do, shown in the preview. */
  summary: string;
  isUpdate: boolean;
}

export interface EntityHandler<T> {
  /** Validates and resolves one row against the shared lookups. */
  parseRow: (row: ImportRow, ctx: ImportContext, rowNumber: number) => RowOutcome<T>;
  /** Applies the validated rows. Returns how many were created and updated. */
  apply: (
    values: T[],
    actorId: string,
  ) => Promise<{ created: number; updated: number }>;
}

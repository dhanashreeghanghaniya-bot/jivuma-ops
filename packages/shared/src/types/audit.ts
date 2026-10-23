import type { AuditActionName } from '../schemas/audit';

/** One field that differs between the before and after snapshots. */
export interface AuditChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: AuditActionName;
  entity: string;
  entityId: string;
  user: { id: string; name: string } | null;
  /** Top-level fields that changed; for a create or delete, every field that was set. */
  changes: AuditChange[];
  before: unknown;
  after: unknown;
}

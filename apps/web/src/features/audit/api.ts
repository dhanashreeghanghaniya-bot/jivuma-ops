import { useQuery } from '@tanstack/react-query';
import type { AuditActionName, AuditEntry } from '@juma/shared';
import { api } from '@/lib/api-client';

export interface AuditFilters {
  page: number;
  entity?: string;
  action?: AuditActionName;
  userId?: string;
  from?: string;
  to?: string;
}

export function useAuditLog(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      const { data, meta } = await api.get<AuditEntry[]>('/audit-logs', {
        query: { ...filters, limit: 50 },
      });
      return { items: data ?? [], meta };
    },
    placeholderData: (previous) => previous,
  });
}

export function useAuditEntities() {
  return useQuery({
    queryKey: ['audit-logs', 'entities'],
    queryFn: async () => (await api.get<string[]>('/audit-logs/entities')).data ?? [],
    staleTime: 5 * 60_000,
  });
}

/** Where an entry's record can be opened, for the entities that have a page of their own. */
export function auditHref(entity: string, id: string): string | null {
  switch (entity) {
    case 'Order':
      return `/admin/orders/${id}`;
    case 'SuperStockist':
      return `/admin/partners/super-stockists/${id}`;
    case 'Distributor':
      return `/admin/partners/distributors/${id}`;
    case 'Retailer':
      return `/admin/partners/retailers/${id}`;
    case 'WorkDay':
      return `/admin/sales-team/days/${id}`;
    default:
      return null;
  }
}

/** Short, readable rendering of a logged value. */
export function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const json = JSON.stringify(value);
  return json.length > 120 ? `${json.slice(0, 117)}...` : json;
}

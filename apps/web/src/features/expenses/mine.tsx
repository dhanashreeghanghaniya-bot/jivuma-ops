'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CloudOff, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ExpenseItem, ExpenseListResult } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { api, ApiRequestError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatINR } from '@/lib/format';
import { withOfflineCopy } from '@/features/field/api';
import { discard, useOutbox } from '@/features/field/offline/outbox';
import { CATEGORY_LABELS, ExpenseStatusPill, FlagPills, MODE_LABELS } from './components';
import { useQueryClient } from '@tanstack/react-query';

/** One row as the salesman sees it: from the server, or still on the phone. */
export interface MyExpenseRow {
  key: string;
  serverId: string | null;
  outboxId: string | null;
  date: string;
  label: string;
  description: string | null;
  amountClaimed: string;
  amountApproved: string | null;
  item: ExpenseItem | null;
  billCount: number;
  pending: boolean;
  error: string | null;
  dead: boolean;
}

/**
 * The salesman's claims for a month or a work day, readable offline, with
 * anything still in the outbox merged in (matched on the client UUID).
 */
export function useMyExpenses(filter: { month?: string; workDayId?: string }) {
  const { user } = useAuth();
  const { items: outbox } = useOutbox();
  const key = filter.workDayId ? `day:${filter.workDayId}` : `month:${filter.month}`;
  const query = useQuery({
    queryKey: ['expenses', 'mine', key],
    queryFn: () =>
      withOfflineCopy(
        `expenses:${user?.id}:${key}`,
        async () => (await api.get<ExpenseListResult>('/expenses', { query: filter })).data,
      ),
    enabled: Boolean(user),
  });

  const rows = useMemo<MyExpenseRow[]>(() => {
    const server = query.data?.items ?? [];
    const queued = outbox.filter(
      (i): i is Extract<typeof i, { kind: 'expense' }> =>
        i.kind === 'expense' &&
        (filter.workDayId
          ? i.payload.workDayId === filter.workDayId
          : !i.payload.workDayId && (i.payload.date ?? '').startsWith(filter.month ?? '')),
    );
    const byUuid = new Map(queued.map((q) => [q.payload.clientUuid, q]));
    const fromServer: MyExpenseRow[] = server.map((e) => {
      const q = e.clientUuid ? byUuid.get(e.clientUuid) : undefined;
      return {
        key: e.id,
        serverId: e.id,
        outboxId: q?.id ?? null,
        date: e.date,
        label:
          CATEGORY_LABELS[e.category] +
          (e.travelMode ? ` · ${MODE_LABELS[e.travelMode]}` : '') +
          (e.km ? ` · ${Number(e.km)} km` : ''),
        description: e.description,
        amountClaimed: e.amountClaimed,
        amountApproved: e.amountApproved,
        item: e,
        billCount: e.billPhotoPaths.length + (q ? q.photos.filter((p) => !p.path).length : 0),
        pending: false,
        error: q?.error ?? null,
        dead: Boolean(q?.dead),
      };
    });
    const serverUuids = new Set(server.map((e) => e.clientUuid));
    const fromQueue: MyExpenseRow[] = queued
      .filter((q) => !serverUuids.has(q.payload.clientUuid))
      .map((q) => ({
        key: q.id,
        serverId: null,
        outboxId: q.id,
        date: q.payload.date ?? '',
        label:
          CATEGORY_LABELS[q.payload.category] +
          (q.payload.travelMode ? ` · ${MODE_LABELS[q.payload.travelMode]}` : ''),
        description: q.payload.description ?? null,
        amountClaimed: q.payload.amountClaimed.toFixed(2),
        amountApproved: null,
        item: null,
        billCount: q.photos.length,
        pending: true,
        error: q.error ?? null,
        dead: Boolean(q.dead),
      }));
    return [...fromQueue, ...fromServer];
  }, [query.data, outbox, filter.workDayId, filter.month]);

  return { ...query, rows, summary: query.data?.summary };
}

export function MyExpenseList({
  rows,
  showDate = true,
}: {
  rows: MyExpenseRow[];
  showDate?: boolean;
}) {
  const qc = useQueryClient();

  const remove = async (row: MyExpenseRow) => {
    try {
      if (row.serverId) await api.delete(`/expenses/${row.serverId}`);
      if (row.outboxId) await discard(row.outboxId);
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense removed');
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError ? err.message : 'No network. Try again with signal.',
      );
    }
  };

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const editable = row.pending || (row.item?.status === 'DRAFT' && !row.item.isAutoDrafted);
        return (
          <div key={row.key} className="space-y-1 rounded-md border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{row.label}</p>
                <p className="text-muted-foreground text-xs">
                  {[
                    showDate && row.date ? formatDate(row.date) : null,
                    row.description,
                    row.item?.isAutoDrafted ? 'from policy' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">{formatINR(row.amountClaimed, true)}</p>
                {row.amountApproved !== null &&
                row.item?.status !== 'SUBMITTED' &&
                row.item?.status !== 'DRAFT' ? (
                  <p className="text-muted-foreground text-xs tabular-nums">
                    approved {formatINR(row.amountApproved, true)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {row.pending ? (
                <span className="flex items-center gap-1 text-xs text-amber-700">
                  <CloudOff className="h-3.5 w-3.5" />
                  {row.dead ? `Refused: ${row.error}` : 'Waiting to sync'}
                </span>
              ) : row.item ? (
                <ExpenseStatusPill status={row.item.status} />
              ) : null}
              {row.item ? <FlagPills flags={row.item.flags} /> : null}
              {row.billCount > 0 ? (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Paperclip className="h-3.5 w-3.5" />
                  {row.billCount}
                </span>
              ) : null}
              {editable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground ml-auto h-8"
                  onClick={() => void remove(row)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>
            {row.item?.adminRemark ? (
              <p className="text-xs">Admin: “{row.item.adminRemark}”</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

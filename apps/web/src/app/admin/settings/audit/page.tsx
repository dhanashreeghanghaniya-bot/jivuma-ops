'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AUDIT_ACTIONS, type AuditActionName, type AuditEntry } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import {
  auditHref,
  auditValue,
  useAuditEntities,
  useAuditLog,
  type AuditFilters,
} from '@/features/audit/api';

const ALL = 'ALL';

const ACTION_BADGE: Record<AuditActionName, 'success' | 'secondary' | 'destructive'> = {
  CREATE: 'success',
  UPDATE: 'secondary',
  DELETE: 'destructive',
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function Changes({ entry }: { entry: AuditEntry }) {
  if (entry.changes.length === 0) {
    return <p className="text-muted-foreground text-xs">No field-level changes were recorded.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground text-left">
          <th className="w-48 py-1 pr-3 font-medium">Field</th>
          <th className="py-1 pr-3 font-medium">Before</th>
          <th className="py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {entry.changes.map((c) => (
          <tr key={c.field} className="border-t align-top">
            <td className="py-1 pr-3 font-mono">{c.field}</td>
            <td className="break-all py-1 pr-3 text-red-700">{auditValue(c.before)}</td>
            <td className="break-all py-1 text-emerald-700">{auditValue(c.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** SPEC 2.6: who changed what and when, across partners, orders, expenses and reports. */
export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>({ page: 1 });
  const [open, setOpen] = useState<string | null>(null);
  const log = useAuditLog(filters);
  const entities = useAuditEntities();
  const users = useUsers({ page: 1 });

  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const totalPages = Number(log.data?.meta?.totalPages ?? 1);
  const total = Number(log.data?.meta?.total ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit log</CardTitle>
        <CardDescription>
          Every create, update and delete, newest first. Open a row to see what changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            value={filters.entity ?? ALL}
            onValueChange={(v) => set({ entity: v === ALL ? undefined : v })}
          >
            <SelectTrigger aria-label="Record type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All records</SelectItem>
              {(entities.data ?? []).map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.action ?? ALL}
            onValueChange={(v) => set({ action: v === ALL ? undefined : (v as AuditActionName) })}
          >
            <SelectTrigger aria-label="Action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {titleCase(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.userId ?? ALL}
            onValueChange={(v) => set({ userId: v === ALL ? undefined : v })}
          >
            <SelectTrigger aria-label="User">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All users</SelectItem>
              {(users.data?.items ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            aria-label="From"
            value={filters.from ?? ''}
            onChange={(e) => set({ from: e.target.value || undefined })}
          />
          <Input
            type="date"
            aria-label="To"
            value={filters.to ?? ''}
            onChange={(e) => set({ to: e.target.value || undefined })}
          />
        </div>

        {log.isPending ? (
          <LoadingState />
        ) : log.isError ? (
          <ErrorState onRetry={() => void log.refetch()} />
        ) : log.data.items.length === 0 ? (
          <EmptyState message="Nothing has been logged for this filter." />
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="w-40">When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead className="w-24">Action</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Fields</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.data.items.map((entry) => {
                    const expanded = open === entry.id;
                    const href = auditHref(entry.entity, entry.entityId);
                    return (
                      <Fragment key={entry.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setOpen(expanded ? null : entry.id)}
                        >
                          <TableCell>
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {formatDateTime(entry.at)}
                          </TableCell>
                          <TableCell className="text-sm">{entry.user?.name ?? 'System'}</TableCell>
                          <TableCell>
                            <Badge variant={ACTION_BADGE[entry.action]}>
                              {titleCase(entry.action)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.entity}{' '}
                            {href ? (
                              <Link
                                href={href}
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary font-mono text-xs underline"
                              >
                                {entry.entityId}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground font-mono text-xs">
                                {entry.entityId}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
                            {entry.changes.map((c) => c.field).join(', ') || '-'}
                          </TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={5}>
                              <Changes entry={entry} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {total} entries · page {filters.page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

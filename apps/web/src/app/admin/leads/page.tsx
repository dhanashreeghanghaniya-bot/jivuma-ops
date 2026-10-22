'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Columns3, Loader2, Plus, Rows3, Search } from 'lucide-react';
import { LeadSource, LeadType, Role, type LeadDetail, type LeadListItem } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatINR, formatNumber, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useDistricts } from '@/features/geo/api';
import {
  useLeadPipeline,
  useLeadsList,
  useSalesmenOptions,
  type LeadFilters,
} from '@/features/leads/api';
import { ConvertLeadDialog } from '@/features/leads/convert-dialog';
import { LeadDetailSheet } from '@/features/leads/lead-detail-sheet';
import { LeadDialog } from '@/features/leads/lead-dialog';
import {
  SOURCE_LABELS,
  STAGE_ACCENTS,
  STAGE_LABELS,
  TYPE_LABELS,
} from '@/features/leads/lead-labels';

const ALL = 'ALL';

function LeadCard({ lead, onOpen }: { lead: LeadListItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-background hover:border-foreground/30 focus-visible:ring-ring w-full rounded-md border p-3 text-left shadow-sm transition focus:outline-none focus-visible:ring-2"
    >
      <p className="truncate text-sm font-medium">{lead.firmName ?? lead.name}</p>
      <p className="text-muted-foreground truncate text-xs">
        {lead.firmName ? `${lead.name} · ` : ''}
        {lead.town.name}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="font-normal">
          {TYPE_LABELS[lead.type]}
        </Badge>
        {lead.expectedInvestment ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatINR(lead.expectedInvestment)}
          </span>
        ) : null}
      </div>
      {lead.followUpAt ? (
        <p
          className={cn(
            'mt-2 text-xs tabular-nums',
            lead.isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}
        >
          {lead.isOverdue ? 'Overdue since ' : 'Follow up '}
          {formatDate(lead.followUpAt)}
        </p>
      ) : null}
      {lead.assignedTo ? (
        <p className="text-muted-foreground mt-1 truncate text-xs">{lead.assignedTo.name}</p>
      ) : null}
    </button>
  );
}

function LeadsContent() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<LeadType | 'ALL'>(ALL);
  const [districtId, setDistrictId] = useState(ALL);
  const [assignedToId, setAssignedToId] = useState(ALL);
  const [source, setSource] = useState<LeadSource | 'ALL'>(ALL);
  // Set by the dashboard's overdue follow-ups card.
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get('overdue') === '1');
  const [page, setPage] = useState(1);

  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<LeadDetail | null>(null);

  const debouncedSearch = useDebouncedValue(search);
  const districtsQuery = useDistricts();
  const { data: users = [] } = useSalesmenOptions();

  const filters = useMemo<LeadFilters>(
    () => ({
      search: debouncedSearch.trim() || undefined,
      type,
      districtId,
      assignedToId,
      source,
      overdue: overdueOnly || undefined,
    }),
    [debouncedSearch, type, districtId, assignedToId, source, overdueOnly],
  );

  const pipeline = useLeadPipeline(filters, view === 'kanban');
  const table = useLeadsList({ ...filters, page }, view === 'table');

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const salesmen = users.filter((u) => u.role === Role.SALESMAN);
  const totalPages = Number(table.data?.meta?.totalPages ?? 1);
  const activeQuery = view === 'kanban' ? pipeline : table;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground text-sm">
            Prospective super stockists, distributors and shops, by stage.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-md border">
            {(['kanban', 'table'] as const).map((item) => (
              <Button
                key={item}
                variant="ghost"
                size="sm"
                aria-pressed={view === item}
                className={cn(
                  'rounded-none',
                  view === item && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
                onClick={() => setView(item)}
              >
                {item === 'kanban' ? (
                  <Columns3 className="h-4 w-4" />
                ) : (
                  <Rows3 className="h-4 w-4" />
                )}
                {item === 'kanban' ? 'Pipeline' : 'Table'}
              </Button>
            ))}
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add lead
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => resetPage(setSearch)(e.target.value)}
                placeholder="Search name, firm or mobile"
                className="pl-9"
              />
              {activeQuery.isFetching && !activeQuery.isPending ? (
                <Loader2 className="text-muted-foreground absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" />
              ) : null}
            </div>

            <Select value={type} onValueChange={resetPage(setType) as (v: string) => void}>
              <SelectTrigger className="lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {(Object.keys(TYPE_LABELS) as LeadType[]).map((item) => (
                  <SelectItem key={item} value={item}>
                    {TYPE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={districtId} onValueChange={resetPage(setDistrictId)}>
              <SelectTrigger className="lg:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All districts</SelectItem>
                {(districtsQuery.data ?? []).map((district) => (
                  <SelectItem key={district.id} value={district.id}>
                    {district.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assignedToId} onValueChange={resetPage(setAssignedToId)}>
              <SelectTrigger className="lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Anyone</SelectItem>
                {salesmen.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={source} onValueChange={resetPage(setSource) as (v: string) => void}>
              <SelectTrigger className="lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sources</SelectItem>
                {(Object.keys(SOURCE_LABELS) as LeadSource[]).map((item) => (
                  <SelectItem key={item} value={item}>
                    {SOURCE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-input accent-primary h-4 w-4 rounded"
                checked={overdueOnly}
                onChange={(e) => resetPage(setOverdueOnly)(e.target.checked)}
              />
              Follow-up overdue only
            </label>
            {pipeline.data?.overdueCount ? (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {pipeline.data.overdueCount} overdue
              </Badge>
            ) : null}
          </div>
        </CardHeader>

        <CardContent>
          {activeQuery.isPending ? <LoadingState /> : null}
          {activeQuery.isError ? (
            <ErrorState
              message={
                activeQuery.error instanceof ApiRequestError ? activeQuery.error.message : undefined
              }
              onRetry={() => void activeQuery.refetch()}
            />
          ) : null}

          {view === 'kanban' && pipeline.data ? (
            <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2">
              {pipeline.data.columns.map((column) => (
                <section key={column.stage} className="flex w-64 shrink-0 flex-col gap-2">
                  <header className="bg-muted/50 flex items-center justify-between gap-2 rounded-md px-3 py-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span
                        aria-hidden
                        className={cn('h-2 w-2 rounded-full', STAGE_ACCENTS[column.stage])}
                      />
                      {STAGE_LABELS[column.stage]}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {column.total}
                    </span>
                  </header>

                  {Number(column.value) > 0 ? (
                    <p className="text-muted-foreground px-1 text-xs tabular-nums">
                      {formatINR(column.value)} expected
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    {column.leads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} onOpen={() => setOpenLeadId(lead.id)} />
                    ))}
                  </div>

                  {column.total === 0 ? (
                    <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
                      Empty
                    </p>
                  ) : null}

                  {column.total > column.leads.length ? (
                    <p className="text-muted-foreground px-1 text-xs">
                      Showing {column.leads.length} of {column.total} — narrow the filters to see
                      the rest.
                    </p>
                  ) : null}
                </section>
              ))}
            </div>
          ) : null}

          {view === 'table' && table.data ? (
            table.data.items.length === 0 ? (
              <EmptyState message="No leads match these filters." />
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>District</TableHead>
                        <TableHead>Assigned</TableHead>
                        <TableHead>Follow-up</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {table.data.items.map((lead) => (
                        <TableRow
                          key={lead.id}
                          className="cursor-pointer"
                          onClick={() => setOpenLeadId(lead.id)}
                        >
                          <TableCell>
                            <p className="font-medium">{lead.firmName ?? lead.name}</p>
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {formatPhone(lead.phone)}
                            </p>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {TYPE_LABELS[lead.type]}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 text-sm">
                              <span
                                aria-hidden
                                className={cn('h-2 w-2 rounded-full', STAGE_ACCENTS[lead.stage])}
                              />
                              {STAGE_LABELS[lead.stage]}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {lead.district.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {lead.assignedTo?.name ?? '-'}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'tabular-nums',
                              lead.isOverdue
                                ? 'text-destructive font-medium'
                                : 'text-muted-foreground',
                            )}
                          >
                            {lead.followUpAt ? formatDate(lead.followUpAt) : '-'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {lead.expectedInvestment ? formatINR(lead.expectedInvestment) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 ? (
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-sm">
                      Page {page} of {totalPages} &middot;{' '}
                      {formatNumber(table.data.meta?.total ?? 0)} leads
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      <LeadDetailSheet
        leadId={openLeadId}
        onClose={() => setOpenLeadId(null)}
        onEdit={(lead) => setEditing(lead)}
        onConvert={(lead) => setConverting(lead)}
      />

      <LeadDialog open={creating} onOpenChange={setCreating} editing={null} />
      <LeadDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        editing={editing}
      />
      <ConvertLeadDialog lead={converting} onClose={() => setConverting(null)} />
    </div>
  );
}

export default function LeadsPage() {
  // `useSearchParams` needs a Suspense boundary to keep the route statically shell-rendered.
  return (
    <Suspense fallback={<LoadingState />}>
      <LeadsContent />
    </Suspense>
  );
}

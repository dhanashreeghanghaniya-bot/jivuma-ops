'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import type {
  CoverageReport,
  CoverageStatus,
  LeadFunnelReport,
  OrderLevel,
  SalesGroup,
  SalesReport,
} from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ApiRequestError, api, downloadFile } from '@/lib/api-client';
import { formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDistricts } from '@/features/geo/api';
import { COVERAGE_ORDER, COVERAGE_STYLES } from '@/features/map/map-config';
import { SOURCE_LABELS, STAGE_LABELS, TYPE_LABELS } from '@/features/leads/lead-labels';

const ALL = 'ALL';
/** `CENTRAL_GUJARAT` -> `Central Gujarat`. */
const zoneName = (zone: string) =>
  zone
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
const istMonth = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7);
const shift = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const shortMonth = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

function exportFile(path: string, query?: Record<string, string | undefined>) {
  void downloadFile(path, query).catch((err) =>
    toast.error(err instanceof ApiRequestError ? err.message : 'Could not export'),
  );
}

const LEVELS: { value: OrderLevel; label: string }[] = [
  { value: 'DISTRIBUTOR_TO_RETAILER', label: 'Secondary (to shops)' },
  { value: 'SS_TO_DISTRIBUTOR', label: 'SS to distributors' },
  { value: 'COMPANY_TO_SS', label: 'Primary (to SS)' },
];
const GROUPS: { value: SalesGroup; label: string }[] = [
  { value: 'district', label: 'District' },
  { value: 'town', label: 'Town' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'product', label: 'Product' },
];

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const up = value >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 tabular-nums',
        up ? 'text-emerald-700' : 'text-red-700',
      )}
    >
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {up ? '+' : ''}
      {(value * 100).toFixed(0)}%
    </span>
  );
}

/** SPEC 4.7: sales by district / town / distributor / product, month on month. */
export function SalesTab() {
  const [groupBy, setGroupBy] = useState<SalesGroup>('district');
  const [level, setLevel] = useState<OrderLevel>('DISTRIBUTOR_TO_RETAILER');
  const [to, setTo] = useState(istMonth);
  const [from, setFrom] = useState(() => shift(istMonth(), -5));
  const [districtId, setDistrictId] = useState(ALL);
  const { data: districts = [] } = useDistricts();
  const query = {
    groupBy,
    level,
    from,
    to,
    districtId: districtId === ALL ? undefined : districtId,
  };

  const report = useQuery({
    queryKey: ['reports', 'sales', query],
    queryFn: async () => (await api.get<SalesReport>('/reports/sales', { query })).data,
    placeholderData: (previous) => previous,
  });
  const r = report.data;
  const max = r ? Math.max(...r.rows.map((row) => Number(row.total)), 1) : 1;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Sales</CardTitle>
            <CardDescription>
              Order value by month, cancelled orders left out. Change is the last month over the one
              before.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => exportFile('/reports/sales.xlsx', query)}
            disabled={!r?.rows.length}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <Button
              key={g.value}
              size="sm"
              variant={groupBy === g.value ? 'default' : 'outline'}
              onClick={() => setGroupBy(g.value)}
            >
              By {g.label.toLowerCase()}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Select value={level} onValueChange={(v) => setLevel(v as OrderLevel)}>
            <SelectTrigger className="lg:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={districtId} onValueChange={setDistrictId}>
            <SelectTrigger className="lg:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All districts</SelectItem>
              {districts.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            From
            <Input
              type="month"
              className="w-40"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            To
            <Input
              type="month"
              className="w-40"
              value={to}
              min={from}
              max={istMonth()}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {report.isPending ? <LoadingState /> : null}
        {report.isError ? (
          <ErrorState
            message={report.error instanceof ApiRequestError ? report.error.message : undefined}
            onRetry={() => void report.refetch()}
          />
        ) : null}
        {r && r.rows.length === 0 ? <EmptyState message="No sales in this range." /> : null}
        {r && r.rows.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">
                    {GROUPS.find((g) => g.value === groupBy)!.label}
                  </TableHead>
                  {r.months.map((m) => (
                    <TableHead key={m} className="text-right">
                      {shortMonth(m)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>
                      <p className="font-medium">{row.label}</p>
                      <div className="bg-muted mt-1 h-1.5 rounded-full">
                        <div
                          className="bg-primary h-1.5 rounded-full"
                          style={{ width: `${(Number(row.total) / max) * 100}%` }}
                        />
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {row.detail
                          ? `${groupBy === 'district' ? zoneName(row.detail) : row.detail} · `
                          : ''}
                        {formatNumber(row.orders)} orders
                      </p>
                    </TableCell>
                    {r.months.map((m) => (
                      <TableCell key={m} className="text-right tabular-nums">
                        {row.byMonth[m] ? (
                          formatINR(row.byMonth[m])
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatINR(row.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Change value={row.momChange} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell>Total · {formatNumber(r.orders)} orders</TableCell>
                  {r.months.map((m) => (
                    <TableCell key={m} className="text-right tabular-nums">
                      {formatINR(r.monthTotals[m] ?? '0')}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">
                    {formatINR(r.grandTotal)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** SPEC 4.7: district-wise coverage status, towns covered vs total. */
export function CoverageTab() {
  const report = useQuery({
    queryKey: ['reports', 'coverage'],
    queryFn: async () => (await api.get<CoverageReport>('/reports/coverage')).data,
  });
  const [status, setStatus] = useState<CoverageStatus | 'ALL'>(ALL);
  const r = report.data;
  const rows = r?.rows.filter((row) => status === ALL || row.status === status) ?? [];

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Coverage</CardTitle>
            <CardDescription>
              {r ? `${r.townsCovered} of ${r.towns} towns covered. ` : ''}A town is covered when an
              active distributor sits in it or covers it.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => exportFile('/reports/coverage.xlsx')}
            disabled={!r}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
        {r ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={status === ALL ? 'default' : 'outline'}
              onClick={() => setStatus(ALL)}
            >
              All {r.rows.length}
            </Button>
            {COVERAGE_ORDER.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? 'default' : 'outline'}
                onClick={() => setStatus(s)}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm border"
                  style={{ backgroundColor: COVERAGE_STYLES[s].fill }}
                />
                {COVERAGE_STYLES[s].label} {r.byStatus[s]}
              </Button>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {report.isPending ? <LoadingState /> : null}
        {report.isError ? <ErrorState onRetry={() => void report.refetch()} /> : null}
        {r ? (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>District</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Towns covered</TableHead>
                  <TableHead className="text-right">SS</TableHead>
                  <TableHead className="text-right">Distributors</TableHead>
                  <TableHead className="text-right">Shops</TableHead>
                  <TableHead className="text-right">Open leads</TableHead>
                  <TableHead className="text-right">Sales this month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.district.id}>
                    <TableCell>
                      <p className="font-medium">{row.district.name}</p>
                      <p className="text-muted-foreground text-xs">{zoneName(row.district.zone)}</p>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 rounded-sm border"
                          style={{ backgroundColor: COVERAGE_STYLES[row.status].fill }}
                        />
                        {COVERAGE_STYLES[row.status].label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.towns ? `${row.townsCovered} / ${row.towns}` : '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.superStockists || '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.distributors || '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.retailers || '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.openLeads || '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(row.salesThisMonth) ? formatINR(row.salesThisMonth) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** SPEC 4.7: lead funnel. */
export function LeadsTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useQuery({
    queryKey: ['reports', 'leads', from, to],
    queryFn: async () =>
      (
        await api.get<LeadFunnelReport>('/reports/leads', {
          query: { from: from || undefined, to: to || undefined },
        })
      ).data,
    placeholderData: (previous) => previous,
  });
  const r = report.data;
  const widest = r ? Math.max(...r.stages.map((s) => s.count), 1) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Lead funnel</CardTitle>
              <CardDescription>
                {r
                  ? `${r.totals.total} leads · ${r.totals.won} won · ${r.totals.lost} lost · ${r.totals.open} open · ${r.totals.conversionRate}% of decided leads won`
                  : 'Leads by stage.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              Created
              <Input
                type="date"
                aria-label="From"
                className="w-40"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
              to
              <Input
                type="date"
                aria-label="To"
                className="w-40"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.isPending ? <LoadingState /> : null}
          {r?.stages.map((s) => (
            <div key={s.stage} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0">{STAGE_LABELS[s.stage]}</span>
              <div className="bg-muted h-6 flex-1 rounded">
                <div
                  className={cn(
                    'text-primary-foreground flex h-6 items-center rounded px-2 text-xs font-medium',
                    s.stage === 'LOST'
                      ? 'bg-red-400'
                      : s.stage === 'WON'
                        ? 'bg-emerald-600'
                        : 'bg-primary',
                  )}
                  style={{ width: `${Math.max((s.count / widest) * 100, s.count ? 6 : 0)}%` }}
                >
                  {s.count || ''}
                </div>
              </div>
              <span className="text-muted-foreground w-28 shrink-0 text-right tabular-nums">
                {Number(s.value) ? formatINR(s.value) : '-'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {r ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {r.byType.map((t) => (
                <div key={t.type} className="flex justify-between">
                  <span>{TYPE_LABELS[t.type]}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {t.total} · {t.won} won · {t.conversionRate}%
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {r.bySource.map((s) => (
                <div key={s.source} className="flex justify-between">
                  <span>{SOURCE_LABELS[s.source]}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.total} · {s.won} won · {s.conversionRate}%
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By salesman</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {r.bySalesman.map((s) => (
                <div key={s.salesman?.id ?? 'none'} className="flex justify-between">
                  <span>{s.salesman?.name ?? 'Unassigned'}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.total} · {s.open} open
                    {s.overdue ? (
                      <span className="text-red-700"> · {s.overdue} overdue</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

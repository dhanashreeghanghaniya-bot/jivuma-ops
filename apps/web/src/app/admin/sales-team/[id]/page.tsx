'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError, downloadFile } from '@/lib/api-client';
import { formatDate, formatINR, formatPhone, formatTime, telHref } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatMinutes } from '@/features/field/labels';
import { WEEKDAYS, useCalendar, useRange, useSalesmanProfile } from '@/features/salesteam/api';
import { CALENDAR_STYLE } from '@/features/salesteam/labels';
import { TerritoryAndBeats } from '@/features/salesteam/territory-beats';

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

function CalendarTab({ id }: { id: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(() => istToday().slice(0, 7));
  const cal = useCalendar(id, month);
  // Monday-first grid: blank cells before the 1st.
  const firstWeekday = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{monthName(month)}</CardTitle>
          {cal.data ? (
            <CardDescription>
              {cal.data.summary.worked} worked · {cal.data.summary.leave} leave ·{' '}
              {cal.data.summary.holiday} holiday · {cal.data.summary.absent} absent ·{' '}
              {cal.data.summary.notEnded} not ended properly
            </CardDescription>
          ) : null}
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Next month"
            disabled={month >= istToday().slice(0, 7)}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cal.isPending ? <LoadingState /> : null}
        {cal.isError ? <ErrorState onRetry={() => void cal.refetch()} /> : null}
        {cal.data ? (
          <>
            <div className="text-muted-foreground grid grid-cols-7 gap-1 text-center text-xs font-medium">
              {WEEKDAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekday }, (_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {cal.data.days.map((d) => {
                const style = CALENDAR_STYLE[d.kind];
                const clickable =
                  Boolean(d.workDayId) && d.kind !== 'LEAVE' && d.kind !== 'HOLIDAY';
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!clickable}
                    title={style.label}
                    onClick={() =>
                      clickable && router.push(`/admin/sales-team/days/${d.workDayId}`)
                    }
                    className={cn(
                      'relative flex min-h-20 flex-col items-start gap-0.5 rounded-md border p-1.5 text-left text-xs transition',
                      style.cell,
                      clickable && 'hover:ring-primary/40 hover:ring-2',
                    )}
                  >
                    <span className="font-semibold">{Number(d.date.slice(8))}</span>
                    {d.startAt ? (
                      <span className="tabular-nums">
                        {formatTime(d.startAt)}
                        {d.endAt ? `–${formatTime(d.endAt)}` : ''}
                      </span>
                    ) : null}
                    {d.workingMinutes ? (
                      <span className="tabular-nums">{formatMinutes(d.workingMinutes)}</span>
                    ) : null}
                    {d.visits ? <span>{d.visits} visits</span> : null}
                    {d.kind === 'LEAVE' || d.kind === 'HOLIDAY' || d.kind === 'ABSENT' ? (
                      <span>{style.label}</span>
                    ) : null}
                    {d.flagged ? (
                      <span
                        aria-label="flagged"
                        className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {(['WORKED', 'NOT_ENDED', 'LEAVE', 'HOLIDAY', 'ABSENT'] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className={cn('h-3 w-3 rounded-sm border', CALENDAR_STYLE[k].cell)} />
                  {CALENDAR_STYLE[k].label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> flagged
              </span>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RangeTab({ id }: { id: string }) {
  const [from, setFrom] = useState(() => `${istToday().slice(0, 7)}-01`);
  const [to, setTo] = useState(istToday);
  const range = useRange(id, from, to, from <= to);
  const r = range.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input
              type="date"
              aria-label="From"
              className="w-40"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
            to
            <Input
              type="date"
              aria-label="To"
              className="w-40"
              value={to}
              min={from}
              max={istToday()}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            disabled={!r}
            onClick={() =>
              void downloadFile(`/sales-team/${id}/range.xlsx`, { from, to }).catch((err) =>
                toast.error(err instanceof ApiRequestError ? err.message : 'Could not export'),
              )
            }
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </CardHeader>
        <CardContent>
          {range.isPending ? <LoadingState /> : null}
          {range.isError ? (
            <ErrorState
              message={range.error instanceof ApiRequestError ? range.error.message : undefined}
              onRetry={() => void range.refetch()}
            />
          ) : null}
          {r ? (
            <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Days worked', String(r.days.worked)],
                ['Leave', String(r.days.leave)],
                ['Not ended', String(r.days.notEnded)],
                ['Km', Number(r.days.km).toFixed(0)],
                ['Visits', String(r.totals.visits)],
                ['Orders', `${r.totals.orders} · ${formatINR(r.totals.orderValue)}`],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted/50 rounded-md px-3 py-2">
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {r ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Towns visited ({r.towns.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {r.towns.length === 0 ? <EmptyState message="No visits in this period." /> : null}
              {r.towns.map((t) => (
                <div
                  key={t.id}
                  className="flex justify-between border-b py-1.5 text-sm last:border-0"
                >
                  <span>
                    {t.name} <span className="text-muted-foreground">· {t.district}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {t.visits} visits on {t.days} day{t.days === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shops visited ({r.shops.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {r.shops.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between border-b py-1.5 text-sm last:border-0"
                >
                  <span>
                    {s.name} <span className="text-muted-foreground">· {s.town}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.visits} visits · {formatINR(s.orderValue)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Orders ({r.orders.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="tabular-nums hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {formatDate(o.date)} · {o.status.toLowerCase()}
                        </p>
                      </TableCell>
                      <TableCell>{o.shop}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          o.status === 'CANCELLED' && 'line-through opacity-60',
                        )}
                      >
                        {formatINR(o.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expenses</CardTitle>
              <CardDescription>
                Claimed {formatINR(r.totals.claimed)} · approved {formatINR(r.totals.approved)}
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              {r.expenses.map((e) => (
                <div
                  key={e.id}
                  className="flex justify-between border-b py-1.5 text-sm last:border-0"
                >
                  <span>
                    {formatDate(e.date)} · {e.category}
                    {e.description ? (
                      <span className="text-muted-foreground"> · {e.description}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">
                    {formatINR(e.claimed)}
                    <span className="text-muted-foreground ml-1 text-xs">
                      {e.status.toLowerCase().replace('_', ' ')}
                    </span>
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

const TABS = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'range', label: 'Date range' },
  { key: 'territory', label: 'Territory & beats' },
] as const;

export default function SalesmanPage() {
  const { id } = useParams<{ id: string }>();
  const profile = useSalesmanProfile(id);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('calendar');
  const p = profile.data;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/sales-team"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Sales team
      </Link>
      {profile.isPending ? <LoadingState /> : null}
      {profile.isError ? <ErrorState onRetry={() => void profile.refetch()} /> : null}
      {p ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
                {!p.isActive ? <Badge variant="secondary">Deactivated</Badge> : null}
              </div>
              <p className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
                <a
                  href={telHref(p.phone)}
                  className="hover:text-foreground inline-flex items-center gap-1"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {formatPhone(p.phone)}
                </a>
                <span>HQ {p.hqTown?.name ?? '-'}</span>
                {p.joiningDate ? <span>joined {formatDate(p.joiningDate)}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button
                key={t.key}
                variant={tab === t.key ? 'default' : 'outline'}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          {tab === 'calendar' ? <CalendarTab id={id} /> : null}
          {tab === 'range' ? <RangeTab id={id} /> : null}
          {tab === 'territory' ? <TerritoryAndBeats profile={p} /> : null}
        </>
      ) : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, MapPin, Phone } from 'lucide-react';
import type { TodayStatus } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { formatDate, formatINR, formatPhone, formatTime, telHref } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useFieldFlags, useTeamToday } from '@/features/salesteam/api';
import { FLAG_LABELS } from '@/features/salesteam/labels';

const STATUS: Record<TodayStatus, { label: string; tone: 'secondary' | 'success' | 'warning' }> = {
  NOT_STARTED: { label: 'Not started', tone: 'secondary' },
  IN_FIELD: { label: 'In the field', tone: 'success' },
  ENDED: { label: 'Day ended', tone: 'secondary' },
  ON_LEAVE: { label: 'On leave', tone: 'warning' },
};

const istDate = (offsetDays = 0) =>
  new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

const ago = (minutes: number) =>
  minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;

export default function SalesTeamPage() {
  const today = useTeamToday();
  const [from, setFrom] = useState(() => istDate(-14));
  const [to, setTo] = useState(() => istDate());
  const flags = useFieldFlags(from, to);
  const inField = today.data?.filter((s) => s.status === 'IN_FIELD').length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales team</h1>
        <p className="text-muted-foreground text-sm">
          {today.data ? `${inField} of ${today.data.length} in the field right now. ` : ''}Refreshes
          every minute.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today, {formatDate(istDate())}</CardTitle>
          <CardDescription>
            Positions are recorded while the field app is open and on every visit. A long gap
            usually means the app was closed, not that he stopped working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {today.isPending ? <LoadingState /> : null}
          {today.isError ? <ErrorState onRetry={() => void today.refetch()} /> : null}
          {today.data?.length === 0 ? <EmptyState message="No active salesmen." /> : null}
          {today.data?.map((s) => (
            <div
              key={s.salesman.id}
              className="flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/sales-team/${s.salesman.id}`}
                    prefetch={false}
                    className="font-medium hover:underline"
                  >
                    {s.salesman.name}
                  </Link>
                  <Badge variant={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                  <a
                    href={telHref(s.salesman.phone)}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                  >
                    <Phone className="h-3 w-3" />
                    {formatPhone(s.salesman.phone)}
                  </a>
                </div>
                <p className="text-muted-foreground text-sm">
                  {s.start
                    ? `Started ${formatTime(s.start.at)}${s.start.place ? ` at ${s.start.place}` : ''}`
                    : s.status === 'ON_LEAVE'
                      ? 'On leave or holiday today'
                      : `HQ ${s.salesman.hqTown ?? '-'}`}
                  {s.end
                    ? ` · ended ${formatTime(s.end.at)}${s.end.place ? ` at ${s.end.place}` : ''}`
                    : ''}
                </p>
                {s.lastPing && s.status === 'IN_FIELD' ? (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${s.lastPing.lat},${s.lastPing.lng}`}
                    className={cn(
                      'inline-flex items-center gap-1 text-xs hover:underline',
                      (s.minutesSinceLastPing ?? 0) > 120 ? 'text-amber-700' : 'text-primary',
                    )}
                  >
                    <MapPin className="h-3 w-3" />
                    Last seen {ago(s.minutesSinceLastPing ?? 0)} at {formatTime(s.lastPing.at)}
                  </a>
                ) : null}
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{s.visits}</p>
                  <p className="text-muted-foreground text-xs">visits</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatINR(s.orderValue)}</p>
                  <p className="text-muted-foreground text-xs">{s.orders} orders</p>
                </div>
                {s.workDayId ? (
                  <Link
                    href={`/admin/sales-team/days/${s.workDayId}`}
                    prefetch={false}
                    className="text-primary inline-flex items-center text-sm hover:underline"
                  >
                    Today&apos;s route
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Flags</CardTitle>
              <CardDescription>
                Check-ins over 300 m from the shop, days without visits, odometer far above GPS,
                days not ended, and location gaps over two hours.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm">
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
                max={istDate()}
                onChange={(e) => e.target.value && setTo(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {flags.isPending ? <LoadingState /> : null}
          {flags.data?.length === 0 ? (
            <EmptyState message="Nothing flagged in this period." />
          ) : null}
          {flags.data?.map((f, i) => (
            <Link
              key={`${f.workDayId}-${f.kind}-${i}`}
              href={`/admin/sales-team/days/${f.workDayId}`}
              prefetch={false}
              className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="font-medium">{f.salesman.name}</span>
                <span className="text-muted-foreground">{formatDate(f.date)}</span>
                <Badge variant="warning">{FLAG_LABELS[f.kind]}</Badge>
              </span>
              <span className="text-muted-foreground">{f.detail}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

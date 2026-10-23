'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Flag,
  MapPin,
  Play,
  Square,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import type { TimelineEvent } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/data-states';
import { formatDate, formatINR, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DAY_TYPE_LABELS, formatMinutes } from '@/features/field/labels';
import { useDayDetail } from '@/features/salesteam/api';
import { RouteReplay } from '@/features/salesteam/route-replay';

const ICON: Record<TimelineEvent['kind'], typeof Play> = {
  START: Play,
  VISIT: MapPin,
  LEAD: UserPlus,
  PING: MapPin,
  GAP: WifiOff,
  END: Square,
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-muted/50 rounded-md px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

/** SPEC 4.5 day detail: map replay, timeline with gaps and flags, and the day's totals. */
export default function DayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useDayDetail(id);
  const [highlight, setHighlight] = useState<number | null>(null);

  if (detail.isPending) return <LoadingState />;
  if (detail.isError || !detail.data) return <ErrorState onRetry={() => void detail.refetch()} />;
  const { day, salesman, track, timeline, totals, flags } = detail.data;
  const claimed = Number(totals.taClaimed) + Number(totals.daClaimed) + Number(totals.otherClaimed);
  const odoOverGps =
    totals.odometerKm && totals.gpsKm && Number(totals.gpsKm) > 0
      ? Number(totals.odometerKm) / Number(totals.gpsKm)
      : null;

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/sales-team/${salesman.id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        {salesman.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {salesman.name}, {formatDate(day.date)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {DAY_TYPE_LABELS[day.dayType]} · {day.startAt ? formatTime(day.startAt) : '-'} to{' '}
            {day.endAt ? formatTime(day.endAt) : 'not ended'}
            {day.workingMinutes ? ` · ${formatMinutes(day.workingMinutes)}` : ''} ·{' '}
            {day.status.toLowerCase()}
          </p>
        </div>
        {flags.length ? (
          <div className="flex flex-wrap gap-2">
            {flags.map((f) => (
              <Badge key={f} variant="warning" className="gap-1">
                <Flag className="h-3 w-3" />
                {f}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Km (odometer / GPS)"
          value={`${totals.odometerKm ? Number(totals.odometerKm).toFixed(0) : '-'} / ${totals.gpsKm ? Number(totals.gpsKm).toFixed(1) : '-'}`}
          hint={odoOverGps ? `odometer is ${odoOverGps.toFixed(2)}x GPS` : undefined}
        />
        <Stat label="Visits" value={String(totals.visits)} hint={`${totals.newShops} new shops`} />
        <Stat label="Orders" value={String(totals.orders)} hint={formatINR(totals.orderValue)} />
        <Stat label="Leads" value={String(totals.leads)} />
        <Stat
          label="TA / DA"
          value={`${formatINR(totals.taClaimed)} / ${formatINR(totals.daClaimed)}`}
        />
        <Stat
          label="All claims"
          value={formatINR(claimed)}
          hint={
            Number(totals.otherClaimed)
              ? `incl. ${formatINR(totals.otherClaimed)} other`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Route</CardTitle>
            <CardDescription>
              Every recorded position in time order. Press play, drag the slider, or pick an event
              on the right.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RouteReplay track={track} highlight={highlight} onHighlight={setHighlight} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1">
              {timeline.map((e, i) => {
                const Icon = ICON[e.kind];
                const marker = e.point !== null && e.point >= 0 ? track[e.point]?.label : null;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={e.point === null || e.point < 0}
                      onClick={() => e.point !== null && e.point >= 0 && setHighlight(e.point)}
                      className={cn(
                        'flex w-full gap-3 rounded-md p-2 text-left text-sm transition',
                        e.point !== null && e.point >= 0 && 'hover:bg-muted',
                        highlight !== null && highlight === e.point && 'bg-primary/10',
                        e.kind === 'GAP' && 'bg-amber-50',
                      )}
                    >
                      <span className="text-muted-foreground w-16 shrink-0 pt-0.5 text-xs tabular-nums">
                        {formatTime(e.at)}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
                          e.kind === 'START'
                            ? 'bg-green-600'
                            : e.kind === 'END'
                              ? 'bg-red-600'
                              : e.kind === 'GAP'
                                ? 'bg-amber-500'
                                : e.kind === 'LEAD'
                                  ? 'bg-violet-600'
                                  : 'bg-primary',
                        )}
                      >
                        {marker ?? <Icon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{e.title}</span>
                        {e.detail ? (
                          <span className="text-muted-foreground block text-xs">{e.detail}</span>
                        ) : null}
                        {e.visit?.orderNumber ? (
                          <span className="block text-xs">
                            {e.visit.orderNumber} · {formatINR(e.visit.orderValue ?? '0')}
                          </span>
                        ) : null}
                        {e.flags.map((f) => (
                          <span
                            key={f}
                            className="mt-0.5 flex items-center gap-1 text-xs text-amber-700"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {f}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {day.remarks ? (
              <p className="bg-muted mt-4 whitespace-pre-line rounded-md px-3 py-2 text-xs">
                {day.remarks}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

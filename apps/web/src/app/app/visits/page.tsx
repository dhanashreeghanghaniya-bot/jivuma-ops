'use client';

import { useState } from 'react';
import { AlertTriangle, Camera, CloudOff, Trash2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { formatDate, formatINR, formatTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { istToday } from '@/features/field/api';
import { OUTCOME_TONE } from '@/features/field/labels';
import { formatDistance } from '@/features/field/location';
import { discard, useOutbox } from '@/features/field/offline/outbox';
import { useDayVisits } from '@/features/field/use-day-visits';

/** SPEC 5.2: visit history by date, with anything still waiting to sync. */
export default function SalesmanVisitsPage() {
  const t = useT();
  const [date, setDate] = useState(istToday);
  const visits = useDayVisits(date);
  const { items } = useOutbox();
  const queuedLeads = items.filter((i) => i.kind === 'lead');

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('visits.title')}</h1>
          <p className="text-muted-foreground text-sm">{formatDate(date)}</p>
        </div>
        <Input
          type="date"
          aria-label={t('exp.date')}
          value={date}
          max={istToday()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-11 w-40"
        />
      </div>

      {queuedLeads.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 pt-4">
            {queuedLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <UserPlus className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {lead.kind === 'lead'
                      ? t('visits.lead', {
                          name: `${lead.summary.name}, ${lead.summary.townName}`,
                        })
                      : ''}
                  </span>
                </span>
                <PendingTag
                  dead={Boolean(lead.dead)}
                  error={lead.error}
                  onDiscard={() => void discard(lead.id)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {visits.isPending && visits.rows.length === 0 ? <LoadingState /> : null}
      {visits.isError && visits.rows.length === 0 ? (
        <ErrorState message={t('visits.loadError')} onRetry={() => void visits.refetch()} />
      ) : null}
      {!visits.isPending && visits.rows.length === 0 && !visits.isError ? (
        <EmptyState message={t('visits.none')} />
      ) : null}

      <div className="space-y-2">
        {visits.rows.map((row) => (
          <Card key={row.key} className={cn(row.dead && 'border-destructive/50')}>
            <CardContent className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {row.shopName}
                    {row.isNewShop ? (
                      <span className="ml-1 text-xs text-violet-700">{t('visits.new')}</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatTime(row.checkInAt)} · {row.townName}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    OUTCOME_TONE[row.outcome],
                  )}
                >
                  {t(`outcome.${row.outcome}`)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {row.orderTotal ? (
                  <Badge variant="secondary" className="font-normal tabular-nums">
                    {row.orderNumber ? `${row.orderNumber} · ` : ''}
                    {formatINR(row.orderTotal)}
                  </Badge>
                ) : null}
                {row.photoCount > 0 ? (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5" />
                    {row.photosPending
                      ? t('visits.photosWaiting', { n: row.photoCount })
                      : row.photoCount}
                  </span>
                ) : null}
                {row.isFarFromShop && row.distanceFromShopMeters !== null ? (
                  <span className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t('visits.fromShop', { d: formatDistance(row.distanceFromShopMeters) })}
                  </span>
                ) : null}
                {row.pending || row.dead ? (
                  <PendingTag
                    dead={row.dead}
                    error={row.error}
                    onDiscard={row.dead ? () => void discard(row.key) : undefined}
                  />
                ) : null}
              </div>
              {row.error && (row.pending || row.photosPending) && !row.dead ? (
                <p className="text-muted-foreground text-xs">{row.error}</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PendingTag({
  dead,
  error,
  onDiscard,
}: {
  dead: boolean;
  error?: string | null;
  onDiscard?: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  if (!dead) {
    return (
      <span className="flex items-center gap-1 text-amber-700">
        <CloudOff className="h-3.5 w-3.5" />
        {t('common.waitingToSync')}
      </span>
    );
  }
  return (
    <span className="text-destructive flex flex-wrap items-center gap-2">
      <AlertTriangle className="h-3.5 w-3.5" />
      {t('common.refused', { error: error ?? '' })}
      {onDiscard ? (
        confirming ? (
          <Button size="sm" variant="destructive" onClick={onDiscard}>
            <Trash2 className="h-3.5 w-3.5" />
            {t('common.removeFromPhone')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            {t('common.removeConfirm')}
          </Button>
        )
      ) : null}
    </span>
  );
}

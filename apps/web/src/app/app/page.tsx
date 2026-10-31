'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { FIELD_DAY_TYPES, type FieldBootstrap, type WorkDaySummary } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatINR, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  istToday,
  uploadNow,
  useCurrentDay,
  useEndDay,
  useFieldBootstrap,
  useStartDay,
  useStorageStatus,
  useSubmitDay,
} from '@/features/field/api';
import { LocationHelp } from '@/features/field/components';
import { useT, type TranslationKey } from '@/lib/i18n';
import {
  getFix,
  LocationError,
  navigateHref,
  type LocationFailure,
} from '@/features/field/location';
import { newUuid } from '@/features/field/offline/outbox';
import { PhotoCapture, type CapturedPhoto } from '@/features/field/photo-input';
import { useDayVisits } from '@/features/field/use-day-visits';
import { DaySummaryCard, Stat } from '@/features/field/day-summary';
import { AddShopToRouteDialog } from '@/features/field/add-shop-dialog';
import { CreateBeatDialog } from '@/features/field/create-beat-dialog';

const errorMessage = (err: unknown, t: (key: TranslationKey) => string) =>
  err instanceof ApiRequestError ? err.message : t('common.noSignalDay');

function StartDayCard({ bootstrap }: { bootstrap: FieldBootstrap | undefined }) {
  const t = useT();
  const startDay = useStartDay();
  const storage = useStorageStatus();
  // Preselect the beat planned for today's weekday (1 = Monday ... 7 = Sunday).
  const weekday = ((new Date().getDay() + 6) % 7) + 1;
  const plannedBeat = bootstrap?.beats.find((b) => b.dayOfWeek === weekday);

  const [dayType, setDayType] = useState<(typeof FIELD_DAY_TYPES)[number]>('HQ');
  const [beatId, setBeatId] = useState<string | null | undefined>(undefined);
  const [creatingBeat, setCreatingBeat] = useState(false);
  const [odometer, setOdometer] = useState('');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<LocationFailure | null>(null);

  const chosenBeat = beatId === undefined ? (plannedBeat?.id ?? null) : beatId;

  const start = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const { fix, poor } = await getFix();
      if (poor) toast.warning(t('common.weakGpsStart', { m: fix.accuracyM }));

      let startOdometerPhotoPath: string | null = null;
      if (photo && storage.data?.configured) {
        try {
          startOdometerPhotoPath = await uploadNow('odometer', `start-${newUuid()}`, photo.blob);
        } catch {
          toast.warning(t('start.photoFailed'));
        }
      }

      await startDay.mutateAsync({
        location: fix,
        dayType,
        beatId: chosenBeat,
        startOdometer: odometer ? Number(odometer) : null,
        startOdometerPhotoPath,
      });
      toast.success(t('start.started'));
    } catch (err) {
      if (err instanceof LocationError) setLocationError(err.reason);
      else toast.error(errorMessage(err, t));
    } finally {
      setLocating(false);
    }
  };

  const busy = locating || startDay.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('start.title')}</CardTitle>
        <CardDescription>{t('start.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>{t('start.dayType')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {FIELD_DAY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDayType(type)}
                aria-pressed={dayType === type}
                className={cn(
                  'min-h-12 rounded-md border px-2 text-sm font-medium',
                  dayType === type && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {t(`dayType.${type}`)}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">{t(`dayHint.${dayType}`)}</p>
        </div>

        {bootstrap && bootstrap.beats.length > 0 ? (
          <div className="space-y-2">
            <Label>{t('start.beat')}</Label>
            <div className="flex flex-col gap-2">
              {[...bootstrap.beats, null].map((beat) => (
                <button
                  key={beat?.id ?? 'none'}
                  type="button"
                  onClick={() => setBeatId(beat?.id ?? null)}
                  aria-pressed={chosenBeat === (beat?.id ?? null)}
                  className={cn(
                    'min-h-12 rounded-md border px-3 text-left text-sm',
                    chosenBeat === (beat?.id ?? null) && 'border-primary bg-primary/10 font-medium',
                  )}
                >
                  {beat ? beat.name : t('start.noBeat')}
                  {beat && beat.id === plannedBeat?.id ? (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {t('start.todaysBeat')}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {bootstrap ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              onClick={() => setCreatingBeat(true)}
            >
              {t('beat.create')}
            </Button>
            {creatingBeat ? (
              <CreateBeatDialog
                open={creatingBeat}
                onOpenChange={setCreatingBeat}
                retailers={bootstrap.retailers}
              />
            ) : null}
          </>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="start-odo">{t('common.odometerOptional')}</Label>
          <div className="flex items-start gap-3">
            <Input
              id="start-odo"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={t('start.odometerExample')}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))}
              className="h-12 text-base"
            />
            {storage.data?.configured ? (
              <PhotoCapture
                label={t('common.odometer')}
                fix={null}
                photo={photo}
                onChange={setPhoto}
              />
            ) : null}
          </div>
        </div>

        {locationError ? (
          <LocationHelp reason={locationError} onRetry={() => void start()} busy={busy} />
        ) : null}

        <Button
          size="lg"
          className="h-14 w-full text-base"
          onClick={() => void start()}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
          {locating
            ? t('common.gettingLocation')
            : startDay.isPending
              ? t('start.starting')
              : t('start.button')}
        </Button>
      </CardContent>
    </Card>
  );
}

/** SPEC 5.1.1: an earlier day left open must be closed before today can start. */
function StaleDayCard({ day }: { day: WorkDaySummary }) {
  const t = useT();
  const endDay = useEndDay();
  const submitDay = useSubmitDay();
  const busy = endDay.isPending || submitDay.isPending;

  const close = async () => {
    try {
      await endDay.mutateAsync({ id: day.id, input: {} });
      await submitDay.mutateAsync(day.id);
      toast.success(t('stale.closed', { date: formatDate(day.date) }));
    } catch (err) {
      toast.error(errorMessage(err, t));
    }
  };

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          {t('stale.title', { date: formatDate(day.date) })}
        </CardTitle>
        <CardDescription>{t('stale.body')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="lg" className="h-14 w-full" onClick={() => void close()} disabled={busy}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {t('stale.button')}
        </Button>
      </CardContent>
    </Card>
  );
}

function ActiveDay({
  day,
  bootstrap,
}: {
  day: WorkDaySummary;
  bootstrap: FieldBootstrap | undefined;
}) {
  const t = useT();
  const [showAddShop, setShowAddShop] = useState(false);
  const { totals } = useDayVisits(istToday());
  const beat = bootstrap?.beats.find((b) => b.id === day.beat?.id);
  const retailers = useMemo(() => new Map(bootstrap?.retailers.map((r) => [r.id, r])), [bootstrap]);
  const towns = useMemo(
    () => new Map(bootstrap?.towns.map((town) => [town.id, town])),
    [bootstrap],
  );

  const currentRetailerIds = useMemo(
    () => new Set(beat?.stops.map((s) => s.retailerId).filter((id): id is string => Boolean(id))),
    [beat],
  );

  const doneCalls = beat
    ? beat.stops.filter((s) => s.retailerId && totals.visitedRetailerIds.has(s.retailerId)).length
    : 0;
  const productiveCalls = beat
    ? beat.stops.filter(
        (s) => s.retailerId && retailers.get(s.retailerId)?.callHistory?.isProductive,
      ).length
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-muted-foreground text-sm">
                {t('active.started', { time: formatTime(day.startAt) })}
              </p>
              <p className="font-medium">{day.startPlaceLabel ?? t('active.locationSaved')}</p>
            </div>
            <Badge variant="secondary">{t(`dayType.${day.dayType}`)}</Badge>
          </div>
          {day.flags.poorStartAccuracy ? (
            <p className="text-xs text-amber-700">
              {t('active.weakStart', { m: day.startAccuracyM ?? '-' })}
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <Stat label={t('common.visits')} value={String(totals.visits)} />
            <Stat label={t('common.orders')} value={String(totals.orders)} />
            <Stat label={t('common.value')} value={formatINR(totals.orderValue)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-14 text-base">
          <Link href="/app/visit/new">
            <Plus className="h-5 w-5" />
            {t('active.newVisit')}
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-14 text-base">
          <Link href="/app/lead/new">
            <UserPlus className="h-5 w-5" />
            {t('active.addLead')}
          </Link>
        </Button>
      </div>

      {beat ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">{beat.name}</CardTitle>
                <CardDescription className="text-xs">
                  {t('active.plannedStops')}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddShop(true)}
                className="h-8 shrink-0 gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add shop
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2.5 text-center text-xs">
              <div>
                <p className="text-muted-foreground text-[11px]">Total calls</p>
                <p className="font-semibold text-sm tabular-nums">
                  {doneCalls} / {beat.stops.length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Productive today</p>
                <p className="font-semibold text-sm text-emerald-700 tabular-nums">
                  {totals.orders}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Past productive</p>
                <p className="font-semibold text-sm tabular-nums">
                  {productiveCalls} / {beat.stops.length}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-2">
            {beat.stops.map((stop, index) => {
              const shop = stop.retailerId ? retailers.get(stop.retailerId) : undefined;
              const town = towns.get(shop?.townId ?? stop.townId ?? '');
              const done = shop ? totals.visitedRetailerIds.has(shop.id) : false;
              const history = shop?.callHistory;

              return (
                <div
                  key={`${stop.sequence}-${stop.retailerId ?? index}`}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      done ? 'bg-emerald-600 text-white' : 'bg-muted',
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <Link
                    href={shop ? `/app/visit/new?retailerId=${shop.id}` : '/app/visit/new'}
                    prefetch={false}
                    className="min-w-0 flex-1 space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">
                        {shop?.shopName ?? town?.name ?? t('active.stop')}
                      </p>
                      {done ? (
                        <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                          Visited today
                        </Badge>
                      ) : history ? (
                        history.isProductive ? (
                          <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                            Productive call
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            No order
                          </Badge>
                        )
                      ) : null}
                    </div>

                    <p className="text-muted-foreground truncate text-xs">
                      {shop?.ownerName ? `${shop.ownerName} · ` : ''}
                      {town?.name ?? '-'}
                    </p>

                    {history ? (
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        Last call: {formatDate(history.lastVisitAt)}
                        {history.lastOrderAmount
                          ? ` · Last order: ${formatINR(history.lastOrderAmount)}`
                          : ''}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">New call · Not visited yet</p>
                    )}
                  </Link>
                  {shop ? (
                    <a
                      href={navigateHref(shop.lat, shop.lng)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('active.navigateTo', { name: shop.shopName })}
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
                    >
                      <Navigation className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              );
            })}
          </CardContent>

          {showAddShop && bootstrap ? (
            <AddShopToRouteDialog
              open={showAddShop}
              onOpenChange={setShowAddShop}
              beatId={beat.id}
              beatName={beat.name}
              currentRetailerIds={currentRetailerIds}
              retailers={bootstrap.retailers}
              towns={towns}
            />
          ) : null}
        </Card>
      ) : null}

      <Button asChild size="lg" variant="secondary" className="h-14 w-full text-base">
        <Link href="/app/day/end">{t('active.endDay')}</Link>
      </Button>
      <p className="text-muted-foreground text-center text-xs">{t('active.trackingNote')}</p>
    </div>
  );
}

export default function TodayPage() {
  const current = useCurrentDay();
  const bootstrap = useFieldBootstrap();
  const data = current.data;
  const t = useT();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('nav.today')}</h1>
        <p className="text-muted-foreground text-sm">{formatDate(new Date())}</p>
      </div>

      {current.isPending ? <LoadingState /> : null}
      {current.isError ? (
        <ErrorState
          message={errorMessage(current.error, t)}
          onRetry={() => void current.refetch()}
        />
      ) : null}
      {data?.fromCache ? (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
          {t('today.offline')}
        </p>
      ) : null}

      {data && data.day && data.isStale ? <StaleDayCard day={data.day} /> : null}
      {data && data.day && !data.isStale ? (
        <ActiveDay day={data.day} bootstrap={bootstrap.data} />
      ) : null}
      {data && !data.day && data.endedToday ? <DaySummaryCard day={data.endedToday} /> : null}
      {data && !data.day && !data.endedToday ? <StartDayCard bootstrap={bootstrap.data} /> : null}
    </div>
  );
}

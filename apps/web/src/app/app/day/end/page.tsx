'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CloudOff, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { TravelMode } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { formatINR, formatTime } from '@/lib/format';
import {
  istToday,
  uploadNow,
  useCurrentDay,
  useEndDay,
  useStorageStatus,
} from '@/features/field/api';
import { LocationHelp } from '@/features/field/components';
import { Stat } from '@/features/field/day-summary';
import { getFix, LocationError, type LocationFailure } from '@/features/field/location';
import { newUuid, syncNow, useOutbox, visibleItems } from '@/features/field/offline/outbox';
import { PhotoCapture, type CapturedPhoto } from '@/features/field/photo-input';
import { useDayVisits } from '@/features/field/use-day-visits';

const TRAVEL_CHOICES: { value: TravelMode | 'NONE'; label: string }[] = [
  { value: 'BIKE', label: 'Bike' },
  { value: 'CAR', label: 'Car' },
  { value: 'AUTO', label: 'Auto' },
  { value: 'BUS', label: 'Bus' },
  { value: 'TRAIN', label: 'Train' },
  { value: 'NONE', label: 'No travel' },
];

/**
 * SPEC 5.1.6. Location is mandatory and the time comes from the server, so
 * this needs signal. Everything recorded today must reach the server first, or
 * the summary (and the TA/DA drafted from it later) would be missing visits.
 */
export default function EndDayPage() {
  const router = useRouter();
  const current = useCurrentDay();
  const storage = useStorageStatus();
  const endDay = useEndDay();
  const { totals } = useDayVisits(istToday());
  const outbox = useOutbox();

  const [odometer, setOdometer] = useState('');
  const [travelMode, setTravelMode] = useState<TravelMode | 'NONE'>('BIKE');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [remarks, setRemarks] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<LocationFailure | null>(null);

  if (current.isPending) return <LoadingState />;
  const day = current.data?.day;
  if (!day || current.data?.isStale) {
    return (
      <EmptyState
        message="There is no day running to end."
        action={
          <Button asChild>
            <Link href="/app">Go to Today</Link>
          </Button>
        }
      />
    );
  }

  // Unsynced visits and leads block End Day; a dead item does too, until dealt with.
  const unsynced = visibleItems(outbox.items).filter(
    // Stored visits and claims whose photos are still trailing are fine.
    (i) => !(i.kind === 'visit' && i.visitId) && !(i.kind === 'expense' && i.expenseId),
  );

  const end = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      await syncNow();
      const { fix, poor } = await getFix();
      if (poor)
        toast.warning(`Weak GPS (±${fix.accuracyM} m). Ending anyway; the admin will see it.`);

      let endOdometerPhotoPath: string | null = null;
      if (photo && storage.data?.configured) {
        try {
          endOdometerPhotoPath = await uploadNow('odometer', `end-${newUuid()}`, photo.blob);
        } catch {
          toast.warning('Odometer photo did not upload. Ending the day without it.');
        }
      }

      await endDay.mutateAsync({
        id: day.id,
        input: {
          location: fix,
          travelMode: travelMode === 'NONE' ? null : travelMode,
          endOdometer: odometer ? Number(odometer) : null,
          endOdometerPhotoPath,
          remarks: remarks.trim() || null,
        },
      });
      toast.success('Day ended. Check the summary and submit.');
      router.push('/app');
    } catch (err) {
      if (err instanceof LocationError) setLocationError(err.reason);
      else
        toast.error(
          err instanceof ApiRequestError ? err.message : 'No network. Ending the day needs signal.',
        );
    } finally {
      setLocating(false);
    }
  };

  const busy = locating || endDay.isPending;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/app">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">End day</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Today so far</CardTitle>
          <CardDescription>
            Started {formatTime(day.startAt)} at {day.startPlaceLabel ?? 'your start point'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          <Stat label="Visits" value={String(totals.visits)} />
          <Stat label="Orders" value={String(totals.orders)} />
          <Stat label="Value" value={formatINR(totals.orderValue)} />
        </CardContent>
      </Card>

      {unsynced.length > 0 ? (
        <Card className="border-amber-300">
          <CardContent className="space-y-3 pt-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CloudOff className="h-4 w-4" />
              {unsynced.length} item{unsynced.length === 1 ? '' : 's'} not synced yet
            </p>
            <p className="text-muted-foreground text-sm">
              {outbox.online
                ? 'Sync them before ending the day so your summary is complete.'
                : 'You are offline. Get signal to sync them and end the day.'}
            </p>
            {unsynced.some((i) => i.dead) ? (
              <p className="text-destructive text-sm">
                Some items were refused by the server. Open Visits to see why.
              </p>
            ) : null}
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={() => void syncNow()}
              disabled={outbox.syncing || !outbox.online}
            >
              {outbox.syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync now
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>How did you travel today?</Label>
            <div className="grid grid-cols-3 gap-2">
              {TRAVEL_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={travelMode === choice.value}
                  onClick={() => setTravelMode(choice.value)}
                  className={cn(
                    'min-h-11 rounded-md border px-2 text-sm font-medium',
                    travelMode === choice.value &&
                      'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              {travelMode === 'BUS' || travelMode === 'TRAIN'
                ? 'Bus and train are paid at the fare. Add the fare with the ticket photo after ending the day.'
                : travelMode === 'NONE'
                  ? 'No TA will be drafted.'
                  : 'TA is drafted from the km travelled at the policy rate.'}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-odo">Odometer (optional)</Label>
            <div className="flex items-start gap-3">
              <Input
                id="end-odo"
                inputMode="numeric"
                placeholder={day.startOdometer ? `started at ${day.startOdometer}` : 'e.g. 20512'}
                value={odometer}
                onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))}
                className="h-12 text-base"
              />
              {storage.data?.configured ? (
                <PhotoCapture label="Odometer" fix={null} photo={photo} onChange={setPhoto} />
              ) : null}
            </div>
            {day.startOdometer && odometer && Number(odometer) >= day.startOdometer ? (
              <p className="text-muted-foreground text-xs">
                {Number(odometer) - day.startOdometer} km by odometer
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-remarks">Remarks (optional)</Label>
            <textarea
              id="end-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-base"
            />
          </div>
        </CardContent>
      </Card>

      {locationError ? (
        <LocationHelp reason={locationError} onRetry={() => void end()} busy={busy} />
      ) : null}

      <Button
        size="lg"
        className="h-14 w-full text-base"
        onClick={() => void end()}
        disabled={busy || unsynced.length > 0}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
        {locating ? 'Getting your location...' : 'End Day'}
      </Button>
    </div>
  );
}

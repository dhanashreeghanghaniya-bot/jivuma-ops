'use client';

import { Loader2, Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkDaySummary } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api-client';
import { formatINR, formatTime } from '@/lib/format';
import { useSubmitDay } from './api';
import { DAY_TYPE_LABELS, formatMinutes } from './labels';

const errorMessage = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'No network. Submitting needs signal.';

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-md px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function DaySummaryCard({ day }: { day: WorkDaySummary }) {
  const submitDay = useSubmitDay();
  const submitted = day.status !== 'OPEN';

  const submit = async () => {
    try {
      await submitDay.mutateAsync(day.id);
      toast.success('Day submitted');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Day ended at {formatTime(day.endAt)}</CardTitle>
        <CardDescription>
          {formatTime(day.startAt)} – {formatTime(day.endAt)} · {formatMinutes(day.workingMinutes)}{' '}
          · {DAY_TYPE_LABELS[day.dayType]}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Visits" value={String(day.totals.visits)} />
          <Stat
            label="Orders"
            value={`${day.totals.orders} · ${formatINR(day.totals.orderValue)}`}
          />
          <Stat label="New shops" value={String(day.totals.newShops)} />
          <Stat label="Leads" value={String(day.totals.leads)} />
          <Stat label="Km (used)" value={day.totalKm ?? '-'} />
          <Stat label="Km (GPS)" value={day.gpsKm ?? '-'} />
        </div>
        <p className="text-muted-foreground text-xs">
          TA/DA will be drafted from this day automatically once expenses are switched on.
        </p>
        {submitted ? (
          <p className="bg-muted flex items-center gap-2 rounded-md px-3 py-3 text-sm">
            <Lock className="h-4 w-4" />
            Submitted and locked. Ask the admin if something needs changing.
          </p>
        ) : (
          <Button
            size="lg"
            className="h-14 w-full text-base"
            onClick={() => void submit()}
            disabled={submitDay.isPending}
          >
            {submitDay.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
            Submit day
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

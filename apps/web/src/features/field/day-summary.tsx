'use client';

import Link from 'next/link';
import { Loader2, Lock, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkDaySummary } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api-client';
import { formatINR, formatTime } from '@/lib/format';
import { MyExpenseList, useMyExpenses } from '@/features/expenses/mine';
import { useSubmitDay } from './api';
import { useT } from '@/lib/i18n';
import { formatMinutes } from './labels';

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-md px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function DaySummaryCard({ day }: { day: WorkDaySummary }) {
  const t = useT();
  const submitDay = useSubmitDay();
  const submitted = day.status !== 'OPEN';
  const expenses = useMyExpenses({ workDayId: day.id });
  // Claims still on the phone would miss the submission; wait for them.
  const unsynced = expenses.rows.filter((r) => r.pending).length;
  const claimed = expenses.rows.reduce((sum, r) => sum + Number(r.amountClaimed), 0);

  const submit = async () => {
    try {
      await submitDay.mutateAsync(day.id);
      toast.success(t('summary.submitted'));
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : t('common.noSignalSubmit'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t('summary.endedAt', { time: formatTime(day.endAt) })}
        </CardTitle>
        <CardDescription>
          {formatTime(day.startAt)} – {formatTime(day.endAt)} · {formatMinutes(day.workingMinutes)}{' '}
          · {t(`dayType.${day.dayType}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t('common.visits')} value={String(day.totals.visits)} />
          <Stat
            label={t('common.orders')}
            value={`${day.totals.orders} · ${formatINR(day.totals.orderValue)}`}
          />
          <Stat label={t('common.newShops')} value={String(day.totals.newShops)} />
          <Stat label={t('common.leads')} value={String(day.totals.leads)} />
          <Stat label={t('summary.kmUsed')} value={day.totalKm ?? '-'} />
          <Stat label={t('summary.kmGps')} value={day.gpsKm ?? '-'} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t('summary.expenses')}</p>
            <p className="text-sm tabular-nums">{formatINR(claimed, true)}</p>
          </div>
          {expenses.rows.length === 0 && !expenses.isPending ? (
            <p className="text-muted-foreground text-xs">{t('summary.noExpenses')}</p>
          ) : null}
          <MyExpenseList rows={expenses.rows} showDate={false} />
          {!submitted ? (
            <Button asChild variant="outline" className="h-12 w-full">
              <Link href={`/app/expenses/new?workDayId=${day.id}`}>
                <Plus className="h-4 w-4" />
                {t('summary.addExpense')}
              </Link>
            </Button>
          ) : null}
        </div>
        {day.remarks ? (
          <p className="whitespace-pre-line rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {day.remarks}
          </p>
        ) : null}
        {submitted ? (
          <p className="bg-muted flex items-center gap-2 rounded-md px-3 py-3 text-sm">
            <Lock className="h-4 w-4" />
            {t('summary.locked')}
          </p>
        ) : (
          <Button
            size="lg"
            className="h-14 w-full text-base"
            onClick={() => void submit()}
            disabled={submitDay.isPending || unsynced > 0}
          >
            {submitDay.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
            {unsynced > 0 ? t('summary.waitingExpenses', { n: unsynced }) : t('summary.submit')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

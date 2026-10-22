'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, Loader2, MapPinOff, RefreshCw } from 'lucide-react';
import { PING_INTERVAL_MS } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getQuickFix, type LocationFailure } from './location';
import { enqueue, newUuid, startOutbox, syncNow, useOutbox, visibleItems } from './offline/outbox';

/**
 * Shown when Start/End Day cannot get a location. Both languages at once:
 * whoever is holding the phone should not have to find a language switch first.
 */
export function LocationHelp({
  reason,
  onRetry,
  busy,
}: {
  reason: LocationFailure;
  onRetry: () => void;
  busy?: boolean;
}) {
  const steps = ['location.step1', 'location.step2', 'location.step3'] as const;
  const title = reason === 'denied' ? 'location.deniedTitle' : 'location.offTitle';
  return (
    <div className="border-destructive/40 bg-destructive/5 space-y-3 rounded-lg border p-4">
      <div className="text-destructive flex items-center gap-2 font-medium">
        <MapPinOff className="h-5 w-5 shrink-0" />
        <span>
          {dictionaries.en[title]}
          <span className="block text-sm">{dictionaries.gu[title]}</span>
        </span>
      </div>
      {reason === 'unsupported' ? (
        <p className="text-sm">
          {dictionaries.en['location.unsupported']}
          <span className="block">{dictionaries.gu['location.unsupported']}</span>
        </p>
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {steps.map((key) => (
            <li key={key}>
              {dictionaries.en[key]}
              <span className="text-muted-foreground block">{dictionaries.gu[key]}</span>
            </li>
          ))}
        </ol>
      )}
      <Button className="h-12 w-full" onClick={onRetry} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {dictionaries.en['common.retry']} / {dictionaries.gu['common.retry']}
      </Button>
    </div>
  );
}

/** Header chip: offline state and "3 pending sync"; tap to sync now. */
export function SyncStatus() {
  const t = useT();
  const { items, syncing, online, lastDeliveredAt } = useOutbox();
  const pending = visibleItems(items).length;
  const queryClient = useQueryClient();

  useEffect(() => startOutbox(), []);

  // Once the server has the work, show its version: order numbers, flags, claim status.
  useEffect(() => {
    if (!lastDeliveredAt) return;
    void queryClient.invalidateQueries({ queryKey: ['field'] });
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
  }, [lastDeliveredAt, queryClient]);

  if (online && pending === 0 && !syncing) return null;
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        online ? 'bg-amber-100 text-amber-900' : 'bg-muted text-muted-foreground',
      )}
    >
      {syncing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : online ? (
        <RefreshCw className="h-3.5 w-3.5" />
      ) : (
        <CloudOff className="h-3.5 w-3.5" />
      )}
      {!online ? t('field.offline') : null}
      {pending > 0 ? (
        <span className="tabular-nums">
          {!online ? ' · ' : ''}
          {pending} {t('field.pending')}
        </span>
      ) : syncing ? (
        t('field.syncing')
      ) : null}
    </button>
  );
}

/**
 * SPEC 5.1.5: while a day is open and the app is on screen, record a ping every
 * 10 minutes. A PWA cannot do this in the background; the native app will.
 */
export function usePingTimer(workDayId: string | null) {
  const lastPing = useRef(0);

  useEffect(() => {
    if (!workDayId) return;

    const ping = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastPing.current < PING_INTERVAL_MS - 30_000) return;
      lastPing.current = Date.now();
      const fix = await getQuickFix();
      if (!fix) return;
      await enqueue({
        kind: 'ping',
        payload: {
          ...fix,
          workDayId,
          clientUuid: newUuid(),
          source: 'TIMER',
          battery: await batteryLevel(),
        },
      });
    };

    // The day just started with a START ping; begin the timer from now.
    lastPing.current = Date.now();
    const timer = window.setInterval(() => void ping(), 60_000);
    const onVisible = () => void ping();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [workDayId]);
}

async function batteryLevel(): Promise<number | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    if (!nav.getBattery) return null;
    return Math.round((await nav.getBattery()).level * 100);
  } catch {
    return null;
  }
}

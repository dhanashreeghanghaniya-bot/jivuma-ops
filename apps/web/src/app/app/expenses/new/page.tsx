'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  MANUAL_CATEGORIES,
  OWN_VEHICLE_MODES,
  type ExpenseCategory,
  type TravelMode,
} from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/data-states';
import { cn } from '@/lib/utils';
import { istToday } from '@/features/field/api';
import { enqueue, newUuid } from '@/features/field/offline/outbox';
import { PhotoCapture, type CapturedPhoto } from '@/features/field/photo-input';
import { usePolicy } from '@/features/expenses/api';
import { formatINR } from '@/lib/format';
import { useT } from '@/lib/i18n';

/** Hand-entered TA is for fares; own-vehicle TA is drafted at End Day. */
const FARE_MODES: TravelMode[] = ['BUS', 'TRAIN', 'AUTO'];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-md border px-3 text-sm font-medium',
        active && 'border-primary bg-primary text-primary-foreground',
      )}
    >
      {children}
    </button>
  );
}

function NewExpenseForm() {
  const router = useRouter();
  const t = useT();
  const params = useSearchParams();
  const workDayId = params.get('workDayId');
  const policy = usePolicy();
  const rates = policy.data?.current;

  const [clientUuid] = useState(newUuid);
  const [category, setCategory] = useState<ExpenseCategory>('FOOD');
  const [travelMode, setTravelMode] = useState<TravelMode>('BUS');
  const [date, setDate] = useState(istToday);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [bills, setBills] = useState<(CapturedPhoto | null)[]>([null]);
  const [saving, setSaving] = useState(false);

  const back = workDayId ? '/app' : '/app/expenses';
  const limitHint =
    rates && category === 'LODGING'
      ? t('exp.lodgingLimit', { amount: formatINR(rates.maxLodgingPerNight) })
      : rates && category === 'PHONE'
        ? t('exp.phoneLimit', { amount: formatINR(rates.monthlyPhoneAllowance) })
        : category === 'TA' && !OWN_VEHICLE_MODES.includes(travelMode)
          ? rates?.publicTransportNeedsBill
            ? t('exp.fareBill')
            : t('exp.fareOnly')
          : null;

  const save = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return toast.error(t('exp.err.amount'));
    if (!workDayId && !date) return toast.error(t('exp.err.date'));
    setSaving(true);
    try {
      const taken = bills.filter((b): b is CapturedPhoto => Boolean(b));
      await enqueue({
        kind: 'expense',
        payload: {
          clientUuid,
          workDayId: workDayId ?? null,
          date: workDayId ? null : date,
          category,
          travelMode: category === 'TA' ? travelMode : null,
          amountClaimed: value,
          description: description.trim() || null,
        },
        photos: taken.map((b, i) => ({ key: `${clientUuid}-${i + 1}`, blob: b.blob })),
      });
      toast.success(
        workDayId ? t('exp.addedToday') : navigator.onLine ? t('exp.sent') : t('exp.savedOffline'),
      );
      router.push(back);
    } catch {
      toast.error(t('common.couldNotSave'));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link href={back}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('exp.addTitle')}</h1>
          <p className="text-muted-foreground text-xs">
            {workDayId ? t('exp.forToday') : t('exp.notTied')}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>{t('exp.whatFor')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {MANUAL_CATEGORIES.map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c === 'TA' ? t('exp.fare') : t(`expCat.${c}`)}
                </Chip>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{t('exp.autoNote')}</p>
          </div>

          {category === 'TA' ? (
            <div className="space-y-2">
              <Label>{t('exp.travelledBy')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {FARE_MODES.map((m) => (
                  <Chip key={m} active={travelMode === m} onClick={() => setTravelMode(m)}>
                    {t(`mode.${m}`)}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {!workDayId ? (
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">{t('exp.date')}</Label>
              <Input
                id="exp-date"
                type="date"
                className="h-12"
                max={istToday()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="exp-amount">{t('exp.amount')}</Label>
            <Input
              id="exp-amount"
              className="h-12 text-lg"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
            {limitHint ? <p className="text-muted-foreground text-xs">{limitHint}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">{t('exp.details')}</Label>
            <Input
              id="exp-desc"
              className="h-12"
              placeholder={
                category === 'LODGING'
                  ? t('exp.hotelHint')
                  : category === 'TA'
                    ? t('exp.routeHint')
                    : ''
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('exp.bills')}</Label>
            <div className="flex flex-wrap gap-3">
              {bills.map((bill, i) => (
                <PhotoCapture
                  key={i}
                  label={t('exp.bill', { n: i + 1 })}
                  fix={null}
                  photo={bill}
                  onChange={(photo) => {
                    const next = [...bills];
                    next[i] = photo;
                    // Keep one empty slot at the end, up to 4 bills.
                    if (photo && i === next.length - 1 && next.length < 4) next.push(null);
                    setBills(next.filter((b, j) => b || j === next.length - 1));
                  }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="h-14 w-full text-base"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {workDayId ? t('exp.addToday') : t('exp.send')}
      </Button>
    </div>
  );
}

export default function NewExpensePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewExpenseForm />
    </Suspense>
  );
}

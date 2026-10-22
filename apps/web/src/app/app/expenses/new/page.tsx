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
import { CATEGORY_LABELS, MODE_LABELS } from '@/features/expenses/components';
import { usePolicy } from '@/features/expenses/api';
import { formatINR } from '@/lib/format';

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
      ? `Policy limit ${formatINR(rates.maxLodgingPerNight)} per night`
      : rates && category === 'PHONE'
        ? `Policy allows ${formatINR(rates.monthlyPhoneAllowance)} a month`
        : category === 'TA' && !OWN_VEHICLE_MODES.includes(travelMode)
          ? rates?.publicTransportNeedsBill
            ? 'Paid at the fare. Add the ticket photo.'
            : 'Paid at the fare.'
          : null;

  const save = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return toast.error('Enter the amount');
    if (!workDayId && !date) return toast.error('Pick the date');
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
        workDayId
          ? 'Added to today. It goes for approval when you submit the day.'
          : navigator.onLine
            ? 'Expense sent for approval'
            : 'Saved on this phone. It will be sent when you are online.',
      );
      router.push(back);
    } catch {
      toast.error('Could not save on this phone.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={back}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Add expense</h1>
          <p className="text-muted-foreground text-xs">
            {workDayId ? "For today's work day" : 'Not tied to a work day, e.g. a phone bill'}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>What for</Label>
            <div className="grid grid-cols-2 gap-2">
              {MANUAL_CATEGORIES.map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c === 'TA' ? 'Fare (TA)' : CATEGORY_LABELS[c]}
                </Chip>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              DA and bike/car TA are worked out for you at End Day.
            </p>
          </div>

          {category === 'TA' ? (
            <div className="space-y-2">
              <Label>Travelled by</Label>
              <div className="grid grid-cols-3 gap-2">
                {FARE_MODES.map((m) => (
                  <Chip key={m} active={travelMode === m} onClick={() => setTravelMode(m)}>
                    {MODE_LABELS[m]}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {!workDayId ? (
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Date</Label>
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
            <Label htmlFor="exp-amount">Amount ₹</Label>
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
            <Label htmlFor="exp-desc">Details (optional)</Label>
            <Input
              id="exp-desc"
              className="h-12"
              placeholder={
                category === 'LODGING' ? 'Hotel name, town' : category === 'TA' ? 'From – to' : ''
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Bill photos</Label>
            <div className="flex flex-wrap gap-3">
              {bills.map((bill, i) => (
                <PhotoCapture
                  key={i}
                  label={`Bill ${i + 1}`}
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
        {workDayId ? 'Add to today' : 'Send for approval'}
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

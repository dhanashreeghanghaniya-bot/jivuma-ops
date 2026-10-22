'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { allowancePolicySchema, type AllowancePolicyItem } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatINR } from '@/lib/format';
import { FieldError } from '@/features/partners/form-fields';
import { usePolicy, useSavePolicy } from '@/features/expenses/api';

type FormValues = z.input<typeof allowancePolicySchema>;

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const MONEY_FIELDS: { key: keyof FormValues; label: string; hint?: string }[] = [
  { key: 'daHq', label: 'DA, HQ day' },
  { key: 'daExHq', label: 'DA, Ex-HQ day' },
  { key: 'daOutstation', label: 'DA, Outstation day' },
  { key: 'taPerKmBike', label: 'TA per km, bike' },
  { key: 'taPerKmCar', label: 'TA per km, car' },
  { key: 'taPerKmAuto', label: 'TA per km, auto' },
  { key: 'maxLodgingPerNight', label: 'Lodging cap per night' },
  { key: 'monthlyPhoneAllowance', label: 'Phone allowance per month' },
];

const fromItem = (p: AllowancePolicyItem): FormValues => ({
  name: p.name,
  effectiveFrom: today(),
  daHq: p.daHq,
  daExHq: p.daExHq,
  daOutstation: p.daOutstation,
  taPerKmBike: p.taPerKmBike,
  taPerKmCar: p.taPerKmCar,
  taPerKmAuto: p.taPerKmAuto,
  maxLodgingPerNight: p.maxLodgingPerNight,
  monthlyPhoneAllowance: p.monthlyPhoneAllowance,
  publicTransportNeedsBill: p.publicTransportNeedsBill,
  daRequiresVisit: p.daRequiresVisit,
});

export default function AllowancePolicySettingsPage() {
  const policy = usePolicy();
  const save = useSavePolicy();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(allowancePolicySchema) });

  useEffect(() => {
    if (policy.data?.current) reset(fromItem(policy.data.current));
  }, [policy.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = allowancePolicySchema.parse(values);
      await save.mutateAsync(input);
      toast.success(`Policy saved, effective ${formatDate(input.effectiveFrom)}`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        for (const [path, msg] of Object.entries(err.fieldErrors))
          setError(path as keyof FormValues, { message: msg });
        toast.error(err.message);
      } else toast.error('Could not save the policy');
    }
  });

  if (policy.isPending) return <LoadingState />;
  if (policy.isError) return <ErrorState onRetry={() => void policy.refetch()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Allowance policy</h1>
        <p className="text-muted-foreground text-sm">
          The rates TA/DA are drafted from at End Day, and the limits claims are checked against.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rates</CardTitle>
          <CardDescription>
            Saving creates a version that applies from its effective date. Claims are always judged
            by the version in force on their own date, so changing rates never re-prices old claims.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pol-name">Name</Label>
                <Input id="pol-name" {...register('name')} />
                <FieldError message={errors.name?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pol-from">Effective from</Label>
                <Input id="pol-from" type="date" min={today()} {...register('effectiveFrom')} />
                <FieldError message={errors.effectiveFrom?.message} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MONEY_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`pol-${key}`}>{label} (₹)</Label>
                  <Input id={`pol-${key}`} inputMode="decimal" {...register(key)} />
                  <FieldError message={errors[key]?.message} />
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-primary h-4 w-4"
                  {...register('publicTransportNeedsBill')}
                />
                Bus and train fares need a bill photo (they are paid at actuals)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-primary h-4 w-4"
                  {...register('daRequiresVisit')}
                />
                No DA for a day with no visits
              </label>
            </div>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save as new version
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">DA HQ / Ex-HQ / Out</TableHead>
                  <TableHead className="text-right">TA bike / car / auto</TableHead>
                  <TableHead className="text-right">Lodging</TableHead>
                  <TableHead className="text-right">Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policy.data?.versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(v.effectiveFrom)}{' '}
                      {v.isCurrent ? <Badge variant="success">In force</Badge> : null}
                      {v.effectiveFrom > today() ? (
                        <Badge variant="secondary">Upcoming</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{v.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(v.daHq)} / {formatINR(v.daExHq)} / {formatINR(v.daOutstation)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(v.taPerKmBike, true)} / {formatINR(v.taPerKmCar, true)} /{' '}
                      {formatINR(v.taPerKmAuto, true)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(v.maxLodgingPerNight)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(v.monthlyPhoneAllowance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

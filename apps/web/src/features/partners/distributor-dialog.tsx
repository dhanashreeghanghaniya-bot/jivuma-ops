'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PartnerStatus, createDistributorSchema, type DistributorListItem } from '@juma/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiRequestError } from '@/lib/api-client';
import { useTowns } from '@/features/users/api';
import { LocationPicker } from '@/features/map/location-picker';
import { ContactFields, FieldError, MultiSelectList } from './form-fields';
import { useSaveDistributor, useSuperStockistOptions } from './api';

type FormValues = z.input<typeof createDistributorSchema>;

const emptyValues: FormValues = {
  firmName: '',
  ownerName: '',
  phone: '',
  altPhone: '',
  email: '',
  gstin: '',
  address: '',
  townId: '',
  lat: null,
  lng: null,
  status: PartnerStatus.ACTIVE,
  notes: '',
  superStockistId: '',
  coveredTownIds: [],
  creditLimit: null,
  creditDays: null,
};

const toFormValues = (d: DistributorListItem): FormValues => ({
  firmName: d.firmName,
  ownerName: d.ownerName,
  phone: d.phone,
  altPhone: d.altPhone ?? '',
  email: d.email ?? '',
  gstin: d.gstin ?? '',
  address: d.address,
  townId: d.town.id,
  lat: d.lat,
  lng: d.lng,
  status: d.status,
  notes: d.notes ?? '',
  superStockistId: d.superStockist.id,
  coveredTownIds: d.coveredTowns.map((t) => t.id),
  creditLimit: d.creditLimit === null ? null : Number(d.creditLimit),
  creditDays: d.creditDays,
});

export function DistributorDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: DistributorListItem | null;
}) {
  const { data: towns = [], isLoading: townsLoading } = useTowns();
  const { data: superStockists = [] } = useSuperStockistOptions();
  const save = useSaveDistributor();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createDistributorSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) reset(editing ? toFormValues(editing) : emptyValues);
  }, [open, editing, reset]);

  const townId = watch('townId');
  const superStockistId = watch('superStockistId');
  const coveredTownIds = watch('coveredTownIds') ?? [];
  const selectedTown = towns.find((t) => t.id === townId);

  // A distributor only ever covers towns inside its super stockist's districts,
  // so narrow the list once an SS is picked rather than showing all of Gujarat.
  const coverableTowns = useMemo(() => {
    const ss = superStockists.find((s) => s.id === superStockistId);
    if (!ss || ss.coveredDistricts.length === 0) return towns;
    const districtIds = new Set(ss.coveredDistricts.map((d) => d.id));
    return towns.filter((t) => districtIds.has(t.district.id));
  }, [superStockists, superStockistId, towns]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = createDistributorSchema.parse(values);
      await save.mutateAsync({ id: editing?.id, input });
      toast.success(editing ? `${input.firmName} updated` : `${input.firmName} added`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        for (const [path, message] of Object.entries(err.fieldErrors)) {
          setError(path as keyof FormValues, { message });
        }
        toast.error(err.message);
      } else {
        toast.error('Could not save the distributor');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit distributor' : 'Add distributor'}</DialogTitle>
          <DialogDescription>
            A distributor buys from one super stockist and services retailers in the towns it covers.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <ContactFields
            register={register}
            errors={errors}
            towns={towns}
            townsLoading={townsLoading}
            townId={townId}
            onTownChange={(value) => setValue('townId', value, { shouldValidate: true })}
            status={watch('status')}
            onStatusChange={(value) => setValue('status', value)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Super stockist</Label>
              <Select
                value={superStockistId ?? ''}
                onValueChange={(value) => setValue('superStockistId', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a super stockist" />
                </SelectTrigger>
                <SelectContent>
                  {superStockists.map((ss) => (
                    <SelectItem key={ss.id} value={ss.id}>
                      {ss.firmName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.superStockistId?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="creditLimit">Credit limit (₹)</Label>
              <Input id="creditLimit" inputMode="numeric" {...register('creditLimit')} />
              <FieldError message={errors.creditLimit?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="creditDays">Credit days</Label>
              <Input id="creditDays" inputMode="numeric" {...register('creditDays')} />
              <FieldError message={errors.creditDays?.message} />
            </div>
          </div>

          <MultiSelectList
            label="Towns covered"
            items={coverableTowns}
            selectedIds={coveredTownIds}
            renderLabel={(t) => `${t.name} (${t.district.code})`}
            onToggle={(id) =>
              setValue(
                'coveredTownIds',
                coveredTownIds.includes(id)
                  ? coveredTownIds.filter((existing) => existing !== id)
                  : [...coveredTownIds, id],
              )
            }
            emptyMessage="Pick a super stockist first."
          />

          <LocationPicker
            value={{ lat: watch('lat') ?? null, lng: watch('lng') ?? null }}
            onChange={({ lat, lng }) => {
              setValue('lat', lat);
              setValue('lng', lng);
            }}
            fallbackCenter={
              selectedTown ? { lat: selectedTown.lat, lng: selectedTown.lng } : undefined
            }
            error={errors.lat?.message ?? errors.lng?.message}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

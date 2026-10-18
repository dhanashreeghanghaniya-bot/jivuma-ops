'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  PartnerStatus,
  createSuperStockistSchema,
  type SuperStockistListItem,
} from '@juma/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiRequestError } from '@/lib/api-client';
import { useDistricts } from '@/features/geo/api';
import { useTowns } from '@/features/users/api';
import { LocationPicker } from '@/features/map/location-picker';
import { ContactFields, MultiSelectList } from './form-fields';
import { useSaveSuperStockist } from './api';

type FormValues = z.input<typeof createSuperStockistSchema>;

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
  coveredDistrictIds: [],
};

const toFormValues = (ss: SuperStockistListItem): FormValues => ({
  firmName: ss.firmName,
  ownerName: ss.ownerName,
  phone: ss.phone,
  altPhone: ss.altPhone ?? '',
  email: ss.email ?? '',
  gstin: ss.gstin ?? '',
  address: ss.address,
  townId: ss.town.id,
  lat: ss.lat,
  lng: ss.lng,
  status: ss.status,
  notes: ss.notes ?? '',
  coveredDistrictIds: ss.coveredDistricts.map((d) => d.id),
});

export function SuperStockistDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SuperStockistListItem | null;
}) {
  const { data: towns = [], isLoading: townsLoading } = useTowns();
  const districtsQuery = useDistricts();
  const save = useSaveSuperStockist();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createSuperStockistSchema),
    defaultValues: emptyValues,
  });

  // Reload the form whenever the dialog opens so edit and create never bleed.
  useEffect(() => {
    if (open) reset(editing ? toFormValues(editing) : emptyValues);
  }, [open, editing, reset]);

  const townId = watch('townId');
  const coveredDistrictIds = watch('coveredDistrictIds') ?? [];
  const lat = watch('lat') ?? null;
  const lng = watch('lng') ?? null;
  const selectedTown = towns.find((t) => t.id === townId);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = createSuperStockistSchema.parse(values);
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
        toast.error('Could not save the super stockist');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit super stockist' : 'Add super stockist'}</DialogTitle>
          <DialogDescription>
            A super stockist buys from the company and supplies distributors in the districts it
            covers.
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

          <MultiSelectList
            label="Districts covered"
            items={districtsQuery.data ?? []}
            selectedIds={coveredDistrictIds}
            renderLabel={(d) => `${d.name} (${d.code})`}
            onToggle={(id) =>
              setValue(
                'coveredDistrictIds',
                coveredDistrictIds.includes(id)
                  ? coveredDistrictIds.filter((existing) => existing !== id)
                  : [...coveredDistrictIds, id],
              )
            }
          />

          <LocationPicker
            value={{ lat, lng }}
            onChange={({ lat: nextLat, lng: nextLng }) => {
              setValue('lat', nextLat);
              setValue('lng', nextLng);
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

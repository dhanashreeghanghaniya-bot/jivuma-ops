'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { TownType, createTownSchema, type TownListItem } from '@juma/shared';
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
import { FieldError } from '@/features/partners/form-fields';
import { LocationPicker } from '@/features/map/location-picker';
import { useCreateTown, useDistricts, useUpdateTown } from './api';

type FormValues = z.input<typeof createTownSchema>;

const TYPE_LABELS: Record<TownType, string> = {
  CITY: 'City',
  TOWN: 'Town',
  VILLAGE: 'Village',
};

const emptyValues: FormValues = {
  name: '',
  districtId: '',
  lat: '' as unknown as number,
  lng: '' as unknown as number,
  type: TownType.TOWN,
  population: null,
};

const toFormValues = (town: TownListItem): FormValues => ({
  name: town.name,
  districtId: town.district.id,
  lat: town.lat,
  lng: town.lng,
  type: town.type,
  population: town.population,
});

export function TownDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TownListItem | null;
}) {
  const { data: districts = [] } = useDistricts();
  const createTown = useCreateTown();
  const updateTown = useUpdateTown();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createTownSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) reset(editing ? toFormValues(editing) : emptyValues);
  }, [open, editing, reset]);

  const districtId = watch('districtId');
  const selectedDistrict = districts.find((d) => d.id === districtId);
  const lat = watch('lat');
  const lng = watch('lng');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = createTownSchema.parse(values);
      if (editing) await updateTown.mutateAsync({ id: editing.id, input });
      else await createTown.mutateAsync(input);
      toast.success(editing ? `${input.name} updated` : `${input.name} added`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        for (const [path, message] of Object.entries(err.fieldErrors)) {
          setError(path as keyof FormValues, { message });
        }
        toast.error(err.message);
      } else {
        toast.error('Could not save the town');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit town' : 'Add town'}</DialogTitle>
          <DialogDescription>
            Towns are where shops and leads sit. Coordinates centre the map when someone picks this
            town on a form.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Town name</Label>
              <Input id="name" autoComplete="off" {...register('name')} />
              <FieldError message={errors.name?.message} />
            </div>

            <div className="space-y-2">
              <Label>District</Label>
              <Select
                value={districtId ?? ''}
                onValueChange={(value) => setValue('districtId', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a district" />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((district) => (
                    <SelectItem key={district.id} value={district.id}>
                      {district.name} ({district.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.districtId?.message} />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={watch('type') ?? TownType.TOWN}
                onValueChange={(value) => setValue('type', value as TownType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as TownType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="population">Population</Label>
              <Input id="population" inputMode="numeric" {...register('population')} />
              <FieldError message={errors.population?.message} />
            </div>
          </div>

          <LocationPicker
            value={{
              lat: typeof lat === 'number' ? lat : null,
              lng: typeof lng === 'number' ? lng : null,
            }}
            onChange={({ lat: nextLat, lng: nextLng }) => {
              setValue('lat', nextLat as number, { shouldValidate: true });
              setValue('lng', nextLng as number, { shouldValidate: true });
            }}
            fallbackCenter={
              selectedDistrict ? { lat: selectedDistrict.lat, lng: selectedDistrict.lng } : undefined
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

'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Zone, updateDistrictSchema, type DistrictListItem } from '@juma/shared';
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
import { useUpdateDistrict } from './api';

type FormValues = z.input<typeof updateDistrictSchema>;

const ZONE_LABELS: Record<Zone, string> = {
  SAURASHTRA: 'Saurashtra',
  KUTCH: 'Kutch',
  NORTH_GUJARAT: 'North Gujarat',
  CENTRAL_GUJARAT: 'Central Gujarat',
  SOUTH_GUJARAT: 'South Gujarat',
};

/**
 * Districts are seeded reference data, so this only edits the fields that can
 * legitimately need correcting: the Gujarati name, the zone, and the centroid
 * the map pans to.
 */
export function DistrictDialog({
  district,
  onClose,
}: {
  district: DistrictListItem | null;
  onClose: () => void;
}) {
  const updateDistrict = useUpdateDistrict();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(updateDistrictSchema) });

  useEffect(() => {
    if (district) {
      reset({
        nameGu: district.nameGu,
        lat: district.lat,
        lng: district.lng,
        zone: district.zone,
      });
    }
  }, [district, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!district) return;
    try {
      await updateDistrict.mutateAsync({ id: district.id, input: updateDistrictSchema.parse(values) });
      toast.success(`${district.name} updated`);
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        for (const [path, message] of Object.entries(err.fieldErrors)) {
          setError(path as keyof FormValues, { message });
        }
        toast.error(err.message);
      } else {
        toast.error('Could not update the district');
      }
    }
  });

  const lat = watch('lat');
  const lng = watch('lng');

  return (
    <Dialog open={Boolean(district)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{district?.name ?? 'District'}</DialogTitle>
          <DialogDescription>
            Districts cannot be added or removed. Coverage status is computed from partners and
            leads, so it is not editable here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nameGu">Gujarati name</Label>
              <Input id="nameGu" lang="gu" autoComplete="off" {...register('nameGu')} />
              <FieldError message={errors.nameGu?.message} />
            </div>

            <div className="space-y-2">
              <Label>Zone</Label>
              <Select
                value={watch('zone') ?? ''}
                onValueChange={(value) => setValue('zone', value as Zone)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ZONE_LABELS) as Zone[]).map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {ZONE_LABELS[zone]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <LocationPicker
            value={{
              lat: typeof lat === 'number' ? lat : null,
              lng: typeof lng === 'number' ? lng : null,
            }}
            onChange={({ lat: nextLat, lng: nextLng }) => {
              setValue('lat', nextLat ?? undefined, { shouldValidate: true });
              setValue('lng', nextLng ?? undefined, { shouldValidate: true });
            }}
            error={errors.lat?.message ?? errors.lng?.message}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
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

'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { RetailerCategory, createRetailerSchema, type RetailerListItem } from '@juma/shared';
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
import { FieldError, TownSelect } from './form-fields';
import { useDistributorOptions, useSaveRetailer } from './api';

type FormValues = z.input<typeof createRetailerSchema>;

const CATEGORY_LABELS: Record<RetailerCategory, string> = {
  KIRANA: 'Kirana',
  SUPERMARKET: 'Supermarket',
  GENERAL: 'General store',
  HORECA: 'Hotel / restaurant / café',
  OTHER: 'Other',
};

const emptyValues: FormValues = {
  shopName: '',
  ownerName: '',
  phone: '',
  address: '',
  townId: '',
  lat: '' as unknown as number,
  lng: '' as unknown as number,
  distributorId: '',
  category: RetailerCategory.KIRANA,
  photoUrl: '',
};

const toFormValues = (r: RetailerListItem): FormValues => ({
  shopName: r.shopName,
  ownerName: r.ownerName,
  phone: r.phone,
  address: r.address,
  townId: r.town.id,
  lat: r.lat,
  lng: r.lng,
  distributorId: r.distributor.id,
  category: r.category,
  photoUrl: r.photoUrl ?? '',
});

export function RetailerDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: RetailerListItem | null;
}) {
  const { data: towns = [], isLoading: townsLoading } = useTowns();
  const { data: distributors = [] } = useDistributorOptions();
  const save = useSaveRetailer();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createRetailerSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) reset(editing ? toFormValues(editing) : emptyValues);
  }, [open, editing, reset]);

  const townId = watch('townId');
  const selectedTown = towns.find((t) => t.id === townId);
  const lat = watch('lat');
  const lng = watch('lng');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = createRetailerSchema.parse(values);
      await save.mutateAsync({ id: editing?.id, input });
      toast.success(editing ? `${input.shopName} updated` : `${input.shopName} added`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        for (const [path, message] of Object.entries(err.fieldErrors)) {
          setError(path as keyof FormValues, { message });
        }
        toast.error(err.message);
      } else {
        toast.error('Could not save the shop');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit shop' : 'Add shop'}</DialogTitle>
          <DialogDescription>
            Shops added here are verified straight away. Shops added by salesmen in the field wait in
            the To verify queue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="shopName">Shop name</Label>
              <Input id="shopName" autoComplete="off" {...register('shopName')} />
              <FieldError message={errors.shopName?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerName">Owner name</Label>
              <Input id="ownerName" autoComplete="off" {...register('ownerName')} />
              <FieldError message={errors.ownerName?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Mobile</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="98XXXXXXXX"
                {...register('phone')}
              />
              <FieldError message={errors.phone?.message} />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={watch('category') ?? RetailerCategory.KIRANA}
                onValueChange={(value) => setValue('category', value as RetailerCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as RetailerCategory[]).map((category) => (
                    <SelectItem key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TownSelect
              value={townId}
              onChange={(value) => setValue('townId', value, { shouldValidate: true })}
              towns={towns}
              loading={townsLoading}
              error={errors.townId?.message}
            />

            <div className="space-y-2">
              <Label>Supplied by</Label>
              <Select
                value={watch('distributorId') ?? ''}
                onValueChange={(value) => setValue('distributorId', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a distributor" />
                </SelectTrigger>
                <SelectContent>
                  {distributors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.firmName} ({d.town.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.distributorId?.message} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" autoComplete="off" {...register('address')} />
              <FieldError message={errors.address?.message} />
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

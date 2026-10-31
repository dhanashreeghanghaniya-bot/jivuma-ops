'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { createProductSchema, tierPrices, type ProductItem } from '@juma/shared';
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
import { ApiRequestError } from '@/lib/api-client';
import { formatINR } from '@/lib/format';
import { FieldError } from '@/features/partners/form-fields';
import { useSaveProduct } from './api';

type FormValues = z.input<typeof createProductSchema>;

const empty: FormValues = {
  name: '',
  sku: '',
  category: '',
  packSize: '',
  unitsPerCase: 24,
  mrp: 0,
  retailMargin: 0,
  distributorMargin: 0,
  ssMargin: 0,
  isActive: true,
};

const fromItem = (p: ProductItem): FormValues => ({
  name: p.name,
  sku: p.sku,
  category: p.category,
  packSize: p.packSize,
  unitsPerCase: p.unitsPerCase,
  mrp: Number(p.mrp),
  retailMargin: Number(p.retailMargin),
  distributorMargin: Number(p.distributorMargin),
  ssMargin: Number(p.ssMargin),
  isActive: p.isActive,
});

const MARGINS = [
  ['retailMargin', 'Retail margin'],
  ['distributorMargin', 'Distributor margin'],
  ['ssMargin', 'SS margin'],
] as const;

export function ProductDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProductItem | null;
}) {
  const save = useSaveProduct();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createProductSchema), defaultValues: empty });

  const [mrp, retailMargin, distributorMargin, ssMargin] = watch([
    'mrp',
    'retailMargin',
    'distributorMargin',
    'ssMargin',
  ]);
  const prices = tierPrices({
    mrp: Number(mrp) || 0,
    retailMargin: Number(retailMargin) || 0,
    distributorMargin: Number(distributorMargin) || 0,
    ssMargin: Number(ssMargin) || 0,
  });

  useEffect(() => {
    if (open) reset(editing ? fromItem(editing) : empty);
  }, [open, editing, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = createProductSchema.parse(values);
      await save.mutateAsync({ id: editing?.id, input });
      toast.success(editing ? `${input.name} updated` : `${input.name} added`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        for (const [path, message] of Object.entries(err.fieldErrors)) {
          setError(path as keyof FormValues, { message });
        }
        if (err.status === 409) setError('sku', { message: err.message });
        toast.error(err.message);
      } else toast.error('Could not save the product');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add product'}</DialogTitle>
          <DialogDescription>
            Prices are per unit and worked out from the MRP. Each margin comes off the price above
            it. Changes affect new orders only; existing orders keep the rate they were placed at.
          </DialogDescription>
        </DialogHeader>
        <form
          id="product-form"
          onSubmit={onSubmit}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-sku">SKU</Label>
            <Input id="p-sku" className="uppercase" {...register('sku')} />
            <FieldError message={errors.sku?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-category">Category</Label>
            <Input id="p-category" placeholder="Namkeen" {...register('category')} />
            <FieldError message={errors.category?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-pack">Pack size</Label>
            <Input id="p-pack" placeholder="200 g" {...register('packSize')} />
            <FieldError message={errors.packSize?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-upc">Units per case</Label>
            <Input id="p-upc" inputMode="numeric" {...register('unitsPerCase')} />
            <FieldError message={errors.unitsPerCase?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-mrp">MRP incl. GST (₹)</Label>
            <Input id="p-mrp" inputMode="decimal" {...register('mrp')} />
            <FieldError message={errors.mrp?.message} />
          </div>
          {MARGINS.map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`p-${key}`}>{label} (%)</Label>
              <Input id={`p-${key}`} inputMode="decimal" {...register(key)} />
              <FieldError message={errors[key]?.message} />
            </div>
          ))}
          <div className="bg-muted rounded-md p-3 text-sm tabular-nums sm:col-span-2">
            Retailer {formatINR(prices.retailerPrice, true)} · Distributor{' '}
            {formatINR(prices.distributorPrice, true)} · SS {formatINR(prices.ssPrice, true)}
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="accent-primary h-4 w-4" {...register('isActive')} />
            Active (inactive products are hidden from order forms)
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

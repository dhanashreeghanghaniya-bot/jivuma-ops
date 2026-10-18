'use client';

import type { UseFormRegisterReturn } from 'react-hook-form';
import { PartnerStatus } from '@juma/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { TownOption } from '@/features/users/api';

/**
 * Super stockists and distributors share their whole contact block. The props
 * are keyed by field name rather than taking a whole form object so each caller
 * keeps its own schema's type safety.
 */
export type ContactFieldName =
  | 'firmName'
  | 'ownerName'
  | 'phone'
  | 'altPhone'
  | 'email'
  | 'gstin'
  | 'address'
  | 'notes';

export interface ContactFieldsProps {
  register: (name: ContactFieldName) => UseFormRegisterReturn;
  errors: Partial<Record<ContactFieldName | 'townId' | 'status', { message?: string } | undefined>>;
  towns: TownOption[];
  townsLoading?: boolean;
  townId: string | undefined;
  onTownChange: (townId: string) => void;
  status: PartnerStatus | undefined;
  onStatusChange: (status: PartnerStatus) => void;
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export function TownSelect({
  value,
  onChange,
  towns,
  loading,
  error,
  label = 'Town',
  includeAll,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  towns: TownOption[];
  loading?: boolean;
  error?: string;
  label?: string;
  includeAll?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value ?? ''} onValueChange={onChange} disabled={loading}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? 'Loading towns…' : 'Select a town'} />
        </SelectTrigger>
        <SelectContent>
          {includeAll ? <SelectItem value="ALL">All towns</SelectItem> : null}
          {towns.map((town) => (
            <SelectItem key={town.id} value={town.id}>
              {town.name} ({town.district.name})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

export function ContactFields({
  register,
  errors,
  towns,
  townsLoading,
  townId,
  onTownChange,
  status,
  onStatusChange,
}: ContactFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="firmName">Firm name</Label>
        <Input id="firmName" autoComplete="off" {...register('firmName')} />
        <FieldError message={errors.firmName?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ownerName">Owner name</Label>
        <Input id="ownerName" autoComplete="off" {...register('ownerName')} />
        <FieldError message={errors.ownerName?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Mobile</Label>
        <Input id="phone" type="tel" inputMode="numeric" placeholder="98XXXXXXXX" {...register('phone')} />
        <FieldError message={errors.phone?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="altPhone">Alternate mobile</Label>
        <Input id="altPhone" type="tel" inputMode="numeric" {...register('altPhone')} />
        <FieldError message={errors.altPhone?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="off" {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gstin">GSTIN</Label>
        <Input id="gstin" autoComplete="off" placeholder="24ABCDE1234F1Z5" {...register('gstin')} />
        <FieldError message={errors.gstin?.message} />
      </div>

      <TownSelect
        value={townId}
        onChange={onTownChange}
        towns={towns}
        loading={townsLoading}
        error={errors.townId?.message}
      />

      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={status ?? PartnerStatus.ACTIVE}
          onValueChange={(v) => onStatusChange(v as PartnerStatus)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PartnerStatus.ACTIVE}>Active</SelectItem>
            <SelectItem value={PartnerStatus.ON_HOLD}>On hold</SelectItem>
            <SelectItem value={PartnerStatus.INACTIVE}>Inactive</SelectItem>
          </SelectContent>
        </Select>
        <FieldError message={errors.status?.message} />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" autoComplete="off" {...register('address')} />
        <FieldError message={errors.address?.message} />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          rows={2}
          className={cn(
            'flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm',
          )}
          {...register('notes')}
        />
        <FieldError message={errors.notes?.message} />
      </div>
    </div>
  );
}

/** Checkbox list for the many-to-many coverage fields (districts / towns). */
export function MultiSelectList<T extends { id: string }>({
  label,
  items,
  selectedIds,
  onToggle,
  renderLabel,
  emptyMessage = 'Nothing to choose from yet.',
}: {
  label: string;
  items: T[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  renderLabel: (item: T) => string;
  emptyMessage?: string;
}) {
  const selected = new Set(selectedIds);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">
        {label}{' '}
        <span className="font-normal text-muted-foreground">({selectedIds.length} selected)</span>
      </legend>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-md border p-2">
          <div className="grid gap-1 sm:grid-cols-2">
            {items.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={selected.has(item.id)}
                  onChange={() => onToggle(item.id)}
                />
                <span className="truncate">{renderLabel(item)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}

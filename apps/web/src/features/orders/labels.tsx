import type { OrderLevel, OrderStatus } from '@juma/shared';
import { cn } from '@/lib/utils';

export const LEVEL_LABELS: Record<OrderLevel, string> = {
  COMPANY_TO_SS: 'Company → SS',
  SS_TO_DISTRIBUTOR: 'SS → Distributor',
  DISTRIBUTOR_TO_RETAILER: 'Distributor → Shop',
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** Button labels for moving an order to a status. */
export const STATUS_ACTIONS: Record<OrderStatus, string> = {
  PLACED: 'Mark placed',
  CONFIRMED: 'Confirm',
  DISPATCHED: 'Mark dispatched',
  DELIVERED: 'Mark delivered',
  CANCELLED: 'Cancel order',
};

const TONE: Record<OrderStatus, string> = {
  PLACED: 'bg-sky-100 text-sky-900',
  CONFIRMED: 'bg-indigo-100 text-indigo-900',
  DISPATCHED: 'bg-amber-100 text-amber-900',
  DELIVERED: 'bg-emerald-100 text-emerald-900',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};

export function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        TONE[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** "12 cases + 5 units", dropping whichever part is zero. */
export function formatQty(cases: number, units: number): string {
  const parts = [
    cases ? `${cases} case${cases === 1 ? '' : 's'}` : null,
    units ? `${units} unit${units === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return parts.join(' + ') || '0';
}

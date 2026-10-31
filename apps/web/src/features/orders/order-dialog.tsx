'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { OrderLevel, PRICE_TIER, type CreateOrderInput, type RetailerListItem } from '@juma/shared';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiRequestError } from '@/lib/api-client';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  useDistributorOptions,
  useRetailers,
  useSuperStockistOptions,
} from '@/features/partners/api';
import { useCreateOrder, useProducts } from './api';
import { LEVEL_LABELS } from './labels';

const TIER_LABEL = {
  ssPrice: 'SS price',
  distributorPrice: 'Distributor price',
  retailerPrice: 'Retailer price',
} as const;

type Qty = Record<string, { cases: string; units: string }>;

/**
 * Admin-placed order (SPEC 4.4). Prices shown here are a preview from the
 * product list; the server prices the order again and its numbers win.
 */
export function NewOrderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const create = useCreateOrder();
  const { data: products = [] } = useProducts();
  const { data: superStockists = [] } = useSuperStockistOptions();
  const { data: distributors = [] } = useDistributorOptions();

  const [level, setLevel] = useState<OrderLevel>(OrderLevel.COMPANY_TO_SS);
  const [superStockistId, setSuperStockistId] = useState('');
  const [distributorId, setDistributorId] = useState('');
  const [retailerId, setRetailerId] = useState('');
  const [selectedRetailer, setSelectedRetailer] = useState<RetailerListItem | null>(null);
  const [shopSearch, setShopSearch] = useState('');
  const [qty, setQty] = useState<Qty>({});
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setLevel(OrderLevel.COMPANY_TO_SS);
    setSuperStockistId('');
    setDistributorId('');
    setRetailerId('');
    setSelectedRetailer(null);
    setShopSearch('');
    setQty({});
    setExpectedDelivery('');
    setNotes('');
    setErrors({});
  }, [open]);

  const retailers = useRetailers(
    { page: 1, distributorId: distributorId || undefined, search: shopSearch.trim() || undefined },
    open && level === OrderLevel.DISTRIBUTOR_TO_RETAILER && Boolean(distributorId),
  );

  const activeSs = superStockists.filter((s) => s.status === 'ACTIVE');
  // A distributor buys from its own super stockist only.
  const activeDistributors = distributors.filter(
    (d) =>
      d.status === 'ACTIVE' &&
      (level !== OrderLevel.SS_TO_DISTRIBUTOR ||
        !superStockistId ||
        d.superStockist.id === superStockistId),
  );

  const tier = PRICE_TIER[level];
  const lines = useMemo(
    () =>
      products
        .map((p) => {
          const q = qty[p.id];
          const cases = Number(q?.cases || 0);
          const units = Number(q?.units || 0);
          return {
            product: p,
            cases,
            units,
            amount: (cases * p.unitsPerCase + units) * Number(p[tier]),
          };
        })
        .filter((l) => l.cases + l.units > 0),
    [products, qty, tier],
  );
  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  const changeLevel = (next: OrderLevel) => {
    setLevel(next);
    setSuperStockistId('');
    setDistributorId('');
    setRetailerId('');
    setSelectedRetailer(null);
    setShopSearch('');
    setErrors({});
  };

  const submit = async () => {
    if (lines.length === 0) {
      toast.error('Please enter quantity for at least one product');
      return;
    }
    const input: CreateOrderInput = {
      level,
      superStockistId:
        level === OrderLevel.DISTRIBUTOR_TO_RETAILER ? null : superStockistId || null,
      distributorId: level === OrderLevel.COMPANY_TO_SS ? null : distributorId || null,
      retailerId: level === OrderLevel.DISTRIBUTOR_TO_RETAILER ? retailerId || null : null,
      items: lines.map((l) => ({ productId: l.product.id, qtyCases: l.cases, qtyUnits: l.units })),
      expectedDelivery: expectedDelivery || null,
      notes: notes || null,
    };
    setErrors({});
    try {
      const order = await create.mutateAsync(input);
      toast.success(`Order ${order.orderNumber} placed`);
      onOpenChange(false);
      router.push(`/admin/orders/${order.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.fieldErrors);
        toast.error(err.message);
      } else toast.error('Could not place the order');
    }
  };

  const setLine = (id: string, key: 'cases' | 'units', value: string) =>
    setQty((q) => ({
      ...q,
      [id]: { ...(q[id] ?? { cases: '', units: '' }), [key]: value.replace(/\D/g, '') },
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New order</DialogTitle>
          <DialogDescription>
            Priced at the {TIER_LABEL[tier].toLowerCase()} from the product list. Field orders come
            in from salesmen&apos;s visits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(LEVEL_LABELS) as OrderLevel[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => changeLevel(l)}
                aria-pressed={level === l}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm font-medium',
                  level === l && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {level !== OrderLevel.DISTRIBUTOR_TO_RETAILER ? (
              <div className="space-y-1.5">
                <Label>
                  {level === OrderLevel.COMPANY_TO_SS ? 'Super stockist' : 'From super stockist'}
                </Label>
                <Select
                  value={superStockistId}
                  onValueChange={(v) => {
                    setSuperStockistId(v);
                    setDistributorId('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick super stockist" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firmName} · {s.town.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.superStockistId ? (
                  <p className="text-destructive text-sm">{errors.superStockistId}</p>
                ) : null}
              </div>
            ) : null}

            {level !== OrderLevel.COMPANY_TO_SS ? (
              <div className="space-y-1.5">
                <Label>
                  {level === OrderLevel.SS_TO_DISTRIBUTOR ? 'To distributor' : 'From distributor'}
                </Label>
                <Select
                  value={distributorId}
                  onValueChange={(v) => {
                    setDistributorId(v);
                    setRetailerId('');
                  }}
                  disabled={level === OrderLevel.SS_TO_DISTRIBUTOR && !superStockistId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        level === OrderLevel.SS_TO_DISTRIBUTOR && !superStockistId
                          ? 'Pick the super stockist first'
                          : 'Pick distributor'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {activeDistributors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.firmName} · {d.town.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {level === OrderLevel.SS_TO_DISTRIBUTOR &&
                superStockistId &&
                activeDistributors.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No active distributor buys from this super stockist.
                  </p>
                ) : null}
                {errors.distributorId ? (
                  <p className="text-destructive text-sm">{errors.distributorId}</p>
                ) : null}
              </div>
            ) : null}

            {level === OrderLevel.DISTRIBUTOR_TO_RETAILER ? (
              <div className="space-y-1.5">
                <Label>To shop</Label>
                {selectedRetailer ? (
                  <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{selectedRetailer.shopName}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {selectedRetailer.ownerName} · {selectedRetailer.town.name}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRetailerId('');
                        setSelectedRetailer(null);
                        setShopSearch('');
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Input
                      placeholder={
                        distributorId
                          ? "Search this distributor's shops"
                          : 'Pick the distributor first'
                      }
                      value={shopSearch}
                      onChange={(e) => setShopSearch(e.target.value)}
                      disabled={!distributorId}
                      autoFocus
                    />
                    {distributorId ? (
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1 shadow-sm">
                        {(retailers.data?.items ?? []).map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setRetailerId(r.id);
                              setSelectedRetailer(r);
                              setShopSearch('');
                            }}
                            className={cn(
                              'hover:bg-muted w-full rounded px-2 py-1.5 text-left text-sm transition-colors',
                              retailerId === r.id && 'bg-primary/10 font-medium',
                            )}
                          >
                            {r.shopName}{' '}
                            <span className="text-muted-foreground">· {r.town.name}</span>
                          </button>
                        ))}
                        {retailers.data && retailers.data.items.length === 0 ? (
                          <p className="text-muted-foreground px-2 py-1.5 text-sm">No shops match.</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
                {errors.retailerId ? (
                  <p className="text-destructive text-sm">{errors.retailerId}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24">Cases</TableHead>
                  <TableHead className="w-24">Units</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const line = lines.find((l) => l.product.id === p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {p.packSize} · {p.unitsPerCase}/case · {formatINR(p[tier], true)}/unit
                        </p>
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          aria-label={`Cases of ${p.name}`}
                          value={qty[p.id]?.cases ?? ''}
                          onChange={(e) => setLine(p.id, 'cases', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          aria-label={`Units of ${p.name}`}
                          value={qty[p.id]?.units ?? ''}
                          onChange={(e) => setLine(p.id, 'units', e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line ? formatINR(line.amount, true) : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {errors.items ? <p className="text-destructive text-sm">{errors.items}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="order-delivery">Expected delivery (optional)</Label>
              <Input
                id="order-delivery"
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-notes">Notes (optional)</Label>
              <Input id="order-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="text-sm">
            {lines.length} product{lines.length === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold tabular-nums">{formatINR(total, true)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={create.isPending || lines.length === 0}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Place order
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { OrderStatus, type OrderDetail, type OrderParty } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useChangeOrderStatus, useOrder } from '@/features/orders/api';
import {
  LEVEL_LABELS,
  STATUS_ACTIONS,
  STATUS_LABELS,
  StatusPill,
  formatQty,
} from '@/features/orders/labels';

const PARTY_PATHS: Partial<Record<OrderParty['type'], string>> = {
  SUPER_STOCKIST: '/admin/partners/super-stockists',
  DISTRIBUTOR: '/admin/partners/distributors',
  RETAILER: '/admin/partners/retailers',
};

const PARTY_LABELS: Record<OrderParty['type'], string> = {
  COMPANY: 'Company',
  SUPER_STOCKIST: 'Super stockist',
  DISTRIBUTOR: 'Distributor',
  RETAILER: 'Shop',
};

function PartyCard({ label, party }: { label: string; party: OrderParty }) {
  const path = party.id ? PARTY_PATHS[party.type] : undefined;
  return (
    <div className="flex-1 rounded-md border p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label} · {PARTY_LABELS[party.type]}
      </p>
      {path ? (
        <Link href={`${path}/${party.id}`} className="font-medium hover:underline">
          {party.name}
        </Link>
      ) : (
        <p className="font-medium">{party.name}</p>
      )}
      {party.town ? (
        <p className="text-muted-foreground text-sm">
          {party.town.name}
          {party.district ? `, ${party.district.name}` : ''}
        </p>
      ) : null}
    </div>
  );
}

function StatusActions({ order }: { order: OrderDetail }) {
  const change = useChangeOrderStatus();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  if (order.nextStatuses.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        This order is {STATUS_LABELS[order.status].toLowerCase()}; its status is final.
      </p>
    );
  }

  const move = async (status: OrderStatus, withNote: string | null) => {
    try {
      await change.mutateAsync({ id: order.id, input: { status, note: withNote } });
      toast.success(`${order.orderNumber} is now ${STATUS_LABELS[status].toLowerCase()}`);
      setCancelling(false);
      setReason('');
      setNote('');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not update the order');
    }
  };

  const forward = order.nextStatuses.filter((s) => s !== OrderStatus.CANCELLED);
  const canCancel = order.nextStatuses.includes(OrderStatus.CANCELLED);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Note for the timeline (optional), e.g. vehicle GJ-03-AB-1234"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {forward.map((status, index) => (
          <Button
            key={status}
            variant={index === 0 ? 'default' : 'outline'}
            disabled={change.isPending}
            onClick={() => void move(status, note.trim() || null)}
          >
            {change.isPending && change.variables?.input.status === status ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {STATUS_ACTIONS[status]}
            {index > 0 ? <span className="text-muted-foreground text-xs">(skip ahead)</span> : null}
          </Button>
        ))}
        {canCancel && !cancelling ? (
          <Button variant="ghost" className="text-destructive" onClick={() => setCancelling(true)}>
            Cancel order...
          </Button>
        ) : null}
      </div>
      {cancelling ? (
        <div className="border-destructive/40 flex flex-col gap-2 rounded-md border p-3 sm:flex-row">
          <Input
            autoFocus
            placeholder="Why is it cancelled? (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={!reason.trim() || change.isPending}
              onClick={() => void move(OrderStatus.CANCELLED, reason.trim())}
            >
              Cancel order
            </Button>
            <Button variant="outline" onClick={() => setCancelling(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);

  if (order.isPending) return <LoadingState />;
  if (order.isError || !order.data) {
    return (
      <ErrorState
        message={
          order.error instanceof ApiRequestError ? order.error.message : 'Could not load the order'
        }
        onRetry={() => void order.refetch()}
      />
    );
  }
  const o = order.data;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/orders"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        All orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tabular-nums tracking-tight">{o.orderNumber}</h1>
            <StatusPill status={o.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {LEVEL_LABELS[o.level]} · placed {formatDateTime(o.orderDate)}
            {o.expectedDelivery ? ` · expected ${formatDate(o.expectedDelivery)}` : ''}
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{formatINR(o.totalAmount, true)}</p>
      </div>

      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        <PartyCard label="From" party={o.from} />
        <ArrowRight className="text-muted-foreground hidden h-5 w-5 shrink-0 md:block" />
        <PartyCard label="To" party={o.to} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
            {o.takenBy ? (
              <CardDescription className="flex items-center gap-1">
                {o.visit ? <MapPin className="h-3.5 w-3.5" /> : null}
                Taken by {o.takenBy.name}
                {o.visit ? ` during a visit at ${formatDateTime(o.visit.checkInAt)}` : ''}
                {o.visit?.distanceFromShopMeters != null && o.visit.distanceFromShopMeters > 300
                  ? ` (checked in ${o.visit.distanceFromShopMeters} m from the shop)`
                  : ''}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.product.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {item.product.sku} · {item.product.packSize}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>{formatQty(item.qtyCases, item.qtyUnits)}</p>
                        {item.qtyCases > 0 ? (
                          <p className="text-muted-foreground text-xs">{item.totalUnits} units</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(item.rate, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(item.amount, true)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(o.totalAmount, true)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            {o.notes ? (
              <p className="text-muted-foreground mt-4 text-sm">Notes: {o.notes}</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Update status</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusActions order={o} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {o.timeline.map((entry, index) => (
                  <li key={entry.id} className="relative pl-6">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full',
                        entry.status === 'CANCELLED' ? 'bg-destructive' : 'bg-primary',
                      )}
                    />
                    {index < o.timeline.length - 1 ? (
                      <span
                        aria-hidden
                        className="bg-border absolute left-[4px] top-4 h-[calc(100%+0.25rem)] w-px"
                      />
                    ) : null}
                    <p className="text-sm font-medium">{STATUS_LABELS[entry.status]}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(entry.at)}
                      {entry.by ? ` · ${entry.by.name}` : ''}
                    </p>
                    {entry.note ? <p className="mt-1 text-sm">{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { formatDate, formatINR } from '@/lib/format';
import { useOrders, type OrderFilters } from './api';
import { LEVEL_LABELS, StatusPill } from './labels';

/**
 * Order history on a partner's detail page (SPEC 4.2). A super stockist and a
 * distributor both buy and sell, so their history covers both directions.
 */
export function OrderHistoryCard({
  partner,
}: {
  partner: Pick<OrderFilters, 'superStockistId' | 'distributorId' | 'retailerId'>;
}) {
  const [page, setPage] = useState(1);
  const orders = useOrders({ ...partner, page, limit: 10 });
  const meta = orders.data?.meta;
  const selfId = partner.superStockistId ?? partner.distributorId ?? partner.retailerId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order history</CardTitle>
        {meta ? (
          <CardDescription>
            {meta.total} order{meta.total === 1 ? '' : 's'} · {formatINR(meta.totalValue)} excluding
            cancelled
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {orders.isPending ? <LoadingState /> : null}
        {orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : null}
        {orders.data?.items.length === 0 ? <EmptyState message="No orders yet." /> : null}
        {orders.data?.items.map((o) => {
          const buying = o.to.id === selfId;
          return (
            <Link
              key={o.id}
              href={`/admin/orders/${o.id}`}
              className="hover:bg-muted flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition"
            >
              <span className="min-w-0">
                <span className="block font-medium tabular-nums">{o.orderNumber}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {formatDate(o.orderDate)} · {LEVEL_LABELS[o.level]} ·{' '}
                  {buying ? `from ${o.from.name}` : `to ${o.to.name}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <StatusPill status={o.status} />
                <span className="w-24 text-right tabular-nums">{formatINR(o.totalAmount)}</span>
              </span>
            </Link>
          );
        })}
        {meta && meta.totalPages > 1 ? (
          <div className="text-muted-foreground flex items-center justify-between pt-2 text-sm">
            Page {page} of {meta.totalPages}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

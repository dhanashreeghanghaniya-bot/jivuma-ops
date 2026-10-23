'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import type { OrderListItem, OrderListMeta } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatINR } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { withOfflineCopy } from '@/features/field/api';
import { StatusPill } from '@/features/orders/labels';

/** SPEC 5.2: the orders he took, with where each one has got to. */
export default function SalesmanOrdersPage() {
  const { user } = useAuth();
  const t = useT();
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ['orders', 'mine', page],
    queryFn: () =>
      withOfflineCopy(`orders:${user?.id}:${page}`, async () => {
        const { data, meta } = await api.get<OrderListItem[]>('/orders', {
          query: { page, limit: 20 },
        });
        return { items: data ?? [], meta: meta as OrderListMeta };
      }),
    enabled: Boolean(user),
    placeholderData: (previous) => previous,
  });
  const meta = orders.data?.meta;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('orders.title')}</h1>
        {meta ? (
          <p className="text-muted-foreground text-sm">
            {t('orders.summary', { n: meta.total, value: formatINR(meta.totalValue) })}
          </p>
        ) : null}
      </div>

      {orders.data?.fromCache ? (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
          {t('orders.offline')}
        </p>
      ) : null}
      {orders.isPending ? <LoadingState /> : null}
      {orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : null}
      {orders.data?.items.length === 0 ? <EmptyState message={t('orders.none')} /> : null}

      <div className="space-y-2">
        {orders.data?.items.map((o) => (
          <Link key={o.id} href={`/app/orders/${o.id}`}>
            <Card className="hover:bg-muted/40 transition">
              <CardContent className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{o.to.name}</p>
                    <StatusPill status={o.status} />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {o.orderNumber} · {formatDate(o.orderDate)} · {o.to.town?.name}
                  </p>
                  <p className="text-sm tabular-nums">{formatINR(o.totalAmount)}</p>
                </div>
                <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('orders.newer')}
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {meta.totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('orders.older')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

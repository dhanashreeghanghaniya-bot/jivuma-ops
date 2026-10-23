'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { OrderDetail } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError, api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, formatINR } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { withOfflineCopy } from '@/features/field/api';
import { StatusPill, useFormatQty } from '@/features/orders/labels';

export default function SalesmanOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const t = useT();
  const formatQty = useFormatQty();
  const order = useQuery({
    queryKey: ['orders', 'mine', 'detail', id],
    queryFn: () =>
      withOfflineCopy(
        `order:${user?.id}:${id}`,
        async () => (await api.get<OrderDetail>(`/orders/${id}`)).data,
      ),
    enabled: Boolean(user && id),
  });

  const back = (
    <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
      <Link href="/app/orders">
        <ArrowLeft className="h-5 w-5" />
      </Link>
    </Button>
  );

  if (order.isPending) return <LoadingState />;
  if (order.isError || !order.data) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState
          message={
            order.error instanceof ApiRequestError ? order.error.message : t('common.notOfflineYet')
          }
          onRetry={() => void order.refetch()}
        />
      </div>
    );
  }
  const o = order.data;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        {back}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{o.to.name}</h1>
          <p className="text-muted-foreground text-xs">
            {o.orderNumber} · {formatDateTime(o.orderDate)}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <StatusPill status={o.status} />
          <p className="text-xl font-semibold tabular-nums">{formatINR(o.totalAmount, true)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('orders.items')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {o.items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{item.product.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatQty(item.qtyCases, item.qtyUnits)} ·{' '}
                  {t('visit.perUnit', { price: formatINR(item.rate, true) })}
                </p>
              </div>
              <p className="tabular-nums">{formatINR(item.amount, true)}</p>
            </div>
          ))}
          <p className="text-muted-foreground pt-2 text-xs">
            {t('orders.deliveredBy', { name: o.from.name })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('orders.status')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {o.timeline.map((entry) => (
              <li key={entry.id} className="text-sm">
                <p className="font-medium">{t(`orderStatus.${entry.status}`)}</p>
                <p className="text-muted-foreground text-xs">{formatDateTime(entry.at)}</p>
                {entry.note ? <p className="text-xs">{entry.note}</p> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

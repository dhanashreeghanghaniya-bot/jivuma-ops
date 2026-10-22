'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { OrderHistoryCard } from '@/features/orders/order-history';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { PartnerStatus } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatNumber, formatPhone } from '@/lib/format';
import { useDistributors, useSuperStockist } from '@/features/partners/api';
import { ContactCard, DetailHeader, StatCard, TagList } from '@/features/partners/partner-detail';
import { SuperStockistDialog } from '@/features/partners/super-stockist-dialog';

export default function SuperStockistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const [editing, setEditing] = useState(false);

  const { data, isPending, isError, error, refetch } = useSuperStockist(id);
  // Downstream distributors, i.e. who this super stockist supplies.
  const downstream = useDistributors({ page: 1, superStockistId: id ?? undefined }, Boolean(id));

  if (isPending) return <LoadingState />;
  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof ApiRequestError ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <DetailHeader
        title={data.firmName}
        subtitle={`${data.ownerName} · Onboarded ${formatDate(data.onboardedAt)}`}
        badges={
          <Badge variant={data.status === PartnerStatus.ACTIVE ? 'success' : 'secondary'}>
            {data.status.replace('_', ' ')}
          </Badge>
        }
        actions={
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Distributors" value={formatNumber(data.counts.distributors)} />
        <StatCard label="Orders from company" value={formatNumber(data.counts.orders)} />
        <StatCard
          label="Last order"
          value={data.lastOrderAt ? formatDate(data.lastOrderAt) : 'Never'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ContactCard
          phone={data.phone}
          altPhone={data.altPhone}
          email={data.email}
          address={data.address}
          townName={data.town.name}
          districtName={data.town.district.name}
          lat={data.lat}
          lng={data.lng}
        />

        <div className="space-y-4">
          <TagList
            title="Districts covered"
            items={data.coveredDistricts.map((d) => `${d.name} (${d.code})`)}
            emptyMessage="No districts assigned yet, so this super stockist does not affect coverage."
          />

          {data.gstin ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">GSTIN</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm">{data.gstin}</p>
              </CardContent>
            </Card>
          ) : null}

          {data.notes ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap text-sm">{data.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Distributors supplied{' '}
            <span className="text-muted-foreground font-normal">
              ({downstream.data?.items.length ?? 0})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {downstream.isPending ? <LoadingState /> : null}
          {downstream.data?.items.length === 0 ? (
            <EmptyState message="No distributors appointed under this super stockist yet." />
          ) : null}
          {downstream.data?.items.length ? (
            <ul className="divide-y rounded-md border">
              {downstream.data.items.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/partners/distributors/${d.id}`}
                      className="text-primary font-medium underline-offset-2 hover:underline"
                    >
                      {d.firmName}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {d.town.name} &middot; {d.counts.retailers} shops
                    </p>
                  </div>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {formatPhone(d.phone)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <OrderHistoryCard partner={{ superStockistId: data.id }} />

      <SuperStockistDialog open={editing} onOpenChange={setEditing} editing={data} />
    </div>
  );
}

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
import { formatDate, formatINR, formatNumber, formatPhone } from '@/lib/format';
import { useDistributor, useRetailers } from '@/features/partners/api';
import { ContactCard, DetailHeader, StatCard, TagList } from '@/features/partners/partner-detail';
import { DistributorDialog } from '@/features/partners/distributor-dialog';

export default function DistributorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const [editing, setEditing] = useState(false);

  const { data, isPending, isError, error, refetch } = useDistributor(id);
  const downstream = useRetailers({ page: 1, distributorId: id ?? undefined }, Boolean(id));

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

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Retailers" value={formatNumber(data.counts.retailers)} />
        <StatCard label="Orders" value={formatNumber(data.counts.orders)} />
        <StatCard
          label="Last order"
          value={data.lastOrderAt ? formatDate(data.lastOrderAt) : 'Never'}
        />
        <StatCard
          label="Credit"
          value={data.creditLimit ? formatINR(data.creditLimit) : 'None'}
          hint={data.creditDays ? `${data.creditDays} days` : undefined}
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Buys from</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/admin/partners/super-stockists/${data.superStockist.id}`}
                className="text-primary font-medium underline-offset-2 hover:underline"
              >
                {data.superStockist.firmName}
              </Link>
              <span className="text-muted-foreground text-sm tabular-nums">
                {formatPhone(data.superStockist.phone)}
              </span>
            </CardContent>
          </Card>

          <TagList
            title="Towns covered"
            items={data.coveredTowns.map((t) => t.name)}
            emptyMessage="No towns assigned yet."
          />

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
            Shops supplied{' '}
            <span className="text-muted-foreground font-normal">
              ({downstream.data?.meta?.total ?? 0})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {downstream.isPending ? <LoadingState /> : null}
          {downstream.data?.items.length === 0 ? (
            <EmptyState message="No shops mapped to this distributor yet." />
          ) : null}
          {downstream.data?.items.length ? (
            <ul className="divide-y rounded-md border">
              {downstream.data.items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/partners/retailers/${r.id}`}
                      className="text-primary font-medium underline-offset-2 hover:underline"
                    >
                      {r.shopName}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {r.town.name} &middot; {r.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.isVerified ? null : <Badge variant="warning">To verify</Badge>}
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatPhone(r.phone)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <OrderHistoryCard partner={{ distributorId: data.id }} />

      <DistributorDialog open={editing} onOpenChange={setEditing} editing={data} />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { OrderHistoryCard } from '@/features/orders/order-history';
import { VisitHistoryCard } from '@/features/partners/visit-history';
import Link from 'next/link';
import { BadgeCheck, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatDateTime, formatNumber, formatPhone } from '@/lib/format';
import { useRetailer, useVerifyRetailer } from '@/features/partners/api';
import { ContactCard, DetailHeader, StatCard } from '@/features/partners/partner-detail';
import { RetailerDialog } from '@/features/partners/retailer-dialog';

export default function RetailerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const [editing, setEditing] = useState(false);

  const { data, isPending, isError, error, refetch } = useRetailer(id);
  const verifyRetailer = useVerifyRetailer();

  if (isPending) return <LoadingState />;
  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof ApiRequestError ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const verify = async () => {
    try {
      await verifyRetailer.mutateAsync(data.id);
      toast.success(`${data.shopName} verified`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not verify the shop');
    }
  };

  return (
    <div className="space-y-6">
      <DetailHeader
        title={data.shopName}
        subtitle={`${data.ownerName} · Added ${formatDate(data.createdAt)}`}
        badges={
          data.isVerified ? (
            <Badge variant="success">Verified</Badge>
          ) : (
            <Badge variant="warning">To verify</Badge>
          )
        }
        actions={
          <>
            {data.isVerified ? null : (
              <Button onClick={() => void verify()} disabled={verifyRetailer.isPending}>
                <BadgeCheck className="h-4 w-4" />
                Verify
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </>
        }
      />

      {data.isVerified ? null : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {data.addedBySalesman
            ? `${data.addedBySalesman.name} added this shop in the field. Check the details and verify it.`
            : 'This shop is waiting for verification.'}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Category" value={data.category} />
        <StatCard label="Visits" value={formatNumber(data.counts.visits)} />
        <StatCard label="Orders" value={formatNumber(data.counts.orders)} />
        <StatCard
          label="Last order"
          value={data.lastOrderAt ? formatDate(data.lastOrderAt) : 'Never'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ContactCard
          phone={data.phone}
          address={data.address}
          townName={data.town.name}
          districtName={data.town.district.name}
          lat={data.lat}
          lng={data.lng}
        />

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Supplied by</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/admin/partners/distributors/${data.distributor.id}`}
                className="text-primary font-medium underline-offset-2 hover:underline"
              >
                {data.distributor.firmName}
              </Link>
              <span className="text-muted-foreground text-sm tabular-nums">
                {formatPhone(data.distributor.phone)}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Record</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-xs">Added by</dt>
                  <dd>{data.addedBySalesman?.name ?? 'Office'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Verified at</dt>
                  <dd>{data.verifiedAt ? formatDateTime(data.verifiedAt) : 'Not yet'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Pin</dt>
                  <dd className="tabular-nums">
                    {data.lat.toFixed(6)}, {data.lng.toFixed(6)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VisitHistoryCard retailerId={data.id} />
        <OrderHistoryCard partner={{ retailerId: data.id }} />
      </div>

      <RetailerDialog open={editing} onOpenChange={setEditing} editing={data} />
    </div>
  );
}

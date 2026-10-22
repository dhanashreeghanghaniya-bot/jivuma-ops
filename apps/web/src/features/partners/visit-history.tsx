'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Camera } from 'lucide-react';
import { VISIT_DISTANCE_FLAG_M, type VisitListItem } from '@juma/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { api } from '@/lib/api-client';
import { formatDateTime, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { OUTCOME_LABELS, OUTCOME_TONE } from '@/features/field/labels';

/** Salesman visits to one shop, newest first (SPEC 4.2). */
export function VisitHistoryCard({ retailerId }: { retailerId: string }) {
  const visits = useQuery({
    queryKey: ['visits', 'retailer', retailerId],
    queryFn: async () =>
      (await api.get<VisitListItem[]>('/visits', { query: { retailerId } })).data ?? [],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Visit history</CardTitle>
        {visits.data ? (
          <CardDescription>
            {visits.data.length} visit{visits.data.length === 1 ? '' : 's'}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {visits.isPending ? <LoadingState /> : null}
        {visits.isError ? <ErrorState onRetry={() => void visits.refetch()} /> : null}
        {visits.data?.length === 0 ? <EmptyState message="No visits yet." /> : null}
        {visits.data?.slice(0, 20).map((v) => (
          <div key={v.id} className="space-y-1 rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{v.salesman.name}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  OUTCOME_TONE[v.outcome],
                )}
              >
                {OUTCOME_LABELS[v.outcome]}
              </span>
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>{formatDateTime(v.checkInAt)}</span>
              {v.order ? (
                <span className="text-foreground tabular-nums">
                  {v.order.orderNumber} · {formatINR(v.order.totalAmount)}
                </span>
              ) : null}
              {v.noOrderReason ? <span>{v.noOrderReason}</span> : null}
              {v.photos.length > 0 ? (
                <span className="flex items-center gap-1">
                  <Camera className="h-3.5 w-3.5" />
                  {v.photos.length}
                </span>
              ) : null}
              {v.distanceFromShopMeters !== null &&
              v.distanceFromShopMeters > VISIT_DISTANCE_FLAG_M ? (
                <span className="flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  checked in {v.distanceFromShopMeters} m away
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

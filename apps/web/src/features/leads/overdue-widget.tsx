'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatPhone } from '@/lib/format';
import { useLeadsList } from './api';
import { STAGE_LABELS } from './lead-labels';

/** "Overdue follow-ups" widget for the admin dashboard (SPEC 4.3). */
export function OverdueFollowUpsCard() {
  const { data, isPending } = useLeadsList({ page: 1, overdue: true });

  const leads = data?.items ?? [];
  const total = Number(data?.meta?.total ?? 0);

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle
            className={total > 0 ? 'h-4 w-4 text-amber-600' : 'text-muted-foreground h-4 w-4'}
          />
          Overdue follow-ups
          {total > 0 ? <Badge variant="warning">{total}</Badge> : null}
        </CardTitle>
        <CardDescription>
          {total > 0
            ? 'Open leads whose follow-up date has passed.'
            : 'Nothing overdue. Every open lead is on schedule.'}
        </CardDescription>
      </CardHeader>

      {isPending || leads.length > 0 ? (
        <CardContent className="space-y-2">
          {isPending ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : null}

          {leads.slice(0, 5).map((lead) => (
            <Link
              key={lead.id}
              href="/admin/leads?overdue=1"
              prefetch={false}
              className="hover:bg-muted flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{lead.firmName ?? lead.name}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {lead.town.name} &middot; {STAGE_LABELS[lead.stage]} &middot;{' '}
                  {formatPhone(lead.phone)}
                </span>
              </span>
              <span className="text-destructive shrink-0 text-xs font-medium tabular-nums">
                {formatDate(lead.followUpAt)}
              </span>
            </Link>
          ))}

          {total > 5 ? (
            <Link
              href="/admin/leads?overdue=1"
              className="text-primary inline-block text-sm font-medium underline"
            >
              See all {total}
            </Link>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { formatINR } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { MyExpenseList, useMyExpenses } from '@/features/expenses/mine';

/** SPEC 5.2: the month's claims, claimed vs approved, with the admin's remarks. */
export default function SalesmanExpensesPage() {
  const t = useT();
  const [month, setMonth] = useState(() =>
    new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7),
  );
  const expenses = useMyExpenses({ month });
  const s = expenses.summary;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('exp.title')}</h1>
        <Input
          type="month"
          aria-label={t('exp.month')}
          className="h-11 w-40"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
      </div>

      {s ? (
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 pt-6 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t('exp.claimed')}</p>
              <p className="text-lg font-semibold tabular-nums">{formatINR(s.claimed)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t('exp.approved')}</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-700">
                {formatINR(s.approved)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t('exp.pending')}</p>
              <p className="font-medium tabular-nums">{formatINR(s.pending)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t('exp.rejected')}</p>
              <p className="font-medium tabular-nums">{formatINR(s.rejected)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {expenses.data?.fromCache ? (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
          {t('common.offlineCached')}
        </p>
      ) : null}

      <Button asChild variant="outline" className="h-12 w-full">
        <Link href="/app/expenses/new">
          <Plus className="h-4 w-4" />
          {t('exp.addUntied')}
        </Link>
      </Button>

      {expenses.isPending ? <LoadingState /> : null}
      {expenses.isError && expenses.rows.length === 0 ? (
        <ErrorState onRetry={() => void expenses.refetch()} />
      ) : null}
      {!expenses.isPending && expenses.rows.length === 0 ? (
        <EmptyState message={t('exp.none')} />
      ) : null}
      <MyExpenseList rows={expenses.rows} />
    </div>
  );
}

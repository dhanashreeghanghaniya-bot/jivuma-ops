'use client';

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError, downloadFile } from '@/lib/api-client';
import { formatINR } from '@/lib/format';
import { monthName, useMyReports } from './api';

/** SPEC 5.2 "My month": the salary statement, once the admin has finalised it. */
export function MyMonthCard() {
  const reports = useMyReports();
  const latest = reports.data?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My month</CardTitle>
        <CardDescription>Your statement appears here once the office finalises it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.data?.length === 0 ? (
          <p className="text-muted-foreground text-sm">No statement yet.</p>
        ) : null}
        {latest ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">{monthName(latest.month)}</p>
              <Badge variant={latest.status === 'PAID' ? 'success' : 'warning'}>
                {latest.status === 'PAID' ? 'Paid' : 'Final'}
              </Badge>
            </div>
            {[
              ['Salary', latest.salary],
              ['TA (approved)', latest.taTotal],
              ['DA (approved)', latest.daTotal],
              ['Other expenses (approved)', latest.otherExpenses],
              ['Incentives', latest.incentives],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">{formatINR(value!)}</span>
              </div>
            ))}
            {Number(latest.deductions) ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Deductions{latest.deductionNote ? ` (${latest.deductionNote})` : ''}
                </span>
                <span className="tabular-nums">- {formatINR(latest.deductions)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatINR(latest.grandTotal)}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {latest.workingDays} days worked · {latest.visitsCount} visits · {latest.ordersCount}{' '}
              orders worth {formatINR(latest.orderValue)}
            </p>
          </div>
        ) : null}
        {reports.data?.map((r) => (
          <Button
            key={r.id}
            variant="outline"
            className="h-11 w-full justify-between"
            onClick={() =>
              void downloadFile(`/reports/monthly-cost/${r.id}/pdf`).catch((err) =>
                toast.error(
                  err instanceof ApiRequestError ? err.message : 'Needs signal to download',
                ),
              )
            }
          >
            <span>{monthName(r.month)} statement</span>
            <Download className="h-4 w-4" />
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

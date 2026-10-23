'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Role, type CostReportItem, type ReportStatus } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError, downloadFile } from '@/lib/api-client';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSalesmenOptions } from '@/features/leads/api';
import {
  istMonth,
  monthName,
  useAddIncentive,
  useCostReports,
  useDeleteIncentive,
  useGenerateReports,
  useIncentives,
  useReportStatus,
  useUpdateReport,
} from './api';

const message = (err: unknown, fallback: string) =>
  err instanceof ApiRequestError ? err.message : fallback;

const STATUS_BADGE: Record<ReportStatus, 'secondary' | 'warning' | 'success'> = {
  DRAFT: 'secondary',
  FINAL: 'warning',
  PAID: 'success',
};

const pct = (ratio: string | null) =>
  ratio === null ? '-' : `${(Number(ratio) * 100).toFixed(1)}%`;

function DeductionEditor({ report, onDone }: { report: CostReportItem; onDone: () => void }) {
  const update = useUpdateReport();
  const [amount, setAmount] = useState(report.deductions === '0.00' ? '' : report.deductions);
  const [note, setNote] = useState(report.deductionNote ?? '');
  const save = async () => {
    try {
      await update.mutateAsync({
        id: report.id,
        input: { deductions: Number(amount || 0), deductionNote: note },
      });
      toast.success(`Deduction saved for ${report.salesman.name}`);
      onDone();
    } catch (err) {
      toast.error(message(err, 'Could not save the deduction'));
    }
  };
  return (
    <div className="bg-muted/30 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center">
      <Input
        aria-label="Deduction amount"
        inputMode="decimal"
        placeholder="Amount"
        className="sm:w-32"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Input
        aria-label="Deduction note"
        placeholder="What for, e.g. advance recovered"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={update.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ReportRow({ r }: { r: CostReportItem }) {
  const status = useReportStatus();
  const [editing, setEditing] = useState(false);
  // Claims approved after FINAL never reach any statement, so finalising over
  // pending claims takes a second, deliberate click.
  const [confirmFinal, setConfirmFinal] = useState(false);

  const move = async (to: ReportStatus) => {
    try {
      await status.mutateAsync({ id: r.id, input: { status: to } });
      toast.success(
        `${r.salesman.name}: ${to === 'FINAL' ? 'finalised, salesman notified' : to === 'PAID' ? 'marked paid' : 'back to draft'}`,
      );
    } catch (err) {
      toast.error(message(err, 'Could not change the report'));
    }
  };

  return (
    <>
      <TableRow className={cn(r.status !== 'DRAFT' && 'bg-muted/20')}>
        <TableCell>
          <p className="font-medium">{r.salesman.name}</p>
          <p className="text-muted-foreground text-xs">
            {r.workingDays} days worked · {r.leaves} leave
          </p>
          {r.pendingClaims > 0 ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {r.pendingClaims} claim{r.pendingClaims === 1 ? '' : 's'} still pending, not included
            </p>
          ) : null}
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatINR(r.salary)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {formatINR(Number(r.taTotal) + Number(r.daTotal) + Number(r.otherExpenses))}
          <p className="text-muted-foreground text-xs">
            TA {formatINR(r.taTotal)} · DA {formatINR(r.daTotal)}
            {Number(r.otherExpenses) ? ` · other ${formatINR(r.otherExpenses)}` : ''}
          </p>
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatINR(r.incentives)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {Number(r.deductions) ? `- ${formatINR(r.deductions)}` : '-'}
          {r.deductionNote ? (
            <p className="text-muted-foreground text-xs">{r.deductionNote}</p>
          ) : null}
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">
          {formatINR(r.grandTotal)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatINR(r.orderValue)}
          <p className="text-muted-foreground text-xs">
            {r.ordersCount} orders · {r.visitsCount} visits · {r.newRetailers} new shop
            {r.newRetailers === 1 ? '' : 's'}
          </p>
        </TableCell>
        <TableCell className="text-right tabular-nums">{pct(r.costToSalesRatio)}</TableCell>
        <TableCell>
          <Badge variant={STATUS_BADGE[r.status]}>
            {r.status === 'DRAFT' ? 'Draft' : r.status === 'FINAL' ? 'Final' : 'Paid'}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap justify-end gap-1">
            {r.status === 'DRAFT' ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Deduction for ${r.salesman.name}`}
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={confirmFinal ? 'destructive' : 'default'}
                  disabled={status.isPending}
                  onClick={() =>
                    r.pendingClaims > 0 && !confirmFinal
                      ? setConfirmFinal(true)
                      : void move('FINAL')
                  }
                >
                  {confirmFinal ? `Finalise without ${r.pendingClaims} pending` : 'Finalise'}
                </Button>
              </>
            ) : null}
            {r.status === 'FINAL' ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void move('DRAFT')}
                  disabled={status.isPending}
                >
                  Reopen
                </Button>
                <Button size="sm" onClick={() => void move('PAID')} disabled={status.isPending}>
                  Mark paid
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              aria-label={`PDF for ${r.salesman.name}`}
              onClick={() =>
                void downloadFile(`/reports/monthly-cost/${r.id}/pdf`).catch((err) =>
                  toast.error(message(err, 'Could not download the PDF')),
                )
              }
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {editing ? (
        <TableRow>
          <TableCell colSpan={10}>
            <DeductionEditor report={r} onDone={() => setEditing(false)} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function Incentives({ month }: { month: string }) {
  const incentives = useIncentives(month);
  const add = useAddIncentive();
  const remove = useDeleteIncentive(month);
  const { data: users = [] } = useSalesmenOptions();
  const salesmen = users.filter((u) => u.role === Role.SALESMAN);
  const [salesmanId, setSalesmanId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const submit = async () => {
    try {
      await add.mutateAsync({ salesmanId, month, amount: Number(amount), reason });
      toast.success('Incentive added. Regenerate the report to include it.');
      setAmount('');
      setReason('');
    } catch (err) {
      toast.error(message(err, 'Could not add the incentive'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Incentives for {monthName(month)}</CardTitle>
        <CardDescription>
          Added to the report on the next generate. Locked for a salesman once his report is final.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {incentives.data?.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span>
              <span className="font-medium">{i.salesman.name}</span> · {i.reason}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{formatINR(i.amount)}</span>
              {i.editable ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove incentive"
                  onClick={() =>
                    void remove
                      .mutateAsync(i.id)
                      .catch((err) => toast.error(message(err, 'Could not remove')))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </span>
          </div>
        ))}
        {incentives.data?.length === 0 ? (
          <p className="text-muted-foreground text-sm">None this month.</p>
        ) : null}
        <div className="flex flex-col gap-2 lg:flex-row">
          <Select value={salesmanId} onValueChange={setSalesmanId}>
            <SelectTrigger className="lg:w-48">
              <SelectValue placeholder="Salesman" />
            </SelectTrigger>
            <SelectContent>
              {salesmen.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="Incentive amount"
            inputMode="decimal"
            placeholder="Amount ₹"
            className="lg:w-32"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            aria-label="Incentive reason"
            placeholder="What for, e.g. monthly target met"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            onClick={() => void submit()}
            disabled={!salesmanId || !Number(amount) || reason.trim().length < 3 || add.isPending}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** SPEC 4.7: generate for a month, review, mark FINAL, mark PAID; PDF each, Excel all. */
export function CostReportTab() {
  const [month, setMonth] = useState(istMonth);
  const reports = useCostReports(month);
  const generate = useGenerateReports();
  const data = reports.data;
  const allFrozen = Boolean(data?.items.length) && data!.items.every((r) => r.status !== 'DRAFT');

  const run = async () => {
    try {
      const result = await generate.mutateAsync(month);
      toast.success(
        `${result.items.length} report${result.items.length === 1 ? '' : 's'} ready for ${monthName(month)}`,
      );
    } catch (err) {
      toast.error(message(err, 'Could not generate'));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Monthly cost per salesman</CardTitle>
              <CardDescription>
                Salary + approved TA, DA and expenses + incentives − deductions. Regenerating
                updates drafts only; final and paid reports are frozen.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="month"
                aria-label="Month"
                className="w-44"
                max={istMonth()}
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
              <Button onClick={() => void run()} disabled={generate.isPending || allFrozen}>
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {data?.items.length ? 'Regenerate drafts' : 'Generate'}
              </Button>
              {data?.items.length ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    void downloadFile('/reports/monthly-cost/export.xlsx', { month }).catch((err) =>
                      toast.error(message(err, 'Could not export')),
                    )
                  }
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {reports.isPending ? <LoadingState /> : null}
          {reports.isError ? <ErrorState onRetry={() => void reports.refetch()} /> : null}
          {data && data.items.length === 0 ? (
            <EmptyState
              message={`No report for ${monthName(month)} yet. Generate it to see each salesman's cost.`}
            />
          ) : null}
          {data && data.items.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salesman</TableHead>
                    <TableHead className="text-right">Salary</TableHead>
                    <TableHead className="text-right">TA/DA & expenses</TableHead>
                    <TableHead className="text-right">Incentives</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Cost/sales</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((r) => (
                    <ReportRow key={r.id} r={r} />
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(data.totals.salary)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(data.totals.expenses)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(data.totals.incentives)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(data.totals.deductions)
                        ? `- ${formatINR(data.totals.deductions)}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(data.totals.grandTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(data.totals.orderValue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(data.totals.orderValue)
                        ? pct(
                            String(Number(data.totals.grandTotal) / Number(data.totals.orderValue)),
                          )
                        : '-'}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Incentives month={month} />
    </div>
  );
}

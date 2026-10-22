'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  ExpenseStatus,
  Role,
  type ExpenseCategory,
  type ExpenseItem,
  type WorkDayQueueItem,
} from '@juma/shared';
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
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatINR, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSalesmenOptions } from '@/features/leads/api';
import { DAY_TYPE_LABELS, formatMinutes } from '@/features/field/labels';
import {
  useBulkApprove,
  useExpenses,
  useReviewExpense,
  useReviewWorkDay,
  useWorkDayQueue,
} from '@/features/expenses/api';
import {
  BillThumbs,
  CATEGORY_LABELS,
  ExpenseStatusPill,
  FlagPills,
  MODE_LABELS,
  STATUS_LABELS,
} from '@/features/expenses/components';

const ALL = 'ALL';
const thisMonth = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7);
const message = (err: unknown, fallback: string) =>
  err instanceof ApiRequestError ? err.message : fallback;

const DAY_FLAG_LABELS: Record<string, string> = {
  poorStartAccuracy: 'Weak start GPS',
  poorEndAccuracy: 'Weak end GPS',
  notEndedProperly: 'Not ended properly',
  odometerAboveGps: 'Odometer km ≫ GPS km',
  noVisits: 'No visits',
};

function ClaimActions({ claim }: { claim: ExpenseItem }) {
  const review = useReviewExpense();
  const [mode, setMode] = useState<'PARTIAL' | 'REJECT' | null>(null);
  const [amount, setAmount] = useState(claim.policyLimit ?? '');
  const [remark, setRemark] = useState('');

  const decide = async (decision: 'APPROVE' | 'PARTIAL' | 'REJECT') => {
    try {
      await review.mutateAsync({
        id: claim.id,
        input: {
          decision,
          amountApproved: decision === 'PARTIAL' ? Number(amount) : null,
          remark: remark.trim() || null,
        },
      });
      toast.success(
        `${CATEGORY_LABELS[claim.category]} for ${claim.salesman.name} ${decision === 'APPROVE' ? 'approved' : decision === 'PARTIAL' ? 'part approved' : 'rejected'}`,
      );
      setMode(null);
    } catch (err) {
      toast.error(message(err, 'Could not review the expense'));
    }
  };

  if (claim.status !== ExpenseStatus.SUBMITTED) return null;
  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={review.isPending} onClick={() => void decide('APPROVE')}>
          <Check className="h-4 w-4" />
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode('PARTIAL')}>
          Part approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => setMode('REJECT')}
        >
          <X className="h-4 w-4" />
          Reject
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center">
      {mode === 'PARTIAL' ? (
        <Input
          aria-label="Amount to approve"
          inputMode="decimal"
          className="sm:w-28"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      ) : null}
      <Input
        aria-label="Remark"
        autoFocus
        placeholder={mode === 'PARTIAL' ? 'Why less? (required)' : 'Why rejected? (required)'}
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === 'REJECT' ? 'destructive' : 'default'}
          disabled={review.isPending || !remark.trim() || (mode === 'PARTIAL' && !Number(amount))}
          onClick={() => void decide(mode)}
        >
          {review.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === 'PARTIAL' ? 'Approve part' : 'Reject'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ClaimsTab() {
  const [month, setMonth] = useState(thisMonth);
  const [status, setStatus] = useState<ExpenseStatus | 'ALL'>(ExpenseStatus.SUBMITTED);
  const [salesmanId, setSalesmanId] = useState(ALL);
  const [category, setCategory] = useState<ExpenseCategory | 'ALL'>(ALL);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: users = [] } = useSalesmenOptions();
  const salesmen = users.filter((u) => u.role === Role.SALESMAN);
  const expenses = useExpenses({
    month,
    status: status === ALL ? undefined : status,
    salesmanId: salesmanId === ALL ? undefined : salesmanId,
    category: category === ALL ? undefined : category,
    flaggedOnly,
  });
  const bulk = useBulkApprove();
  const items = useMemo(() => expenses.data?.items ?? [], [expenses.data]);
  const pending = items.filter((i) => i.status === ExpenseStatus.SUBMITTED);
  const summary = expenses.data?.summary;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // "Select clean" leaves flagged claims for a human look.
  const selectClean = () =>
    setSelected(new Set(pending.filter((i) => i.flags.length === 0).map((i) => i.id)));

  const approveSelected = async () => {
    try {
      const result = await bulk.mutateAsync({ ids: [...selected] });
      toast.success(
        `${result.approved} approved` +
          (result.skipped ? `, ${result.skipped} already reviewed by someone else` : ''),
      );
      setSelected(new Set());
    } catch (err) {
      toast.error(message(err, 'Could not approve'));
    }
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Input
            type="month"
            aria-label="Month"
            className="lg:w-44"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          <Select value={status} onValueChange={(v) => setStatus(v as ExpenseStatus | 'ALL')}>
            <SelectTrigger className="lg:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {(Object.keys(STATUS_LABELS) as ExpenseStatus[])
                .filter((s) => s !== 'DRAFT')
                .map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={salesmanId} onValueChange={setSalesmanId}>
            <SelectTrigger className="lg:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All salesmen</SelectItem>
              {salesmen.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory | 'ALL')}>
            <SelectTrigger className="lg:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary h-4 w-4"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
            />
            Flagged only
          </label>
        </div>
        {summary ? (
          <p className="text-muted-foreground text-sm">
            {formatDate(`${summary.month}-01`).slice(3)}: claimed {formatINR(summary.claimed)} ·
            approved {formatINR(summary.approved)} · pending{' '}
            <span className="text-foreground font-medium">{formatINR(summary.pending)}</span> ·
            rejected {formatINR(summary.rejected)}
          </p>
        ) : null}
        {pending.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={selectClean}>
              Select all without flags
            </Button>
            {selected.size > 0 ? (
              <>
                <Button size="sm" disabled={bulk.isPending} onClick={() => void approveSelected()}>
                  {bulk.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Approve {selected.size} selected
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {expenses.isPending ? <LoadingState /> : null}
        {expenses.isError ? <ErrorState onRetry={() => void expenses.refetch()} /> : null}
        {expenses.data && items.length === 0 ? (
          <EmptyState message="Nothing to review here." />
        ) : null}
        {items.map((claim) => {
          const over =
            claim.policyLimit !== null && Number(claim.amountClaimed) > Number(claim.policyLimit);
          return (
            <div
              key={claim.id}
              className={cn(
                'flex gap-3 rounded-md border p-3',
                claim.flags.length > 0 && 'border-red-200 bg-red-50/40',
              )}
            >
              {claim.status === ExpenseStatus.SUBMITTED ? (
                <input
                  type="checkbox"
                  aria-label={`Select ${claim.salesman.name} ${claim.category} ${claim.date}`}
                  className="accent-primary mt-1 h-4 w-4 shrink-0"
                  checked={selected.has(claim.id)}
                  onChange={() => toggle(claim.id)}
                />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {claim.salesman.name} · {CATEGORY_LABELS[claim.category]}
                      {claim.travelMode ? ` · ${MODE_LABELS[claim.travelMode]}` : ''}
                      {claim.km ? ` · ${Number(claim.km)} km` : ''}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {formatDate(claim.date)}
                      {claim.description ? ` · ${claim.description}` : ''}
                      {claim.isAutoDrafted ? ' · drafted from policy' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-lg font-semibold tabular-nums', over && 'text-red-700')}>
                      {formatINR(claim.amountClaimed, true)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {claim.policyLimit !== null
                        ? `Policy ${formatINR(claim.policyLimit, true)}`
                        : 'At actuals'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ExpenseStatusPill status={claim.status} />
                  <FlagPills flags={claim.flags} />
                  {claim.amountApproved !== null && claim.status !== 'SUBMITTED' ? (
                    <span className="text-muted-foreground text-xs">
                      approved {formatINR(claim.amountApproved, true)}
                      {claim.reviewedBy ? ` by ${claim.reviewedBy.name}` : ''}
                    </span>
                  ) : null}
                  {claim.adminRemark ? (
                    <span className="text-xs">“{claim.adminRemark}”</span>
                  ) : null}
                </div>
                <BillThumbs paths={claim.billPhotoPaths} />
                <ClaimActions claim={claim} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function WorkDayRow({ day }: { day: WorkDayQueueItem }) {
  const review = useReviewWorkDay();
  const [mode, setMode] = useState<'REJECT' | 'REOPEN' | null>(null);
  const [remark, setRemark] = useState('');

  const decide = async (decision: 'APPROVE' | 'REJECT' | 'REOPEN') => {
    try {
      await review.mutateAsync({ id: day.id, input: { decision, remark: remark.trim() || null } });
      toast.success(
        `${day.salesman.name}'s ${formatDate(day.date)} ${decision === 'APPROVE' ? 'approved' : decision === 'REJECT' ? 'rejected' : 'reopened'}`,
      );
      setMode(null);
    } catch (err) {
      toast.error(message(err, 'Could not review the day'));
    }
  };

  return (
    <div
      className={cn('space-y-3 rounded-md border p-4', day.flags.length > 0 && 'border-amber-300')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {day.salesman.name} · {formatDate(day.date)} · {DAY_TYPE_LABELS[day.dayType]}
          </p>
          <p className="text-muted-foreground text-sm">
            {formatTime(day.startAt)} – {formatTime(day.endAt)} ({formatMinutes(day.workingMinutes)}
            ) · {day.visits} visits · orders {formatINR(day.orderValue)} · {day.totalKm ?? '-'} km
            {day.gpsKm ? ` (GPS ${day.gpsKm})` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{formatINR(day.claimed, true)}</p>
          <p className="text-muted-foreground text-xs">
            claimed · {day.pendingClaims} claim{day.pendingClaims === 1 ? '' : 's'} to review
          </p>
        </div>
      </div>
      {day.flags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {day.flags.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
            >
              <AlertTriangle className="h-3 w-3" />
              {DAY_FLAG_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      ) : null}
      {mode ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            placeholder={
              mode === 'REOPEN' ? 'What should he fix? (required)' : 'Why rejected? (required)'
            }
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === 'REJECT' ? 'destructive' : 'default'}
              disabled={!remark.trim() || review.isPending}
              onClick={() => void decide(mode)}
            >
              {mode === 'REOPEN' ? 'Reopen' : 'Reject'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={review.isPending} onClick={() => void decide('APPROVE')}>
            <Check className="h-4 w-4" />
            Approve day
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode('REOPEN')}>
            Reopen for changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setMode('REJECT')}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function WorkDaysTab() {
  const queue = useWorkDayQueue();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Submitted work days</CardTitle>
        <CardDescription>
          Oldest first. Approving a day does not approve its claims; review those on the Claims tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {queue.isPending ? <LoadingState /> : null}
        {queue.isError ? <ErrorState onRetry={() => void queue.refetch()} /> : null}
        {queue.data?.length === 0 ? <EmptyState message="No days waiting for review." /> : null}
        {queue.data?.map((day) => (
          <WorkDayRow key={day.id} day={day} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function ExpensesPage() {
  const [tab, setTab] = useState<'claims' | 'days'>('claims');
  const queue = useWorkDayQueue();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses & approvals</h1>
        <p className="text-muted-foreground text-sm">
          Claims are checked against the allowance policy in force on their date; anything above it
          is flagged.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant={tab === 'claims' ? 'default' : 'outline'} onClick={() => setTab('claims')}>
          Claims
        </Button>
        <Button variant={tab === 'days' ? 'default' : 'outline'} onClick={() => setTab('days')}>
          Work days{queue.data?.length ? ` (${queue.data.length})` : ''}
        </Button>
      </div>
      {tab === 'claims' ? <ClaimsTab /> : <WorkDaysTab />}
    </div>
  );
}

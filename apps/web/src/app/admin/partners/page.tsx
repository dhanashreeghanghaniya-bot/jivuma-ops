'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PartnerStatus } from '@juma/shared';
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
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatINR, formatNumber, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useDistricts } from '@/features/geo/api';
import {
  useDistributors,
  useRetailers,
  useSuperStockists,
  useUnverifiedRetailerCount,
  useVerifyRetailer,
  type PartnerFilters,
} from '@/features/partners/api';
import { DistributorDialog } from '@/features/partners/distributor-dialog';
import { RetailerDialog } from '@/features/partners/retailer-dialog';
import { SuperStockistDialog } from '@/features/partners/super-stockist-dialog';

type Tab = 'super-stockists' | 'distributors' | 'retailers' | 'to-verify';

const TABS: { id: Tab; label: string }[] = [
  { id: 'super-stockists', label: 'Super stockists' },
  { id: 'distributors', label: 'Distributors' },
  { id: 'retailers', label: 'Retailers' },
  { id: 'to-verify', label: 'To verify' },
];

const ALL = 'ALL';

function StatusBadge({ status }: { status: PartnerStatus }) {
  const variant =
    status === PartnerStatus.ACTIVE
      ? 'success'
      : status === PartnerStatus.ON_HOLD
        ? 'warning'
        : 'secondary';
  return <Badge variant={variant}>{status.replace('_', ' ')}</Badge>;
}

function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function PartnersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = (searchParams.get('level') as Tab | null) ?? 'super-stockists';
  // Set by the dashboard's district panel ("View all partners in …").
  const districtFromUrl = searchParams.get('districtId') ?? ALL;

  const [search, setSearch] = useState('');
  const [districtId, setDistrictId] = useState(districtFromUrl);
  const [status, setStatus] = useState<PartnerStatus | 'ALL'>(ALL);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Tab | null>(null);

  const debouncedSearch = useDebouncedValue(search);
  const districtsQuery = useDistricts();
  const verifyRetailer = useVerifyRetailer();

  const filters = useMemo<PartnerFilters>(
    () => ({
      page,
      search: debouncedSearch.trim() || undefined,
      districtId: districtId === ALL ? undefined : districtId,
      status,
      ...(tab === 'to-verify' ? { isVerified: 'false' as const } : {}),
    }),
    [page, debouncedSearch, districtId, status, tab],
  );

  // Only the visible tab fetches; the others stay idle until selected.
  const superStockists = useSuperStockists(filters, tab === 'super-stockists');
  const distributors = useDistributors(filters, tab === 'distributors');
  const retailers = useRetailers(filters, tab === 'retailers' || tab === 'to-verify');
  const pendingCount = useUnverifiedRetailerCount();

  const activeQuery =
    tab === 'super-stockists' ? superStockists : tab === 'distributors' ? distributors : retailers;

  const changeTab = (next: Tab) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set('level', next);
    router.replace(`/admin/partners?${params.toString()}`);
  };

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const verify = async (id: string, shopName: string) => {
    try {
      await verifyRetailer.mutateAsync(id);
      toast.success(`${shopName} verified`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not verify the shop');
    }
  };

  const totalPages = Number(activeQuery.data?.meta?.totalPages ?? 1);
  const isRetailerTab = tab === 'retailers' || tab === 'to-verify';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Channel partners</h1>
          <p className="text-sm text-muted-foreground">
            Super stockists supply distributors, who supply retailers.
          </p>
        </div>
        {tab !== 'to-verify' ? (
          <Button onClick={() => setDialog(tab)}>
            <Plus className="h-4 w-4" />
            Add {tab === 'super-stockists' ? 'super stockist' : tab === 'distributors' ? 'distributor' : 'shop'}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 border-b" role="tablist">
        {TABS.map((item) => {
          const isActive = item.id === tab;
          const badgeCount = item.id === 'to-verify' ? (pendingCount.data ?? 0) : 0;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => changeTab(item.id)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
              {badgeCount ? (
                <Badge variant="warning" className="px-2 py-0">
                  {badgeCount}
                </Badge>
              ) : null}
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-base">
            {TABS.find((item) => item.id === tab)?.label}
          </CardTitle>
          <CardDescription>
            {tab === 'to-verify'
              ? 'Shops added by salesmen in the field, waiting for your approval.'
              : `${formatNumber(activeQuery.data?.meta?.total ?? 0)} on record.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => resetPage(setSearch)(e.target.value)}
                placeholder="Search firm, owner or mobile"
                className="pl-9"
              />
              {activeQuery.isFetching && !activeQuery.isPending ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            <Select value={districtId} onValueChange={resetPage(setDistrictId)}>
              <SelectTrigger className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All districts</SelectItem>
                {(districtsQuery.data ?? []).map((district) => (
                  <SelectItem key={district.id} value={district.id}>
                    {district.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!isRetailerTab ? (
              <Select
                value={status}
                onValueChange={resetPage(setStatus) as (value: string) => void}
              >
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value={PartnerStatus.ACTIVE}>Active</SelectItem>
                  <SelectItem value={PartnerStatus.ON_HOLD}>On hold</SelectItem>
                  <SelectItem value={PartnerStatus.INACTIVE}>Inactive</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {activeQuery.isPending ? <LoadingState /> : null}

          {activeQuery.isError ? (
            <ErrorState
              message={
                activeQuery.error instanceof ApiRequestError ? activeQuery.error.message : undefined
              }
              onRetry={() => void activeQuery.refetch()}
            />
          ) : null}

          {tab === 'super-stockists' && superStockists.data ? (
            superStockists.data.items.length === 0 ? (
              <EmptyState message="No super stockists match these filters." />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firm</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Town</TableHead>
                      <TableHead>Districts</TableHead>
                      <TableHead className="text-right">Distributors</TableHead>
                      <TableHead>Last order</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {superStockists.data.items.map((ss) => (
                      <TableRow key={ss.id}>
                        <TableCell>
                          <Link
                            href={`/admin/partners/super-stockists/${ss.id}`}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {ss.firmName}
                          </Link>
                          <p className="text-xs text-muted-foreground">{ss.ownerName}</p>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatPhone(ss.phone)}</TableCell>
                        <TableCell className="text-muted-foreground">{ss.town.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {ss.coveredDistricts.length
                            ? ss.coveredDistricts.map((d) => d.code).join(', ')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ss.counts.distributors}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {ss.lastOrderAt ? formatDate(ss.lastOrderAt) : '-'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={ss.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}

          {tab === 'distributors' && distributors.data ? (
            distributors.data.items.length === 0 ? (
              <EmptyState message="No distributors match these filters." />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firm</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Town</TableHead>
                      <TableHead>Super stockist</TableHead>
                      <TableHead className="text-right">Retailers</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {distributors.data.items.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Link
                            href={`/admin/partners/distributors/${d.id}`}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {d.firmName}
                          </Link>
                          <p className="text-xs text-muted-foreground">{d.ownerName}</p>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatPhone(d.phone)}</TableCell>
                        <TableCell className="text-muted-foreground">{d.town.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.superStockist.firmName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.counts.retailers}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.creditLimit ? `${formatINR(d.creditLimit)} / ${d.creditDays ?? 0}d` : '-'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}

          {isRetailerTab && retailers.data ? (
            retailers.data.items.length === 0 ? (
              <EmptyState
                message={
                  tab === 'to-verify'
                    ? 'Nothing waiting. Every shop has been verified.'
                    : 'No shops match these filters.'
                }
              />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shop</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Town</TableHead>
                      <TableHead>Distributor</TableHead>
                      {tab === 'to-verify' ? <TableHead>Added by</TableHead> : null}
                      <TableHead>{tab === 'to-verify' ? 'Added on' : 'Last order'}</TableHead>
                      <TableHead className="text-right">
                        {tab === 'to-verify' ? 'Action' : 'Status'}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retailers.data.items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link
                            href={`/admin/partners/retailers/${r.id}`}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {r.shopName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {r.ownerName} &middot; {r.category}
                          </p>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatPhone(r.phone)}</TableCell>
                        <TableCell className="text-muted-foreground">{r.town.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.distributor.firmName}
                        </TableCell>
                        {tab === 'to-verify' ? (
                          <TableCell className="text-muted-foreground">
                            {r.addedBySalesman?.name ?? '-'}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-muted-foreground">
                          {tab === 'to-verify'
                            ? formatDate(r.createdAt)
                            : r.lastOrderAt
                              ? formatDate(r.lastOrderAt)
                              : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.isVerified ? (
                            <Badge variant="success">Verified</Badge>
                          ) : (
                            <Button
                              size="sm"
                              disabled={verifyRetailer.isPending}
                              onClick={() => void verify(r.id, r.shopName)}
                            >
                              <BadgeCheck className="h-4 w-4" />
                              Verify
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}

          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>

      <SuperStockistDialog
        open={dialog === 'super-stockists'}
        onOpenChange={(open) => setDialog(open ? 'super-stockists' : null)}
        editing={null}
      />
      <DistributorDialog
        open={dialog === 'distributors'}
        onOpenChange={(open) => setDialog(open ? 'distributors' : null)}
        editing={null}
      />
      <RetailerDialog
        open={dialog === 'retailers'}
        onOpenChange={(open) => setDialog(open ? 'retailers' : null)}
        editing={null}
      />
    </div>
  );
}

export default function PartnersPage() {
  // `useSearchParams` needs a Suspense boundary to keep the route statically shell-rendered.
  return (
    <Suspense fallback={<LoadingState />}>
      <PartnersContent />
    </Suspense>
  );
}

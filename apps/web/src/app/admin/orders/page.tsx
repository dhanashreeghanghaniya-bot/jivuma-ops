'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, MapPin, Plus, Search } from 'lucide-react';
import { OrderLevel, OrderStatus, Role } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useDistricts } from '@/features/geo/api';
import { useSalesmenOptions } from '@/features/leads/api';
import { useOrders, type OrderFilters } from '@/features/orders/api';
import { LEVEL_LABELS, STATUS_LABELS, StatusPill } from '@/features/orders/labels';
import { NewOrderDialog } from '@/features/orders/order-dialog';

const ALL = 'ALL';

export default function OrdersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<OrderLevel | 'ALL'>(ALL);
  const [status, setStatus] = useState<OrderStatus | 'ALL'>(ALL);
  const [districtId, setDistrictId] = useState(ALL);
  const [salesmanId, setSalesmanId] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const debouncedSearch = useDebouncedValue(search);
  const { data: districts = [] } = useDistricts();
  const { data: users = [] } = useSalesmenOptions();
  const salesmen = users.filter((u) => u.role === Role.SALESMAN);

  const filters = useMemo<OrderFilters>(
    () => ({
      page,
      search: debouncedSearch.trim() || undefined,
      level: level === ALL ? undefined : level,
      status: status === ALL ? undefined : status,
      districtId: districtId === ALL ? undefined : districtId,
      takenBySalesmanId: salesmanId === ALL ? undefined : salesmanId,
      from: from || undefined,
      to: to || undefined,
    }),
    [page, debouncedSearch, level, status, districtId, salesmanId, from, to],
  );
  const orders = useOrders(filters);
  const meta = orders.data?.meta;

  /** Any filter change goes back to page 1. */
  const filter =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-muted-foreground text-sm">
            Every order down the chain: company to super stockist, to distributor, to shop.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New order
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([ALL, ...Object.keys(LEVEL_LABELS)] as (OrderLevel | 'ALL')[]).map((l) => (
          <Button
            key={l}
            size="sm"
            variant={level === l ? 'default' : 'outline'}
            aria-pressed={level === l}
            onClick={() => filter(setLevel)(l)}
          >
            {l === ALL ? 'All levels' : LEVEL_LABELS[l]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => filter(setSearch)(e.target.value)}
                placeholder="Order number, e.g. JF-2610-0042"
                className="pl-9"
              />
              {orders.isFetching && !orders.isPending ? (
                <Loader2 className="text-muted-foreground absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" />
              ) : null}
            </div>
            <Select value={status} onValueChange={filter(setStatus) as (v: string) => void}>
              <SelectTrigger className="lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={districtId} onValueChange={filter(setDistrictId)}>
              <SelectTrigger className="lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All districts</SelectItem>
                {districts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={salesmanId} onValueChange={filter(setSalesmanId)}>
              <SelectTrigger className="lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any salesman</SelectItem>
                {salesmen.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              From
              <Input
                type="date"
                className="w-40"
                value={from}
                max={to || undefined}
                onChange={(e) => filter(setFrom)(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2">
              To
              <Input
                type="date"
                className="w-40"
                value={to}
                min={from || undefined}
                onChange={(e) => filter(setTo)(e.target.value)}
              />
            </label>
            {meta ? (
              <p className="text-muted-foreground ml-auto">
                {formatNumber(meta.total)} orders ·{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {formatINR(meta.totalValue)}
                </span>{' '}
                excluding cancelled
              </p>
            ) : null}
          </div>
        </CardHeader>

        <CardContent>
          {orders.isPending ? <LoadingState /> : null}
          {orders.isError ? (
            <ErrorState
              message={orders.error instanceof ApiRequestError ? orders.error.message : undefined}
              onRetry={() => void orders.refetch()}
            />
          ) : null}
          {orders.data && orders.data.items.length === 0 ? (
            <EmptyState message="No orders match these filters." />
          ) : null}

          {orders.data && orders.data.items.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>From → To</TableHead>
                      <TableHead>District</TableHead>
                      <TableHead>Taken by</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.data.items.map((o) => (
                      <TableRow
                        key={o.id}
                        className={cn('cursor-pointer', o.status === 'CANCELLED' && 'opacity-60')}
                        onClick={() => router.push(`/admin/orders/${o.id}`)}
                      >
                        <TableCell>
                          <Link
                            href={`/admin/orders/${o.id}`}
                            prefetch={false}
                            className="font-medium tabular-nums hover:underline"
                          >
                            {o.orderNumber}
                          </Link>
                          <p className="text-muted-foreground text-xs">
                            {formatDate(o.orderDate)} · {LEVEL_LABELS[o.level]}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{o.to.name}</p>
                          <p className="text-muted-foreground text-xs">from {o.from.name}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {o.to.district?.name ?? '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {o.takenBy ? (
                            <span className="inline-flex items-center gap-1">
                              {o.fromVisit ? <MapPin className="h-3.5 w-3.5" /> : null}
                              {o.takenBy.name}
                            </span>
                          ) : (
                            'Admin'
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusPill status={o.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(o.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {meta && meta.totalPages > 1 ? (
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    Page {page} of {meta.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= meta.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <NewOrderDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

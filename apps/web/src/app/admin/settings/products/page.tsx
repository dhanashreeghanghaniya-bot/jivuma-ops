'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { ProductItem } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useProducts } from '@/features/orders/api';
import { ProductDialog } from '@/features/orders/product-dialog';

/** Margin a tier keeps over the one it buys from, as a share of its selling price. */
const margin = (buy: string, sell: string) => {
  const s = Number(sell);
  return s > 0 ? `${Math.round(((s - Number(buy)) / s) * 100)}%` : '-';
};

export default function ProductSettingsPage() {
  const products = useProducts(true);
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm">
            SKUs, pack sizes and the four price tiers used across the chain.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Add product
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price list</CardTitle>
          <CardDescription>
            Per unit. Each level buys at its own tier: super stockists at the SS price, distributors
            at the distributor price, shops at the retailer price.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {products.isPending ? <LoadingState /> : null}
          {products.isError ? <ErrorState onRetry={() => void products.refetch()} /> : null}
          {products.data?.length === 0 ? <EmptyState message="No products yet." /> : null}
          {products.data && products.data.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">SS</TableHead>
                    <TableHead className="text-right">Distributor</TableHead>
                    <TableHead className="text-right">Retailer</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.data.map((p) => (
                    <TableRow key={p.id} className={cn(!p.isActive && 'opacity-60')}>
                      <TableCell>
                        <p className="flex items-center gap-2 font-medium">
                          {p.name}
                          {!p.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {p.sku} · {p.category} · {p.packSize} · {p.unitsPerCase}/case
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(p.ssPrice, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(p.distributorPrice, true)}
                        <p className="text-muted-foreground text-xs">
                          SS keeps {margin(p.ssPrice, p.distributorPrice)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(p.retailerPrice, true)}
                        <p className="text-muted-foreground text-xs">
                          Dist. keeps {margin(p.distributorPrice, p.retailerPrice)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(p.mrp, true)}
                        <p className="text-muted-foreground text-xs">
                          Shop keeps {margin(p.retailerPrice, p.mrp)}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {formatNumber(p.orderCount)} lines
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => setEditing(p)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProductDialog open={creating} onOpenChange={setCreating} editing={null} />
      <ProductDialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        editing={editing}
      />
    </div>
  );
}

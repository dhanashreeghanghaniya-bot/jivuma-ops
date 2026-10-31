'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Search, Store } from 'lucide-react';
import { toast } from 'sonner';
import type { FieldRetailer } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/format';
import { useAddBeatStop } from './api';

interface AddShopToRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beatId: string;
  beatName: string;
  currentRetailerIds: Set<string>;
  retailers: FieldRetailer[];
  towns: Map<string, { id: string; name: string }>;
}

export function AddShopToRouteDialog({
  open,
  onOpenChange,
  beatId,
  beatName,
  currentRetailerIds,
  retailers,
  towns,
}: AddShopToRouteDialogProps) {
  const [search, setSearch] = useState('');
  const addStop = useAddBeatStop(beatId);
  const [addingId, setAddingId] = useState<string | null>(null);

  const availableShops = useMemo(() => {
    const term = search.trim().toLowerCase();
    return retailers
      .filter((r) => !currentRetailerIds.has(r.id))
      .filter(
        (r) =>
          !term ||
          r.shopName.toLowerCase().includes(term) ||
          r.ownerName.toLowerCase().includes(term) ||
          (towns.get(r.townId)?.name.toLowerCase().includes(term) ?? false),
      );
  }, [retailers, currentRetailerIds, search, towns]);

  const handleAdd = async (r: FieldRetailer) => {
    setAddingId(r.id);
    try {
      await addStop.mutateAsync(r.id);
      toast.success(`${r.shopName} added to ${beatName}`);
      onOpenChange(false);
      setSearch('');
    } catch {
      toast.error('Could not add shop to route');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base">Add shop to {beatName}</DialogTitle>
          <DialogDescription className="text-xs">
            Pick a shop from your territory to add to this route for today and future visits.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-2.5 h-4 w-4" />
            <Input
              placeholder="Search shop, owner or town..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto px-4 pb-4">
          {availableShops.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Store className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {search.trim() ? 'No matching shops found.' : 'All territory shops are already on this route.'}
            </div>
          ) : (
            availableShops.map((r) => {
              const town = towns.get(r.townId);
              const history = r.callHistory;
              const isAdding = addingId === r.id;

              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.shopName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.ownerName} · {town?.name ?? '-'}
                    </p>
                    {history ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        {history.isProductive ? (
                          <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                            Productive
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            No order
                          </Badge>
                        )}
                        {history.lastOrderAmount ? (
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            Last order: {formatINR(history.lastOrderAmount)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Not visited yet</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1 text-xs"
                    disabled={isAdding}
                    onClick={() => void handleAdd(r)}
                  >
                    {isAdding ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Add
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

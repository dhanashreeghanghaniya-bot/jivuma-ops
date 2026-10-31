'use client';

import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FieldRetailer } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useCreateBeat } from './api';

interface CreateBeatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retailers: FieldRetailer[];
}

export function CreateBeatDialog({ open, onOpenChange, retailers }: CreateBeatDialogProps) {
  const t = useT();
  const createBeat = useCreateBeat();
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const byId = useMemo(() => new Map(retailers.map((r) => [r.id, r])), [retailers]);
  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return retailers.filter(
      (r) =>
        !selectedIds.includes(r.id) &&
        (!term ||
          r.shopName.toLowerCase().includes(term) ||
          r.ownerName.toLowerCase().includes(term)),
    );
  }, [retailers, selectedIds, search]);

  const save = async () => {
    if (name.trim().length < 2 || selectedIds.length === 0) {
      toast.error(t('beat.needName'));
      return;
    }
    try {
      await createBeat.mutateAsync({
        name: name.trim(),
        dayOfWeek: day ? Number(day) : null,
        retailerIds: selectedIds,
      });
      toast.success(t('beat.saved'));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : t('beat.failed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] space-y-3 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t('beat.create')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="beat-name">{t('beat.name')}</Label>
          <Input id="beat-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="beat-day">{t('beat.day')}</Label>
          <select
            id="beat-day"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
          >
            <option value="">{t('beat.anyDay')}</option>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {/* 2024-01-01 was a Monday. */}
                {new Date(2024, 0, d).toLocaleDateString(undefined, { weekday: 'long' })}
              </option>
            ))}
          </select>
        </div>

        {selectedIds.length > 0 ? (
          <div className="space-y-1.5">
            <Label>{t('beat.selected')}</Label>
            {selectedIds.map((id, i) => (
              <div key={id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <span className="text-muted-foreground w-5 text-xs">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{byId.get(id)?.shopName}</span>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => setSelectedIds((ids) => ids.filter((x) => x !== id))}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <Input
            placeholder={t('beat.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {available.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">{t('beat.noShops')}</p>
            ) : (
              available.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedIds((ids) => [...ids, r.id])}
                  className="hover:bg-muted/50 block min-h-11 w-full rounded-md border px-3 py-1.5 text-left text-sm"
                >
                  <span className="block truncate">{r.shopName}</span>
                  <span className="text-muted-foreground block truncate text-xs">{r.ownerName}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <Button className="min-h-12 w-full" disabled={createBeat.isPending} onClick={save}>
          {createBeat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('beat.save')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

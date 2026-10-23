'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RetailerListItem, SalesmanProfile } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiRequestError, api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useDistricts } from '@/features/geo/api';
import { useTowns } from '@/features/users/api';
import { WEEKDAYS, useRetireBeat, useSaveBeat, useSaveTerritory } from './api';

const message = (err: unknown, fallback: string) =>
  err instanceof ApiRequestError ? err.message : fallback;

function TerritoryCard({ profile }: { profile: SalesmanProfile }) {
  const { data: districts = [] } = useDistricts();
  const { data: towns = [] } = useTowns();
  const save = useSaveTerritory(profile.id);
  const [districtIds, setDistrictIds] = useState<Set<string>>(new Set());
  const [townIds, setTownIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDistrictIds(new Set(profile.territory.districts.map((d) => d.id)));
    setTownIds(new Set(profile.territory.towns.map((t) => t.id)));
  }, [profile]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };
  // Towns already inside a chosen district need no separate entry.
  const extraTowns = towns.filter((t) => !districtIds.has(t.district.id));

  const submit = async () => {
    try {
      await save.mutateAsync({
        districtIds: [...districtIds],
        townIds: [...townIds].filter((id) => extraTowns.some((t) => t.id === id)),
      });
      toast.success('Territory saved. His app picks it up on its next refresh.');
      setEditing(false);
    } catch (err) {
      toast.error(message(err, 'Could not save the territory'));
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Territory</CardTitle>
          <CardDescription>
            He sees and works shops, distributors and leads in these districts and towns only.
          </CardDescription>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            {profile.territory.districts.map((d) => (
              <Badge key={d.id} variant="secondary">
                {d.name} district
              </Badge>
            ))}
            {profile.territory.towns.map((t) => (
              <Badge key={t.id} variant="outline">
                {t.name} ({t.districtName})
              </Badge>
            ))}
            {profile.territory.districts.length + profile.territory.towns.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No territory yet: his app will show no shops.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <Label>Whole districts</Label>
            <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-3 lg:grid-cols-4">
              {districts.map((d) => (
                <label
                  key={d.id}
                  className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-primary h-4 w-4"
                    checked={districtIds.has(d.id)}
                    onChange={() => toggle(districtIds, setDistrictIds, d.id)}
                  />
                  {d.name}
                </label>
              ))}
            </div>
            <Label>Extra towns outside those districts</Label>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-3">
              {extraTowns.map((t) => (
                <label
                  key={t.id}
                  className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-primary h-4 w-4"
                    checked={townIds.has(t.id)}
                    onChange={() => toggle(townIds, setTownIds, t.id)}
                  />
                  {t.name} <span className="text-muted-foreground text-xs">{t.district.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void submit()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save territory
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type Draft = {
  beatId?: string;
  name: string;
  dayOfWeek: string;
  stops: { id: string; label: string }[];
};

function BeatEditor({
  profile,
  draft,
  onClose,
}: {
  profile: SalesmanProfile;
  draft: Draft;
  onClose: () => void;
}) {
  const save = useSaveBeat(profile.id);
  const { data: towns = [] } = useTowns();
  const [name, setName] = useState(draft.name);
  const [dayOfWeek, setDayOfWeek] = useState(draft.dayOfWeek);
  const [stops, setStops] = useState(draft.stops);
  const [search, setSearch] = useState('');

  // Shops he may visit: towns in his districts plus his extra towns.
  const allowedTowns = useMemo(() => {
    const districtIds = new Set(profile.territory.districts.map((d) => d.id));
    return new Set([
      ...towns.filter((t) => districtIds.has(t.district.id)).map((t) => t.id),
      ...profile.territory.towns.map((t) => t.id),
    ]);
  }, [profile, towns]);
  const shops = useQuery({
    queryKey: ['retailers', 'beat-picker', search],
    queryFn: async () =>
      (
        await api.get<RetailerListItem[]>('/retailers', {
          query: { limit: 100, search: search.trim() || undefined },
        })
      ).data ?? [],
  });
  const candidates = (shops.data ?? []).filter(
    (r) => allowedTowns.has(r.town.id) && !stops.some((s) => s.id === r.id),
  );

  const move = (i: number, by: number) => {
    const next = [...stops];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    setStops(next);
  };

  const submit = async () => {
    try {
      await save.mutateAsync({
        beatId: draft.beatId,
        input: {
          name,
          dayOfWeek: dayOfWeek === 'none' ? null : Number(dayOfWeek),
          retailerIds: stops.map((s) => s.id),
        },
      });
      toast.success(`Beat "${name}" saved`);
      onClose();
    } catch (err) {
      toast.error(message(err, 'Could not save the beat'));
    }
  };

  return (
    <div className="bg-muted/20 space-y-3 rounded-md border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="beat-name">Beat name</Label>
          <Input
            id="beat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gondal - Jetpur"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Day</Label>
          <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Any day (ad hoc)</SelectItem>
              {WEEKDAYS.map((d, i) => (
                <SelectItem key={d} value={String(i + 1)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label>Stops, in visiting order</Label>
          {stops.length === 0 ? (
            <p className="text-muted-foreground text-sm">Add shops from the list.</p>
          ) : null}
          <ol className="space-y-1">
            {stops.map((s, i) => (
              <li
                key={s.id}
                className="bg-background flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
              >
                <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
                <span className="flex-1 truncate">{s.label}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Move down"
                  disabled={i === stops.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Remove stop"
                  onClick={() => setStops(stops.filter((x) => x.id !== s.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-2">
          <Label htmlFor="beat-search">Shops in his territory</Label>
          <Input
            id="beat-search"
            placeholder="Search shops"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {candidates.map((r) => (
              <button
                key={r.id}
                type="button"
                className="bg-background hover:bg-muted flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm"
                onClick={() =>
                  setStops([...stops, { id: r.id, label: `${r.shopName}, ${r.town.name}` }])
                }
              >
                <span className="truncate">
                  {r.shopName} <span className="text-muted-foreground">· {r.town.name}</span>
                </span>
                <Plus className="h-4 w-4 shrink-0" />
              </button>
            ))}
            {shops.data && candidates.length === 0 ? (
              <p className="text-muted-foreground text-sm">No more shops match.</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => void submit()}
          disabled={save.isPending || name.trim().length < 2 || stops.length === 0}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save beat
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function BeatsCard({ profile }: { profile: SalesmanProfile }) {
  const retire = useRetireBeat(profile.id);
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Beats</CardTitle>
          <CardDescription>
            Planned routes. The beat for the weekday is suggested when he starts his day.
          </CardDescription>
        </div>
        {!draft ? (
          <Button size="sm" onClick={() => setDraft({ name: '', dayOfWeek: 'none', stops: [] })}>
            <Plus className="h-4 w-4" />
            New beat
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {draft ? (
          <BeatEditor profile={profile} draft={draft} onClose={() => setDraft(null)} />
        ) : null}
        {profile.beats.map((b) => (
          <div key={b.id} className={cn('rounded-md border p-3', !b.isActive && 'opacity-60')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {b.name}{' '}
                <span className="text-muted-foreground text-sm font-normal">
                  · {b.dayOfWeek ? WEEKDAYS[b.dayOfWeek - 1] : 'any day'} · {b.stops.length} stops
                </span>
                {!b.isActive ? (
                  <Badge variant="secondary" className="ml-2">
                    Retired
                  </Badge>
                ) : null}
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      beatId: b.id,
                      name: b.name,
                      dayOfWeek: b.dayOfWeek ? String(b.dayOfWeek) : 'none',
                      stops: b.stops.flatMap((s) =>
                        s.retailer
                          ? [
                              {
                                id: s.retailer.id,
                                label: `${s.retailer.shopName}, ${s.retailer.townName}`,
                              },
                            ]
                          : [],
                      ),
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                  {b.isActive ? 'Edit' : 'Edit & restore'}
                </Button>
                {b.isActive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() =>
                      void retire.mutateAsync(b.id).then(
                        () => toast.success(`${b.name} retired`),
                        (err) => toast.error(message(err, 'Could not retire the beat')),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    Retire
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {b.stops.map((s, i) => `${i + 1}. ${s.retailer?.shopName ?? '?'}`).join('  ·  ')}
            </p>
          </div>
        ))}
        {profile.beats.length === 0 && !draft ? (
          <p className="text-muted-foreground text-sm">No beats yet.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TerritoryAndBeats({ profile }: { profile: SalesmanProfile }) {
  return (
    <div className="space-y-6">
      <TerritoryCard profile={profile} />
      <BeatsCard profile={profile} />
    </div>
  );
}

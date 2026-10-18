'use client';

import { useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CoverageStatus, Zone, type DistrictListItem, type TownListItem } from '@juma/shared';
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
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { COVERAGE_STYLES } from '@/features/map/map-config';
import { useDeleteTown, useDistricts, useTownsList } from '@/features/geo/api';
import { DistrictDialog } from '@/features/geo/district-dialog';
import { TownDialog } from '@/features/geo/town-dialog';

const ALL = 'ALL';

const ZONE_LABELS: Record<Zone, string> = {
  SAURASHTRA: 'Saurashtra',
  KUTCH: 'Kutch',
  NORTH_GUJARAT: 'North Gujarat',
  CENTRAL_GUJARAT: 'Central Gujarat',
  SOUTH_GUJARAT: 'South Gujarat',
};

function DistrictsCard() {
  const { data: districts = [], isPending, isError, error, refetch } = useDistricts();
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState<Zone | 'ALL'>(ALL);
  const [coverage, setCoverage] = useState<CoverageStatus | 'ALL'>(ALL);
  const [editing, setEditing] = useState<DistrictListItem | null>(null);

  // 33 rows of reference data, so filtering in memory beats a round trip.
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return districts.filter((d) => {
      if (zone !== ALL && d.zone !== zone) return false;
      if (coverage !== ALL && d.coverageStatus !== coverage) return false;
      if (!needle) return true;
      return (
        d.name.toLowerCase().includes(needle) ||
        d.code.toLowerCase().includes(needle) ||
        d.nameGu.includes(needle)
      );
    });
  }, [districts, search, zone, coverage]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Districts</CardTitle>
        <CardDescription>
          All 33 Gujarat districts are seeded. Coverage status is computed from partners and leads.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search district or code"
              className="pl-9"
            />
          </div>

          <Select value={zone} onValueChange={(v) => setZone(v as Zone | 'ALL')}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All zones</SelectItem>
              {(Object.keys(ZONE_LABELS) as Zone[]).map((z) => (
                <SelectItem key={z} value={z}>
                  {ZONE_LABELS[z]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={coverage} onValueChange={(v) => setCoverage(v as CoverageStatus | 'ALL')}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All coverage</SelectItem>
              {(Object.keys(COVERAGE_STYLES) as CoverageStatus[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {COVERAGE_STYLES[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isPending ? <LoadingState /> : null}
        {isError ? (
          <ErrorState
            message={error instanceof ApiRequestError ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : null}

        {!isPending && filtered.length === 0 ? (
          <EmptyState message="No districts match these filters." />
        ) : null}

        {filtered.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>District</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-right">Towns</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead className="w-16 text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((district) => (
                  <TableRow key={district.id}>
                    <TableCell>
                      <p className="font-medium">{district.name}</p>
                      <p className="text-xs text-muted-foreground" lang="gu">
                        {district.nameGu}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{district.code}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ZONE_LABELS[district.zone]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{district.townCount}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-xs font-medium',
                          COVERAGE_STYLES[district.coverageStatus].swatch,
                        )}
                      >
                        {COVERAGE_STYLES[district.coverageStatus].label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(district)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit {district.name}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>

      <DistrictDialog district={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function TownsCard() {
  const { data: districts = [] } = useDistricts();
  const [search, setSearch] = useState('');
  const [districtId, setDistrictId] = useState(ALL);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TownListItem | null>(null);

  const debouncedSearch = useDebouncedValue(search);
  const deleteTown = useDeleteTown();

  const { data, isPending, isFetching, isError, error, refetch } = useTownsList({
    page,
    search: debouncedSearch.trim() || undefined,
    districtId,
  });

  const towns = data?.items ?? [];
  const totalPages = Number(data?.meta?.totalPages ?? 1);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (town: TownListItem) => {
    setEditing(town);
    setDialogOpen(true);
  };

  const remove = async (town: TownListItem) => {
    if (!window.confirm(`Remove ${town.name}? This cannot be undone from the UI.`)) return;
    try {
      await deleteTown.mutateAsync(town.id);
      toast.success(`${town.name} removed`);
    } catch (err) {
      // The API refuses when partners, leads or staff are attached.
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not remove the town');
    }
  };

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Towns</CardTitle>
          <CardDescription>
            {formatNumber(data?.meta?.total ?? 0)} towns across Gujarat. Shops and leads sit in
            towns, not districts.
          </CardDescription>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add town
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search town"
              className="pl-9"
            />
            {isFetching && !isPending ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <Select
            value={districtId}
            onValueChange={(value) => {
              setDistrictId(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All districts</SelectItem>
              {districts.map((district) => (
                <SelectItem key={district.id} value={district.id}>
                  {district.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isPending ? <LoadingState /> : null}
        {isError ? (
          <ErrorState
            message={error instanceof ApiRequestError ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : null}

        {!isPending && !isError && towns.length === 0 ? (
          <EmptyState
            message="No towns match these filters."
            action={
              <Button variant="outline" onClick={openCreate}>
                Add the first one
              </Button>
            }
          />
        ) : null}

        {towns.length > 0 ? (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Town</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Population</TableHead>
                    <TableHead className="text-right">Shops</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {towns.map((town) => (
                    <TableRow key={town.id}>
                      <TableCell className="font-medium">{town.name}</TableCell>
                      <TableCell className="text-muted-foreground">{town.district.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{town.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {town.population ? formatNumber(town.population) : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {town.counts.retailers}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {town.counts.openLeads}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(town)}>
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit {town.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleteTown.isPending}
                          onClick={() => void remove(town)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                          <span className="sr-only">Remove {town.name}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
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
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>

      <TownDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </Card>
  );
}

export default function GeographySettingsPage() {
  return (
    <div className="space-y-6">
      <DistrictsCard />
      <TownsCard />
    </div>
  );
}

'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, MapPin } from 'lucide-react';
import type { CoverageKpis } from '@juma/shared';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/data-states';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDistrictsMap, useMapMarkers } from '@/features/geo/api';
import { DistrictGrid } from '@/features/map/district-grid';
import { DistrictPanel } from '@/features/map/district-panel';
import {
  COVERAGE_ORDER,
  COVERAGE_STYLES,
  GOOGLE_MAPS_API_KEY,
  LAYER_ORDER,
  LAYER_STYLES,
  type MarkerLayer,
} from '@/features/map/map-config';

// Google Maps touches `window` during module init, so it must never be in the
// server bundle (SPEC 1: "Render maps client-side only").
const GujaratMap = dynamic(
  () => import('@/features/map/gujarat-map').then((m) => m.GujaratMap),
  { ssr: false, loading: () => <LoadingState label="Loading map" /> },
);

const DEFAULT_LAYERS: Record<MarkerLayer, boolean> = {
  superStockists: true,
  distributors: true,
  retailers: true,
  leads: true,
};

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function KpiStrip({ kpis }: { kpis: CoverageKpis | undefined }) {
  if (!kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Districts covered"
        value={`${kpis.districtsCovered} / ${kpis.districtsTotal}`}
        hint="At least one active distributor"
      />
      <KpiCard
        label="Active partners"
        value={formatNumber(kpis.activeDistributors)}
        hint={`${formatNumber(kpis.activeRetailers)} retailers`}
      />
      <KpiCard
        label="Orders this month"
        value={formatNumber(kpis.ordersThisPeriod)}
        hint={formatINR(kpis.orderValueThisPeriod)}
      />
      <KpiCard
        label="Open leads"
        value={formatNumber(kpis.openLeads)}
        hint={`${formatNumber(kpis.salesmenInFieldToday)} salesmen in field today`}
      />
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [visibleLayers, setVisibleLayers] = useState(DEFAULT_LAYERS);
  const [boundariesMissing, setBoundariesMissing] = useState(false);

  const districtsQuery = useDistrictsMap();
  const anyLayerVisible = LAYER_ORDER.some((layer) => visibleLayers[layer]);
  const markersQuery = useMapMarkers(anyLayerVisible);

  const districts = useMemo(() => districtsQuery.data?.districts ?? [], [districtsQuery.data]);
  const selectedDistrictId = districts.find((d) => d.code === selectedCode)?.id ?? null;

  const toggleLayer = (layer: MarkerLayer) =>
    setVisibleLayers((current) => ({ ...current, [layer]: !current[layer] }));

  const handleGeoJsonMissing = useCallback(() => setBoundariesMissing(true), []);

  const hasMapKey = GOOGLE_MAPS_API_KEY.length > 0;
  const markerCounts = markersQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          Gujarat coverage at a glance. Click a district for partners, leads and towns.
        </p>
      </div>

      <KpiStrip kpis={districtsQuery.data?.kpis} />

      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {COVERAGE_ORDER.map((status) => (
              <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: COVERAGE_STYLES[status].fill }}
                />
                {COVERAGE_STYLES[status].label}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {LAYER_ORDER.map((layer) => {
              const isOn = visibleLayers[layer];
              const count = markerCounts?.[layer].length;
              return (
                <button
                  key={layer}
                  type="button"
                  onClick={() => toggleLayer(layer)}
                  aria-pressed={isOn}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isOn ? 'bg-muted' : 'text-muted-foreground opacity-60',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('h-2.5 w-2.5 rounded-full', LAYER_STYLES[layer].swatch)}
                  />
                  {LAYER_STYLES[layer].label}
                  {count === undefined ? null : (
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {districtsQuery.isError ? (
            <ErrorState
              message={
                districtsQuery.error instanceof ApiRequestError
                  ? districtsQuery.error.message
                  : undefined
              }
              onRetry={() => void districtsQuery.refetch()}
            />
          ) : null}

          {districtsQuery.isPending ? <LoadingState label="Loading coverage" /> : null}

          {districts.length > 0 ? (
            <div className="h-[32rem] w-full lg:h-[38rem]">
              {hasMapKey ? (
                <GujaratMap
                  districts={districts}
                  markers={markersQuery.data}
                  visibleLayers={visibleLayers}
                  selectedDistrictCode={selectedCode}
                  onSelectDistrict={setSelectedCode}
                  onGeoJsonMissing={handleGeoJsonMissing}
                />
              ) : (
                <DistrictGrid
                  districts={districts}
                  selectedDistrictCode={selectedCode}
                  onSelectDistrict={setSelectedCode}
                />
              )}
            </div>
          ) : null}
        </CardContent>

        {!hasMapKey || boundariesMissing ? (
          <div className="flex items-start gap-2 border-t bg-amber-50 px-5 py-3 text-xs text-amber-900">
            {hasMapKey ? (
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>
              {hasMapKey ? (
                <>
                  District boundaries are not loaded, so each district is drawn as a circle
                  instead. Add <code>gujarat-districts.geojson</code> to{' '}
                  <code>apps/web/public/geo/</code> for the full choropleth.
                </>
              ) : (
                <>
                  Showing the district grid because no Google Maps key is configured. Set{' '}
                  <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> and{' '}
                  <code>NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID</code> in <code>apps/web/.env.local</code> to
                  switch to the live map.
                </>
              )}
            </p>
          </div>
        ) : null}
      </Card>

      <DistrictPanel
        districtId={selectedDistrictId}
        period={{}}
        onClose={() => setSelectedCode(null)}
      />
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  // Aliased so it does not shadow the global `Map` constructor used below.
  Map as GoogleMap,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { CoverageStatus, DistrictMapItem, MapMarker, MapMarkersResponse } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { formatPhone, telHref, whatsAppHref } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  COVERAGE_STYLES,
  GEOJSON_URL,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  GUJARAT_BOUNDS,
  GUJARAT_CENTER,
  GUJARAT_ZOOM,
  LAYER_ORDER,
  LAYER_STYLES,
  type MarkerLayer,
} from './map-config';

interface GujaratMapProps {
  districts: DistrictMapItem[];
  markers: MapMarkersResponse | undefined;
  visibleLayers: Record<MarkerLayer, boolean>;
  selectedDistrictCode: string | null;
  onSelectDistrict: (code: string) => void;
  /** Told when the boundary file is missing so the page can explain the fallback. */
  onGeoJsonMissing?: () => void;
}

/**
 * Paints the district boundaries onto the map's data layer. Kept separate from
 * the markers so a failed boundary fetch degrades to pins only.
 */
function DistrictChoropleth({
  districts,
  selectedDistrictCode,
  onSelectDistrict,
  onGeoJsonMissing,
}: Pick<
  GujaratMapProps,
  'districts' | 'selectedDistrictCode' | 'onSelectDistrict' | 'onGeoJsonMissing'
>) {
  const map = useMap();
  const [loaded, setLoaded] = useState(false);

  // Read through refs inside the style callback so restyling never re-adds the
  // GeoJSON, which would stack duplicate features on every render.
  const statusByCode = useMemo(() => {
    const index = new Map<string, CoverageStatus>();
    for (const district of districts) index.set(district.code.toUpperCase(), district.coverageStatus);
    return index;
  }, [districts]);

  const statusRef = useRef(statusByCode);
  statusRef.current = statusByCode;
  const selectedRef = useRef(selectedDistrictCode);
  selectedRef.current = selectedDistrictCode;

  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(GEOJSON_URL);
        if (!response.ok) throw new Error(`GeoJSON ${response.status}`);
        const geojson = (await response.json()) as object;
        if (cancelled) return;

        map.data.addGeoJson(geojson);
        setLoaded(true);
      } catch {
        if (!cancelled) onGeoJsonMissing?.();
      }
    })();

    return () => {
      cancelled = true;
      map.data.forEach((feature) => map.data.remove(feature));
    };
  }, [map, onGeoJsonMissing]);

  useEffect(() => {
    if (!map || !loaded) return;

    map.data.setStyle((feature) => {
      const code = String(feature.getProperty('code') ?? '').toUpperCase();
      const status = statusRef.current.get(code) ?? 'UNTOUCHED';
      const style = COVERAGE_STYLES[status];
      const isSelected = selectedRef.current?.toUpperCase() === code;

      return {
        fillColor: style.fill,
        fillOpacity: isSelected ? 0.85 : 0.55,
        strokeColor: isSelected ? '#0f172a' : style.stroke,
        strokeWeight: isSelected ? 2.5 : 1,
        cursor: 'pointer',
      };
    });

    const onClick = map.data.addListener('click', (event: google.maps.Data.MouseEvent) => {
      const code = String(event.feature.getProperty('code') ?? '');
      if (code) onSelectDistrict(code);
    });
    const onOver = map.data.addListener('mouseover', (event: google.maps.Data.MouseEvent) => {
      map.data.overrideStyle(event.feature, { fillOpacity: 0.8 });
    });
    const onOut = map.data.addListener('mouseout', () => map.data.revertStyle());

    return () => {
      onClick.remove();
      onOver.remove();
      onOut.remove();
    };
  }, [map, loaded, selectedDistrictCode, districts, onSelectDistrict]);

  return null;
}

/**
 * Boundary-free fallback: one coloured circle per district, sized by how much
 * business sits in it, so the dashboard still works without the GeoJSON file.
 */
function DistrictCircles({
  districts,
  selectedDistrictCode,
  onSelectDistrict,
}: Pick<GujaratMapProps, 'districts' | 'selectedDistrictCode' | 'onSelectDistrict'>) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const circles = districts.map((district) => {
      const style = COVERAGE_STYLES[district.coverageStatus];
      const weight =
        district.counts.distributors * 3 + district.counts.superStockists * 2 + district.counts.openLeads;
      const isSelected = district.code === selectedDistrictCode;

      const circle = new google.maps.Circle({
        map,
        center: { lat: district.lat, lng: district.lng },
        radius: 12_000 + Math.min(weight, 20) * 1_600,
        fillColor: style.fill,
        fillOpacity: isSelected ? 0.85 : 0.55,
        strokeColor: isSelected ? '#0f172a' : style.stroke,
        strokeWeight: isSelected ? 2.5 : 1,
        clickable: true,
      });
      circle.addListener('click', () => onSelectDistrict(district.code));
      return circle;
    });

    return () => circles.forEach((circle) => circle.setMap(null));
  }, [map, districts, selectedDistrictCode, onSelectDistrict]);

  return null;
}

/** Retailers are the densest layer, so they go through the clusterer (SPEC 4.1). */
function ClusteredRetailers({
  markers,
  onSelect,
}: {
  markers: MapMarker[];
  onSelect: (marker: MapMarker, layer: MarkerLayer) => void;
}) {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const [nodes, setNodes] = useState<Record<string, google.maps.marker.AdvancedMarkerElement>>({});

  useEffect(() => {
    if (!map) return;
    clusterer.current ??= new MarkerClusterer({ map });
    return () => {
      clusterer.current?.clearMarkers();
      clusterer.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!clusterer.current) return;
    clusterer.current.clearMarkers();
    clusterer.current.addMarkers(Object.values(nodes));
  }, [nodes]);

  const setNodeRef = useCallback(
    (id: string) => (node: google.maps.marker.AdvancedMarkerElement | null) => {
      setNodes((current) => {
        if (node) {
          if (current[id] === node) return current;
          return { ...current, [id]: node };
        }
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    [],
  );

  const style = LAYER_STYLES.retailers;

  return (
    <>
      {markers.map((marker) => (
        <AdvancedMarker
          key={marker.id}
          ref={setNodeRef(marker.id)}
          position={{ lat: marker.lat, lng: marker.lng }}
          title={marker.name}
          onClick={() => onSelect(marker, 'retailers')}
        >
          <Pin
            background={style.background}
            borderColor={style.border}
            glyphColor={style.glyph}
            scale={0.8}
          />
        </AdvancedMarker>
      ))}
    </>
  );
}

function MarkerLayers({
  markers,
  visibleLayers,
  onSelect,
}: {
  markers: MapMarkersResponse | undefined;
  visibleLayers: Record<MarkerLayer, boolean>;
  onSelect: (marker: MapMarker, layer: MarkerLayer) => void;
}) {
  if (!markers) return null;

  return (
    <>
      {LAYER_ORDER.filter((layer) => layer !== 'retailers' && visibleLayers[layer]).map((layer) => {
        const style = LAYER_STYLES[layer];
        return markers[layer].map((marker) => (
          <AdvancedMarker
            key={`${layer}-${marker.id}`}
            position={{ lat: marker.lat, lng: marker.lng }}
            title={marker.name}
            onClick={() => onSelect(marker, layer)}
          >
            <Pin
              background={style.background}
              borderColor={style.border}
              glyphColor={style.glyph}
              scale={layer === 'superStockists' ? 1.1 : 1}
            />
          </AdvancedMarker>
        ));
      })}

      {visibleLayers.retailers ? (
        <ClusteredRetailers markers={markers.retailers} onSelect={onSelect} />
      ) : null}
    </>
  );
}

/** Keeps the map framed on the district the side panel is showing. */
function PanToSelected({ district }: { district: DistrictMapItem | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !district) return;
    map.panTo({ lat: district.lat, lng: district.lng });
    if ((map.getZoom() ?? GUJARAT_ZOOM) < 8) map.setZoom(8);
  }, [map, district]);

  return null;
}

function MarkerInfo({
  selected,
  onClose,
}: {
  selected: { marker: MapMarker; layer: MarkerLayer } | null;
  onClose: () => void;
}) {
  if (!selected) return null;
  const { marker, layer } = selected;

  return (
    <InfoWindow position={{ lat: marker.lat, lng: marker.lng }} onCloseClick={onClose}>
      <div className="min-w-48 space-y-1 p-1 text-sm">
        <p className="font-semibold text-foreground">{marker.name}</p>
        <p className="text-xs text-muted-foreground">
          {LAYER_STYLES[layer].label} &middot; {marker.townName}
        </p>
        {marker.status ? <p className="text-xs text-muted-foreground">{marker.status}</p> : null}
        {marker.phone ? (
          <p className="flex gap-3 pt-1 text-xs">
            <a className="font-medium text-primary underline" href={telHref(marker.phone)}>
              {formatPhone(marker.phone)}
            </a>
            <a
              className="font-medium text-primary underline"
              href={whatsAppHref(marker.phone)}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </p>
        ) : null}
      </div>
    </InfoWindow>
  );
}

export function GujaratMap({
  districts,
  markers,
  visibleLayers,
  selectedDistrictCode,
  onSelectDistrict,
  onGeoJsonMissing,
}: GujaratMapProps) {
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [boundariesMissing, setBoundariesMissing] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<{
    marker: MapMarker;
    layer: MarkerLayer;
  } | null>(null);

  const selectedDistrict = districts.find((d) => d.code === selectedDistrictCode);

  const handleSelectMarker = useCallback(
    (marker: MapMarker, layer: MarkerLayer) => setSelectedMarker({ marker, layer }),
    [],
  );

  const handleGeoJsonMissing = useCallback(() => {
    setBoundariesMissing(true);
    onGeoJsonMissing?.();
  }, [onGeoJsonMissing]);

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker']}>
      <div className="relative h-full w-full">
        <GoogleMap
          mapId={GOOGLE_MAPS_MAP_ID || undefined}
          defaultCenter={GUJARAT_CENTER}
          defaultZoom={GUJARAT_ZOOM}
          mapTypeId={mapTypeId}
          minZoom={6}
          // strictBounds off so the user can still pan slightly past the border.
          restriction={{ latLngBounds: GUJARAT_BOUNDS, strictBounds: false }}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          clickableIcons={false}
          className="h-full w-full"
        >
          <DistrictChoropleth
            districts={districts}
            selectedDistrictCode={selectedDistrictCode}
            onSelectDistrict={onSelectDistrict}
            onGeoJsonMissing={handleGeoJsonMissing}
          />
          {boundariesMissing ? (
            <DistrictCircles
              districts={districts}
              selectedDistrictCode={selectedDistrictCode}
              onSelectDistrict={onSelectDistrict}
            />
          ) : null}
          <MarkerLayers
            markers={markers}
            visibleLayers={visibleLayers}
            onSelect={handleSelectMarker}
          />
          <PanToSelected district={selectedDistrict} />
          <MarkerInfo selected={selectedMarker} onClose={() => setSelectedMarker(null)} />
        </GoogleMap>

        <div className="absolute left-3 top-3 flex overflow-hidden rounded-md border bg-background shadow-sm">
          {(['roadmap', 'hybrid'] as const).map((type) => (
            <Button
              key={type}
              variant="ghost"
              size="sm"
              aria-pressed={mapTypeId === type}
              className={cn(
                'rounded-none',
                mapTypeId === type && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
              onClick={() => setMapTypeId(type)}
            >
              {type === 'roadmap' ? 'Map' : 'Satellite'}
            </Button>
          ))}
        </div>
      </div>
    </APIProvider>
  );
}

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GOOGLE_MAPS_API_KEY } from './map-config';

const DraggablePinMap = dynamic(
  () => import('./draggable-pin-map').then((m) => m.DraggablePinMap),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-md bg-muted" /> },
);

export interface LatLng {
  lat: number | null;
  lng: number | null;
}

/**
 * Pin placement for partner forms. Falls back to plain coordinate inputs when no
 * Google key is configured, which also stays useful as a precise-entry escape
 * hatch for anyone typing coordinates off a GPS reading.
 */
export function LocationPicker({
  value,
  onChange,
  /** Centre used before a pin exists, normally the selected town. */
  fallbackCenter,
  error,
}: {
  value: LatLng;
  onChange: (next: LatLng) => void;
  fallbackCenter?: { lat: number; lng: number };
  error?: string;
}) {
  const [locating, setLocating] = useState(false);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Location</Label>
        <Button type="button" variant="ghost" size="sm" onClick={useMyLocation} disabled={locating}>
          <Crosshair className="h-3.5 w-3.5" />
          {locating ? 'Locating…' : 'Use my location'}
        </Button>
      </div>

      {GOOGLE_MAPS_API_KEY ? (
        <DraggablePinMap value={value} onChange={onChange} fallbackCenter={fallbackCenter} />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="pin-lat" className="text-xs text-muted-foreground">
            Latitude
          </Label>
          <Input
            id="pin-lat"
            inputMode="decimal"
            value={value.lat ?? ''}
            placeholder="22.3039"
            onChange={(e) =>
              onChange({ ...value, lat: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pin-lng" className="text-xs text-muted-foreground">
            Longitude
          </Label>
          <Input
            id="pin-lng"
            inputMode="decimal"
            value={value.lng ?? ''}
            placeholder="70.8022"
            onChange={(e) =>
              onChange({ ...value, lng: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {GOOGLE_MAPS_API_KEY ? (
        <p className="text-xs text-muted-foreground">Drag the pin or tap the map to adjust.</p>
      ) : null}
    </div>
  );
}

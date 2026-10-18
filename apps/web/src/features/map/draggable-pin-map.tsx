'use client';

import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  GUJARAT_BOUNDS,
  GUJARAT_CENTER,
  LAYER_STYLES,
} from './map-config';
import type { LatLng } from './location-picker';

const round6 = (n: number) => Number(n.toFixed(6));

/** Small single-pin map; loaded only when a Google key is present. */
export function DraggablePinMap({
  value,
  onChange,
  fallbackCenter,
}: {
  value: LatLng;
  onChange: (next: LatLng) => void;
  fallbackCenter?: { lat: number; lng: number };
}) {
  const pin =
    value.lat !== null && value.lng !== null ? { lat: value.lat, lng: value.lng } : null;
  const center = pin ?? fallbackCenter ?? GUJARAT_CENTER;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker']}>
      <div className="h-56 overflow-hidden rounded-md border">
        <GoogleMap
          mapId={GOOGLE_MAPS_MAP_ID || undefined}
          center={center}
          defaultZoom={pin ? 15 : 9}
          restriction={{ latLngBounds: GUJARAT_BOUNDS, strictBounds: false }}
          gestureHandling="cooperative"
          disableDefaultUI
          zoomControl
          className="h-full w-full"
          onClick={(event) => {
            const latLng = event.detail.latLng;
            if (latLng) onChange({ lat: round6(latLng.lat), lng: round6(latLng.lng) });
          }}
        >
          {pin ? (
            <AdvancedMarker
              position={pin}
              draggable
              onDragEnd={(event) => {
                // Drag events carry a LatLng object, unlike map clicks which
                // carry a plain literal.
                const { latLng } = event;
                if (latLng) onChange({ lat: round6(latLng.lat()), lng: round6(latLng.lng()) });
              }}
            >
              <Pin
                background={LAYER_STYLES.retailers.background}
                borderColor={LAYER_STYLES.retailers.border}
                glyphColor={LAYER_STYLES.retailers.glyph}
              />
            </AdvancedMarker>
          ) : null}
        </GoogleMap>
      </div>
    </APIProvider>
  );
}

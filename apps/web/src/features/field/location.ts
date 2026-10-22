import { GPS_ACCURACY_LIMIT_M, type GpsFix } from '@juma/shared';

export type LocationFailure = 'denied' | 'unavailable' | 'unsupported';

export class LocationError extends Error {
  constructor(readonly reason: LocationFailure) {
    super(reason);
    this.name = 'LocationError';
  }
}

function readOnce(highAccuracy: boolean): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: highAccuracy,
      timeout: 15_000,
      maximumAge: 0,
    }),
  );
}

const toFix = (p: GeolocationPosition): GpsFix => ({
  lat: Number(p.coords.latitude.toFixed(6)),
  lng: Number(p.coords.longitude.toFixed(6)),
  accuracyM: Math.round(p.coords.accuracy),
  capturedAt: new Date(p.timestamp || Date.now()).toISOString(),
});

/**
 * SPEC 5.1: high accuracy, 15 s timeout, up to 3 tries while accuracy is worse
 * than 200 m. A poor fix is still returned after the last try (`poor: true`) so
 * the day can start; the server flags it from the stored accuracy.
 */
export async function getFix(
  options: { attempts?: number } = {},
): Promise<{ fix: GpsFix; poor: boolean }> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new LocationError('unsupported');
  }
  const attempts = options.attempts ?? 3;
  let best: GpsFix | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const fix = toFix(await readOnce(true));
      if (!best || fix.accuracyM < best.accuracyM) best = fix;
      if (fix.accuracyM <= GPS_ACCURACY_LIMIT_M) return { fix, poor: false };
    } catch (err) {
      const code = (err as GeolocationPositionError).code;
      if (code === 1) throw new LocationError('denied');
      // Timeout or no signal: try again, then give up with what we have.
    }
  }

  if (best) return { fix: best, poor: true };
  throw new LocationError('unavailable');
}

/** Best-effort fix for background pings: never prompts a retry loop. */
export async function getQuickFix(): Promise<GpsFix | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return null;
  try {
    return toFix(await readOnce(true));
  } catch {
    return null;
  }
}

export const navigateHref = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export const formatDistance = (meters: number) =>
  meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;

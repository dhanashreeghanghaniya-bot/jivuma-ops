export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Length of a path through points already in time order, in km. Hops shorter
 * than `jitterMeters` are dropped: a phone standing still reports a cloud of
 * fixes a few metres apart, and summing them would invent distance.
 */
export function pathKm(points: LatLng[], jitterMeters = 50): number {
  let meters = 0;
  let last: LatLng | undefined;
  for (const point of points) {
    if (!last) {
      last = point;
      continue;
    }
    const hop = haversineMeters(last, point);
    if (hop >= jitterMeters) {
      meters += hop;
      last = point;
    }
  }
  return Math.round(meters / 10) / 100;
}

/**
 * "Near Gondal (2.4 km)" from the nearest known town. Stands in for reverse
 * geocoding, which would mean calling Google from the server (SPEC 8 forbids
 * that with the browser key) and paying per lookup.
 */
export function nearestPlaceLabel(
  point: LatLng,
  towns: { name: string; lat: number | null; lng: number | null }[],
): string | null {
  let best: { name: string; meters: number } | null = null;
  for (const town of towns) {
    if (town.lat === null || town.lng === null) continue;
    const meters = haversineMeters(point, { lat: town.lat, lng: town.lng });
    if (!best || meters < best.meters) best = { name: town.name, meters };
  }
  if (!best) return null;
  if (best.meters < 1500) return best.name;
  return `Near ${best.name} (${(best.meters / 1000).toFixed(1)} km)`;
}

/**
 * Device clocks drift and can be set wrong on purpose. Accept a device time for
 * when something happened (it may have been queued offline), but never one in
 * the future beyond a small skew allowance.
 */
export function clampDeviceTime(deviceIso: string, serverNow: Date = new Date()): Date {
  const device = new Date(deviceIso);
  const skewMs = 5 * 60 * 1000;
  if (Number.isNaN(device.getTime()) || device.getTime() > serverNow.getTime() + skewMs) {
    return serverNow;
  }
  return device;
}

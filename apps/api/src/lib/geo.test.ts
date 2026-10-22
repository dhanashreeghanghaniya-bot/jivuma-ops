import { describe, expect, it } from 'vitest';
import { clampDeviceTime, haversineMeters, nearestPlaceLabel, pathKm } from './geo';

const rajkot = { lat: 22.3039, lng: 70.8022 };
const gondal = { lat: 21.9612, lng: 70.7939 };

describe('haversineMeters', () => {
  it('measures Rajkot to Gondal at about 38 km', () => {
    expect(haversineMeters(rajkot, gondal) / 1000).toBeCloseTo(38.2, 0);
  });

  it('is zero for the same point', () => {
    expect(haversineMeters(rajkot, rajkot)).toBe(0);
  });
});

describe('pathKm', () => {
  it('sums the hops of a route', () => {
    expect(pathKm([rajkot, gondal, rajkot])).toBeCloseTo(76.4, 0);
  });

  it('ignores GPS jitter from a phone standing still', () => {
    const cloud = Array.from({ length: 30 }, (_, i) => ({
      lat: rajkot.lat + (i % 2 ? 0.0001 : -0.0001),
      lng: rajkot.lng,
    }));
    expect(pathKm(cloud)).toBe(0);
  });

  it('is zero with fewer than two points', () => {
    expect(pathKm([])).toBe(0);
    expect(pathKm([rajkot])).toBe(0);
  });
});

describe('nearestPlaceLabel', () => {
  const towns = [
    { name: 'Rajkot', ...rajkot },
    { name: 'Gondal', ...gondal },
    { name: 'Unmapped', lat: null, lng: null },
  ];

  it('names the town when standing in it', () => {
    expect(nearestPlaceLabel({ lat: 22.304, lng: 70.803 }, towns)).toBe('Rajkot');
  });

  it('says how far the nearest town is when outside one', () => {
    expect(nearestPlaceLabel({ lat: 22.0, lng: 70.8 }, towns)).toMatch(
      /^Near Gondal \(\d+\.\d km\)$/,
    );
  });

  it('returns null with no mapped towns', () => {
    expect(nearestPlaceLabel(rajkot, [{ name: 'X', lat: null, lng: null }])).toBeNull();
  });
});

describe('clampDeviceTime', () => {
  const now = new Date('2026-10-22T06:00:00.000Z');

  it('keeps a past device time, e.g. a visit queued offline', () => {
    expect(clampDeviceTime('2026-10-22T04:30:00.000Z', now).toISOString()).toBe(
      '2026-10-22T04:30:00.000Z',
    );
  });

  it('tolerates a few minutes of clock skew', () => {
    expect(clampDeviceTime('2026-10-22T06:03:00.000Z', now).toISOString()).toBe(
      '2026-10-22T06:03:00.000Z',
    );
  });

  it('replaces a time in the future with the server time', () => {
    expect(clampDeviceTime('2026-10-23T06:00:00.000Z', now)).toBe(now);
  });

  it('replaces garbage with the server time', () => {
    expect(clampDeviceTime('not a date', now)).toBe(now);
  });
});

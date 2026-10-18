import type { CoverageStatus } from '@juma/shared';

/** Gujarat viewport, per SPEC 1. */
export const GUJARAT_CENTER = { lat: 22.5, lng: 71.5 };
export const GUJARAT_ZOOM = 7;
export const GUJARAT_BOUNDS = { south: 20.0, west: 68.0, north: 24.8, east: 74.6 };

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
export const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '';
export const GEOJSON_URL = '/geo/gujarat-districts.geojson';

interface CoverageStyle {
  label: string;
  /** Fill for the choropleth and the fallback grid. */
  fill: string;
  stroke: string;
  /** Tailwind classes for legend swatches and badges. */
  swatch: string;
}

export const COVERAGE_STYLES: Record<CoverageStatus, CoverageStyle> = {
  COVERED: {
    label: 'Covered',
    fill: '#1a6b4f',
    stroke: '#114534',
    swatch: 'bg-[#1a6b4f] text-white',
  },
  SS_ONLY: {
    label: 'SS only',
    fill: '#4e8fd6',
    stroke: '#2f6aa8',
    swatch: 'bg-[#4e8fd6] text-white',
  },
  LEADS_ONLY: {
    label: 'Leads only',
    fill: '#e0a33a',
    stroke: '#b07d1f',
    swatch: 'bg-[#e0a33a] text-black',
  },
  UNTOUCHED: {
    label: 'Untouched',
    fill: '#cbd2d9',
    stroke: '#9aa5b1',
    swatch: 'bg-[#cbd2d9] text-black',
  },
};

export const COVERAGE_ORDER: CoverageStatus[] = [
  'COVERED',
  'SS_ONLY',
  'LEADS_ONLY',
  'UNTOUCHED',
];

export type MarkerLayer = 'superStockists' | 'distributors' | 'retailers' | 'leads';

interface LayerStyle {
  label: string;
  /** Advanced Marker pin colours. */
  background: string;
  border: string;
  glyph: string;
  swatch: string;
}

export const LAYER_STYLES: Record<MarkerLayer, LayerStyle> = {
  superStockists: {
    label: 'Super stockists',
    background: '#6d28d9',
    border: '#4c1d95',
    glyph: '#ffffff',
    swatch: 'bg-[#6d28d9]',
  },
  distributors: {
    label: 'Distributors',
    background: '#1a6b4f',
    border: '#114534',
    glyph: '#ffffff',
    swatch: 'bg-[#1a6b4f]',
  },
  retailers: {
    label: 'Retailers',
    background: '#2563eb',
    border: '#1d4ed8',
    glyph: '#ffffff',
    swatch: 'bg-[#2563eb]',
  },
  leads: {
    label: 'Open leads',
    background: '#e0a33a',
    border: '#b07d1f',
    glyph: '#1f2933',
    swatch: 'bg-[#e0a33a]',
  },
};

export const LAYER_ORDER: MarkerLayer[] = [
  'superStockists',
  'distributors',
  'retailers',
  'leads',
];

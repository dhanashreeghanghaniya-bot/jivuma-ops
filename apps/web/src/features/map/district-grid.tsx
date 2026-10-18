'use client';

import type { DistrictMapItem } from '@juma/shared';
import { cn } from '@/lib/utils';
import { COVERAGE_STYLES } from './map-config';

/**
 * Stand-in for the Google Map when no browser API key is configured. It is a
 * real working view of the same data — every district is clickable and opens
 * the same side panel — so coverage can be reviewed before Google Cloud is set
 * up, and so the dashboard is never a dead screen.
 */
export function DistrictGrid({
  districts,
  selectedDistrictCode,
  onSelectDistrict,
}: {
  districts: DistrictMapItem[];
  selectedDistrictCode: string | null;
  onSelectDistrict: (code: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {districts.map((district) => {
          const style = COVERAGE_STYLES[district.coverageStatus];
          const isSelected = district.code === selectedDistrictCode;

          return (
            <button
              key={district.id}
              type="button"
              onClick={() => onSelectDistrict(district.code)}
              aria-pressed={isSelected}
              className={cn(
                'rounded-md border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected ? 'border-foreground shadow-sm' : 'border-transparent hover:shadow-sm',
              )}
              style={{ backgroundColor: style.fill }}
            >
              <span
                className={cn(
                  'block truncate text-sm font-semibold',
                  district.coverageStatus === 'COVERED' || district.coverageStatus === 'SS_ONLY'
                    ? 'text-white'
                    : 'text-black',
                )}
              >
                {district.name}
              </span>
              <span
                className={cn(
                  'block text-xs',
                  district.coverageStatus === 'COVERED' || district.coverageStatus === 'SS_ONLY'
                    ? 'text-white/80'
                    : 'text-black/70',
                )}
              >
                {district.counts.distributors} dist &middot; {district.counts.retailers} shops
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

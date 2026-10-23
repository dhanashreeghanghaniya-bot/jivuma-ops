'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { TrackPoint } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const W = 640;
const H = 420;
const PAD = 28;

/**
 * Projects lat/lng into the box. Equirectangular with the longitude scaled by
 * cos(latitude), which is accurate to a few percent across a day's travel in
 * Gujarat, and keeps the aspect so distances look like distances.
 */
function project(points: TrackPoint[]) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = lngs.map((l) => l * k);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  // A minimum span stops a day spent in one street from blowing up to the full box.
  const span = Math.max(maxX - minX, maxY - minY, 0.01);
  const scale = Math.min((W - PAD * 2) / span, (H - PAD * 2) / span);
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;
  return points.map((p, i) => ({
    x: offX + (xs[i]! - minX) * scale,
    y: H - (offY + (p.lat - minY) * scale),
  }));
}

const MARKER_FILL: Partial<Record<TrackPoint['source'], string>> = {
  START: '#16a34a',
  END: '#dc2626',
  VISIT: '#1a6b4f',
};

/**
 * SPEC 4.5 day replay: the route through pings, visits and orders in time
 * order, numbered markers, and a slider to play the day back. Drawn as SVG so
 * it works without the Google Maps key; "Open in Maps" links show any point
 * on the real map.
 */
export function RouteReplay({
  track,
  highlight,
  onHighlight,
}: {
  track: TrackPoint[];
  highlight: number | null;
  onHighlight: (index: number) => void;
}) {
  const xy = useMemo(() => (track.length ? project(track) : []), [track]);
  const [cursor, setCursor] = useState(track.length - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number>();

  useEffect(() => setCursor(track.length - 1), [track.length]);
  useEffect(() => {
    if (highlight !== null) setCursor(highlight);
  }, [highlight]);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setCursor((c) => {
        if (c >= track.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 250);
    return () => window.clearInterval(timer.current);
  }, [playing, track.length]);

  if (track.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        No positions recorded for this day.
      </p>
    );
  }

  const travelled = xy.slice(0, cursor + 1);
  const here = track[cursor]!;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-md border bg-[#f4f7f5]"
        role="img"
        aria-label="Route of the day"
      >
        <polyline
          points={xy.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#cbd5d1"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
        <polyline
          points={travelled.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#1a6b4f"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {track.map((p, i) =>
          p.label === null ? null : (
            <g
              key={i}
              transform={`translate(${xy[i]!.x},${xy[i]!.y})`}
              className="cursor-pointer"
              onClick={() => onHighlight(i)}
              opacity={i <= cursor ? 1 : 0.35}
            >
              <circle
                r={11}
                fill={MARKER_FILL[p.source] ?? '#1a6b4f'}
                stroke="#fff"
                strokeWidth={2}
              />
              <text textAnchor="middle" dy="0.35em" fontSize={11} fontWeight={700} fill="#fff">
                {p.label}
              </text>
            </g>
          ),
        )}
        <circle
          cx={xy[cursor]!.x}
          cy={xy[cursor]!.y}
          r={6}
          fill="#f59e0b"
          stroke="#fff"
          strokeWidth={2}
        />
      </svg>

      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="outline"
          aria-label={playing ? 'Pause' : 'Play the day'}
          onClick={() => {
            if (!playing && cursor >= track.length - 1) setCursor(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <input
          type="range"
          aria-label="Time of day"
          min={0}
          max={track.length - 1}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            setCursor(Number(e.target.value));
          }}
          className="accent-primary flex-1"
        />
        <span className="w-24 text-right text-sm tabular-nums">{formatTime(here.at)}</span>
      </div>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className={cn('inline-flex items-center gap-1')}>
          <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" /> start
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#1a6b4f]" /> visit
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" /> end
        </span>
        <span>{track.length} positions</span>
        <a
          className="text-primary underline"
          target="_blank"
          rel="noreferrer"
          href={`https://www.google.com/maps/search/?api=1&query=${here.lat},${here.lng}`}
        >
          Open this point in Google Maps
        </a>
      </p>
    </div>
  );
}

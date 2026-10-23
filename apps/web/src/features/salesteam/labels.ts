import type { CalendarKind, FieldFlagKind } from '@juma/shared';

export const FLAG_LABELS: Record<FieldFlagKind, string> = {
  FAR_CHECK_IN: 'Check-in far from shop',
  NO_VISITS: 'No visits',
  ODOMETER_ABOVE_GPS: 'Odometer ≫ GPS',
  NOT_ENDED: 'Not ended',
  TRACK_GAP: 'Location gap',
};

/** SPEC 4.5 calendar colours: worked / leave / holiday / absent / not ended properly. */
export const CALENDAR_STYLE: Record<CalendarKind, { label: string; cell: string }> = {
  WORKED: { label: 'Worked', cell: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  NOT_ENDED: { label: 'Not ended properly', cell: 'bg-red-100 text-red-900 border-red-200' },
  OPEN: { label: 'In progress', cell: 'bg-sky-100 text-sky-900 border-sky-200' },
  LEAVE: { label: 'Leave', cell: 'bg-amber-100 text-amber-900 border-amber-200' },
  HOLIDAY: { label: 'Holiday', cell: 'bg-slate-100 text-slate-600 border-slate-200' },
  ABSENT: { label: 'Absent', cell: 'bg-white text-red-700 border-red-300 border-dashed' },
  FUTURE: { label: 'Not yet', cell: 'bg-white text-muted-foreground border-transparent' },
  BEFORE_JOINING: {
    label: 'Before joining',
    cell: 'bg-muted/40 text-muted-foreground border-transparent',
  },
};

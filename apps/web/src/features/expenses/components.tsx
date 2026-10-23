'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, ImageOff } from 'lucide-react';
import type { ExpenseCategory, ExpenseFlag, ExpenseStatus, TravelMode } from '@juma/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useMarkNotifications, useNotifications, useSignedUrls } from './api';

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TA: 'Travel (TA)',
  DA: 'Daily allowance (DA)',
  LODGING: 'Lodging',
  FOOD: 'Food',
  PHONE: 'Phone',
  MISC: 'Other',
};

export const MODE_LABELS: Record<TravelMode, string> = {
  BIKE: 'Bike',
  CAR: 'Car',
  AUTO: 'Auto',
  BUS: 'Bus',
  TRAIN: 'Train',
};

export const STATUS_LABELS: Record<ExpenseStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Pending',
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Part approved',
  REJECTED: 'Rejected',
};

const STATUS_TONE: Record<ExpenseStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SUBMITTED: 'bg-sky-100 text-sky-900',
  APPROVED: 'bg-emerald-100 text-emerald-900',
  PARTIALLY_APPROVED: 'bg-amber-100 text-amber-900',
  REJECTED: 'bg-red-100 text-red-900',
};

export function ExpenseStatusPill({ status }: { status: ExpenseStatus }) {
  const t = useT();
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_TONE[status],
      )}
    >
      {t(`expStatus.${status}`)}
    </span>
  );
}

export function FlagPills({ flags }: { flags: ExpenseFlag[] }) {
  const t = useT();
  return (
    <>
      {flags.map((f) => (
        <span
          key={f}
          className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900"
        >
          {t(`expFlag.${f}`)}
        </span>
      ))}
    </>
  );
}

/** Bill photos inline (SPEC 4.6), through 5-minute signed links. Tap to open full size. */
export function BillThumbs({ paths, size = 'h-14 w-14' }: { paths: string[]; size?: string }) {
  const urls = useSignedUrls(paths);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  if (paths.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {paths.map((path) => {
        const url = urls.data?.[path];
        const missing = broken[path] || (urls.data && !url);
        return missing ? (
          <span
            key={path}
            title="This file is not in storage"
            className={cn(
              'bg-muted text-muted-foreground flex items-center justify-center rounded-md border',
              size,
            )}
          >
            <ImageOff className="h-4 w-4" />
          </span>
        ) : (
          <a
            key={path}
            href={url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={cn('overflow-hidden rounded-md border', size)}
          >
            {url ? (
              <img
                src={url}
                alt="Bill"
                className="h-full w-full object-cover"
                onError={() => setBroken((b) => ({ ...b, [path]: true }))}
              />
            ) : (
              <span className="bg-muted block h-full w-full animate-pulse" />
            )}
          </a>
        );
      })}
    </div>
  );
}

/** Header bell for both apps (SPEC 4.6: "salesman gets a notification"). */
export function NotificationBell({ align = 'end' }: { align?: 'start' | 'end' }) {
  const t = useT();
  const { data } = useNotifications();
  const mark = useMarkNotifications();
  const unread = data?.unread ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread ? t('notif.unread', { n: unread }) : t('notif.title')}
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="bg-destructive text-destructive-foreground absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{t('notif.title')}</p>
          {unread > 0 ? (
            <button
              type="button"
              className="text-primary text-xs underline"
              onClick={() => mark.mutate('all')}
            >
              {t('notif.markAll')}
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {data?.items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">{t('notif.none')}</p>
          ) : null}
          {data?.items.map((n) => {
            const body = (
              <>
                <p className={cn('text-sm', !n.readAt && 'font-medium')}>{n.title}</p>
                <p className="text-muted-foreground text-xs">{n.body}</p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {formatDateTime(n.createdAt)}
                </p>
              </>
            );
            const className = cn(
              'block border-b px-3 py-2 last:border-0 hover:bg-muted',
              !n.readAt && 'bg-primary/5',
            );
            const onClick = () => !n.readAt && mark.mutate(n.id);
            return n.link ? (
              <Link key={n.id} href={n.link} className={className} onClick={onClick}>
                {body}
              </Link>
            ) : (
              <button
                key={n.id}
                type="button"
                className={cn(className, 'w-full text-left')}
                onClick={onClick}
              >
                {body}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

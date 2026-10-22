'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarCheck, MapPin, Receipt, ShoppingCart, User } from 'lucide-react';
import { Role } from '@juma/shared';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useCurrentDay } from '@/features/field/api';
import { SyncStatus, usePingTimer } from '@/features/field/components';

const TABS: { href: string; labelKey: TranslationKey; icon: typeof CalendarCheck }[] = [
  { href: '/app', labelKey: 'nav.today', icon: CalendarCheck },
  { href: '/app/visits', labelKey: 'nav.visits', icon: MapPin },
  { href: '/app/orders', labelKey: 'nav.orders', icon: ShoppingCart },
  { href: '/app/expenses', labelKey: 'nav.expenses', icon: Receipt },
  { href: '/app/profile', labelKey: 'nav.profile', icon: User },
];

/** Background pings run for the whole field app while a day is open. */
function FieldBackground() {
  const { data } = useCurrentDay();
  usePingTimer(data?.day && !data.isStale ? data.day.id : null);
  return null;
}

export default function SalesmanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();

  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);

  return (
    <RequireRole roles={[Role.SALESMAN]}>
      {/* Constrained to a phone width so the layout matches the field device. */}
      <div className="bg-muted/20 mx-auto flex min-h-screen w-full max-w-md flex-col">
        <FieldBackground />
        <header className="bg-background sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{user?.name}</p>
            <p className="text-muted-foreground text-xs">{t('app.name')}</p>
          </div>
          <SyncStatus />
        </header>

        <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

        <nav className="bg-background fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t">
          <ul className="grid grid-cols-5">
            {TABS.map(({ href, labelKey, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    isActive(href) ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {t(labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </RequireRole>
  );
}

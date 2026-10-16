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

const TABS: { href: string; labelKey: TranslationKey; icon: typeof CalendarCheck }[] = [
  { href: '/app', labelKey: 'nav.today', icon: CalendarCheck },
  { href: '/app/visits', labelKey: 'nav.visits', icon: MapPin },
  { href: '/app/orders', labelKey: 'nav.orders', icon: ShoppingCart },
  { href: '/app/expenses', labelKey: 'nav.expenses', icon: Receipt },
  { href: '/app/profile', labelKey: 'nav.profile', icon: User },
];

export default function SalesmanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();

  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);

  return (
    <RequireRole roles={[Role.SALESMAN]}>
      {/* Constrained to a phone width so the layout matches the field device. */}
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-muted/20">
        <header className="sticky top-0 z-20 border-b bg-background px-4 py-3">
          <p className="text-sm font-semibold leading-tight">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{t('app.name')}</p>
        </header>

        <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t bg-background">
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

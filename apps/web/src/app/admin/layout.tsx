'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Target,
  Users,
} from 'lucide-react';
import { Role } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const NAV: { href: string; labelKey: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { href: '/admin', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/admin/partners', labelKey: 'nav.partners', icon: Store },
  { href: '/admin/leads', labelKey: 'nav.leads', icon: Target },
  { href: '/admin/orders', labelKey: 'nav.orders', icon: ShoppingCart },
  { href: '/admin/sales-team', labelKey: 'nav.salesTeam', icon: Users },
  { href: '/admin/expenses', labelKey: 'nav.expenses', icon: Receipt },
  { href: '/admin/reports', labelKey: 'nav.reports', icon: ClipboardList },
  { href: '/admin/settings/users', labelKey: 'nav.settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const t = useT();
  const [navOpen, setNavOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  return (
    <RequireRole roles={[Role.ADMIN, Role.MANAGER]}>
      <div className="flex min-h-screen bg-muted/30">
        {navOpen ? (
          <div
            className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-hidden
          />
        ) : null}

        <aside
          id="admin-nav"
          className={cn(
            'fixed inset-y-0 left-0 z-40 w-64 flex-col border-r bg-background transition-transform lg:static lg:flex lg:translate-x-0',
            navOpen ? 'flex translate-x-0' : 'hidden -translate-x-full',
          )}
        >
          <div className="border-b px-6 py-5">
            <p className="text-base font-semibold leading-tight">{t('app.name')}</p>
            <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {NAV.map(({ href, labelKey, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setNavOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </Link>
            ))}
          </nav>

          <div className="border-t p-3">
            <div className="px-3 pb-2">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.role}</p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              {t('auth.signOut')}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label={navOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={navOpen}
              aria-controls="admin-nav"
              onClick={() => setNavOpen((open) => !open)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-semibold">{t('app.name')}</span>
          </header>

          <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </RequireRole>
  );
}

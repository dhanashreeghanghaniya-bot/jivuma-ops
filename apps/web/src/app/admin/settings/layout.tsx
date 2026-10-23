'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/admin/settings/users', label: 'Users' },
  { href: '/admin/settings/allowance-policy', label: 'Allowance policy' },
  { href: '/admin/settings/salaries', label: 'Salaries' },
  { href: '/admin/settings/products', label: 'Products' },
  { href: '/admin/settings/geography', label: 'Districts & towns' },
  { href: '/admin/settings/import', label: 'Bulk import' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Users, policies, products and master data.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              pathname === tab.href
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}

'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { Role } from '@juma/shared';
import { homePathForRole, useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';

/**
 * Client-side guard. The API enforces the same rules, so this only keeps the
 * wrong shell from flashing on screen.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, status } = useAuth();
  const router = useRouter();
  const t = useT();

  const allowed = user ? roles.includes(user.role) : false;

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') router.replace('/login');
    else if (user && !allowed) router.replace(homePathForRole(user.role));
  }, [status, user, allowed, router]);

  if (status !== 'authenticated' || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t('auth.loading')}</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

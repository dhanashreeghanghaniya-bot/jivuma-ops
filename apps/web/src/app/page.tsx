'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { homePathForRole, useAuth } from '@/lib/auth-context';

/** Sends each role to its own shell once the session has been restored. */
export default function RootPage() {
  const { user, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    router.replace(user ? homePathForRole(user.role) : '/login');
  }, [status, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

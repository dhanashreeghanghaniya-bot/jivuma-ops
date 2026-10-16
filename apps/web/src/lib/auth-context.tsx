'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { Role, type AuthUser } from '@juma/shared';
import { bootstrapSession, loginRequest, logoutRequest, onSessionLost } from './api-client';

interface AuthValue {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (phone: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const homePathForRole = (role: Role) => (role === Role.SALESMAN ? '/app' : '/admin');

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthValue['status']>('loading');

  // The refresh token is an httpOnly cookie, so the only way to know whether a
  // session exists is to try to use it.
  useEffect(() => {
    let cancelled = false;

    void bootstrapSession().then((session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setStatus(session ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fired when a refresh fails mid-session.
  useEffect(
    () =>
      onSessionLost(() => {
        setUser(null);
        setStatus('unauthenticated');
        router.replace('/login');
      }),
    [router],
  );

  const login = useCallback(async (phone: string, password: string) => {
    const session = await loginRequest(phone, password);
    setUser(session.user);
    setStatus('authenticated');
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus('unauthenticated');
    router.replace('/login');
  }, [router]);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

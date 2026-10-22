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
import { wipeFieldData } from '@/features/field/offline/db';

interface AuthValue {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (phone: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * The last signed-in profile (id, name, role, no secrets), so a salesman who
 * opens the app with no signal lands in the field app instead of the login
 * page. The next request that reaches the server refreshes the real session.
 */
const PROFILE_KEY = 'juma.lastUser';

function rememberUser(user: AuthUser | null) {
  try {
    if (user) window.localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(PROFILE_KEY);
  } catch {
    // Storage blocked: offline start-up simply won't be available.
  }
}

function rememberedUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

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
      if (session === 'offline') {
        const remembered = rememberedUser();
        setUser(remembered);
        setStatus(remembered ? 'authenticated' : 'unauthenticated');
        return;
      }
      rememberUser(session?.user ?? null);
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
        rememberUser(null);
        setUser(null);
        setStatus('unauthenticated');
        router.replace('/login');
      }),
    [router],
  );

  const login = useCallback(async (phone: string, password: string) => {
    const session = await loginRequest(phone, password);
    rememberUser(session.user);
    setUser(session.user);
    setStatus('authenticated');
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    rememberUser(null);
    // The phone's offline copy and outbox belong to this user only.
    await wipeFieldData();
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

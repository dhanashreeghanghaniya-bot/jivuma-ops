'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, type Locale, type TranslationKey } from './dictionaries';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = 'juma.locale';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => {
      const active = dictionaries[locale] as Record<string, string | undefined>;
      return active[key] ?? dictionaries.en[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Convenience hook for the common case of only needing `t`. */
export function useT() {
  return useI18n().t;
}

export type { Locale, TranslationKey };

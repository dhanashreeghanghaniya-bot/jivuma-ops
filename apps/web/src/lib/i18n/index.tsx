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
import { dictionaries, LOCALES, type Locale, type TranslationKey } from './dictionaries';

/** Values for `{name}` placeholders in a message. */
export type MessageVars = Record<string, string | number>;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: MessageVars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = 'juma.locale';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  // Read after mount: the server render is always English, so reading storage
  // during the first render would mismatch on hydration.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && (LOCALES as readonly string[]).includes(saved)) setLocaleState(saved as Locale);
    } catch {
      // Storage blocked: stay in English.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: MessageVars) => {
      const active = dictionaries[locale] as Record<string, string | undefined>;
      const message = active[key] ?? dictionaries.en[key] ?? key;
      return vars
        ? message.replace(/\{(\w+)\}/g, (match, name: string) =>
            name in vars ? String(vars[name]) : match,
          )
        : message;
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

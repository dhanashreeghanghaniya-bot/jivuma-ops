'use client';

import { cn } from '@/lib/utils';
import { useI18n } from './index';
import { LOCALES } from './dictionaries';

/** English / ગુજરાતી toggle. Each name is shown in its own script so either reader finds it. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      className={cn('bg-muted inline-flex rounded-md p-1', className)}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => setLocale(l)}
          className={cn(
            'min-h-10 rounded px-4 text-sm font-medium transition-colors',
            locale === l ? 'bg-background shadow-sm' : 'text-muted-foreground',
          )}
        >
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  );
}

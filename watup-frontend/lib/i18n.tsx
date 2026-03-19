'use client';

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { createContext, useContext, useEffect, useState } from 'react';

export type Locale = 'en' | 'si';

export const DEFAULT_LOCALE: Locale = 'en';

// Bootstrap the i18n instance synchronously so it's never empty on first render
i18n.load(DEFAULT_LOCALE, {});
i18n.activate(DEFAULT_LOCALE);

async function loadCatalog(locale: Locale) {
  const { messages } = await import(`../locales/${locale}/messages`);
  i18n.load(locale, messages);
  i18n.activate(locale);
}

interface LocaleContextValue {
  locale: Locale;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  toggleLocale: () => {},
});

export function useLocale() {
  return useContext(LocaleContext);
}

export function LinguiProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('locale') as Locale) ?? DEFAULT_LOCALE;
    }
    return DEFAULT_LOCALE;
  });

  const [, forceRender] = useState(0);

  useEffect(() => {
    loadCatalog(locale).then(() => forceRender(n => n + 1));
  }, [locale]);

  function toggleLocale() {
    const next: Locale = locale === 'en' ? 'si' : 'en';
    setLocale(next);
    localStorage.setItem('locale', next);
  }

  return (
    <LocaleContext.Provider value={{ locale, toggleLocale }}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </LocaleContext.Provider>
  );
}

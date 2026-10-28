'use client';

import { useCallback, useEffect, useState } from 'react';
import { LANG_STORAGE_KEY, normalizeLangCode, type LangCode } from '@/lib/language';

export function useLanguagePreference() {
  const [language, setLanguageState] = useState<LangCode>('en');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const savedLanguage = normalizeLangCode(window.localStorage.getItem(LANG_STORAGE_KEY));
    if (savedLanguage) setLanguageState(savedLanguage);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    document.documentElement.lang = language;
    window.localStorage.setItem(LANG_STORAGE_KEY, language);
    document.cookie = `${LANG_STORAGE_KEY}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent('taxflow-language-change', { detail: language }));
  }, [language, initialized]);

  const setLanguage = useCallback((nextLanguage: LangCode) => {
    setLanguageState(nextLanguage);
  }, []);

  return [language, setLanguage] as const;
}

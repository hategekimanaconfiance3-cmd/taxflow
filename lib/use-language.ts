'use client';

import { useCallback, useEffect, useState } from 'react';
import { isLangCode, LANG_STORAGE_KEY, type LangCode } from '@/lib/language';

export function useLanguagePreference() {
  const [language, setLanguageState] = useState<LangCode>('en');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isLangCode(savedLanguage)) setLanguageState(savedLanguage);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    document.documentElement.lang = language === 'kiny' ? 'rw' : language;
    window.localStorage.setItem(LANG_STORAGE_KEY, language);
    document.cookie = `${LANG_STORAGE_KEY}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent('taxflow-language-change', { detail: language }));
  }, [language, initialized]);

  const setLanguage = useCallback((nextLanguage: LangCode) => {
    setLanguageState(nextLanguage);
  }, []);

  return [language, setLanguage] as const;
}

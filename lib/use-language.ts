'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { isLangCode, LANG_STORAGE_KEY, type LangCode } from '@/lib/language';

function subscribeToLanguage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener('taxflow-language-change', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('taxflow-language-change', onChange);
  };
}

function getLanguageSnapshot(): LangCode {
  const savedLanguage = window.localStorage.getItem(LANG_STORAGE_KEY);
  return isLangCode(savedLanguage) ? savedLanguage : 'en';
}

function getServerLanguageSnapshot(): LangCode {
  return 'en';
}

export function useLanguagePreference() {
  const language = useSyncExternalStore(subscribeToLanguage, getLanguageSnapshot, getServerLanguageSnapshot);

  useEffect(() => {
    document.documentElement.lang = language === 'kiny' ? 'rw' : language;
    document.cookie = `${LANG_STORAGE_KEY}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [language]);

  const setLanguage = useCallback((nextLanguage: LangCode) => {
    window.localStorage.setItem(LANG_STORAGE_KEY, nextLanguage);
    window.dispatchEvent(new CustomEvent('taxflow-language-change', { detail: nextLanguage }));
  }, []);

  return [language, setLanguage] as const;
}

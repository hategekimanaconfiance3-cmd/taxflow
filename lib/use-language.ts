'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { isLangCode, LANG_STORAGE_KEY, type LangCode } from '@/lib/language';

const LANGUAGE_CHANGE_EVENT = 'taxflow-language-change';

function getLanguageSnapshot(): LangCode {
  const storedLanguage = window.localStorage.getItem(LANG_STORAGE_KEY);
  return isLangCode(storedLanguage) ? storedLanguage : 'en';
}

function getServerLanguageSnapshot(): LangCode {
  return 'en';
}

function subscribeToLanguageChanges(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === LANG_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  };
}

export function useLanguagePreference(): readonly [LangCode, (nextLanguage: LangCode) => void] {
  const language = useSyncExternalStore(subscribeToLanguageChanges, getLanguageSnapshot, getServerLanguageSnapshot);

  const setLanguage = useCallback((nextLanguage: LangCode) => {
    window.localStorage.setItem(LANG_STORAGE_KEY, nextLanguage);
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: nextLanguage }));
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'kiny' ? 'rw' : language;
    document.cookie = `${LANG_STORAGE_KEY}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [language]);

  return [language, setLanguage] as const;
}

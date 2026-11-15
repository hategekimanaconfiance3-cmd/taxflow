'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { isLangCode, LANG_STORAGE_KEY, type LangCode } from '@/lib/language';

const LANGUAGE_CHANGE_EVENT = 'taxflow-language-change';

function readLanguage(): LangCode {
  const savedLanguage = window.localStorage.getItem(LANG_STORAGE_KEY);
  return isLangCode(savedLanguage) ? savedLanguage : 'en';
}

function subscribeToLanguage(onChange: () => void) {
  const handleLanguageEvent = (event: Event) => {
    const customEvent = event as CustomEvent<unknown>;
    if (typeof customEvent.detail === 'string' && isLangCode(customEvent.detail)) {
      window.localStorage.setItem(LANG_STORAGE_KEY, customEvent.detail);
    }
    onChange();
  };
  window.addEventListener('storage', onChange);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageEvent);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageEvent);
  };
}

export function useLanguagePreference() {
  const language = useSyncExternalStore<LangCode>(subscribeToLanguage, readLanguage, () => 'en');

  const setLanguage = useCallback((nextLanguage: LangCode) => {
    window.localStorage.setItem(LANG_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage === 'kiny' ? 'rw' : nextLanguage;
    document.cookie = `${LANG_STORAGE_KEY}=${nextLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: nextLanguage }));
  }, []);

  return [language, setLanguage] as const;
}

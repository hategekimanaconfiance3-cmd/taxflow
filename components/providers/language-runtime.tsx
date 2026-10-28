'use client';

import { useEffect, type ReactNode } from 'react';
import { LANG_STORAGE_KEY, normalizeLangCode, translateWithContext, type LangCode } from '@/lib/language';

const ATTRIBUTES_TO_TRANSLATE = ['placeholder', 'title', 'aria-label'] as const;
type TranslationState = { source: string; translated: string };

/** Applies the shared language catalog to static and dynamically rendered UI copy. */
export function LanguageRuntime({ children }: { children: ReactNode }) {
  useEffect(() => {
    let language: LangCode = 'en';
    const nodeState = new WeakMap<Text, TranslationState>();
    const attributeState = new WeakMap<Element, Map<string, TranslationState>>();

    const shouldSkip = (node: Node) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      return !element || Boolean(element.closest('script, style, code, pre, [data-no-translate]'));
    };

    const translateNode = (node: Text) => {
      if (shouldSkip(node)) return;
      const current = node.nodeValue ?? '';
      const previous = nodeState.get(node);
      const source = previous && current === previous.translated ? previous.source : current;
      const translated = translateWithContext(source, language);
      nodeState.set(node, { source, translated });
      if (translated !== current) node.nodeValue = translated;
    };

    const translateElement = (element: Element) => {
      if (shouldSkip(element)) return;
      const states = attributeState.get(element) ?? new Map<string, TranslationState>();
      for (const attribute of ATTRIBUTES_TO_TRANSLATE) {
        const current = element.getAttribute(attribute);
        if (current == null) continue;
        const previous = states.get(attribute);
        const source = previous && current === previous.translated ? previous.source : current;
        const translated = translateWithContext(source, language);
        states.set(attribute, { source, translated });
        if (translated !== current) element.setAttribute(attribute, translated);
      }
      attributeState.set(element, states);
    };

    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) translateNode(root as Text);
      if (root.nodeType === Node.ELEMENT_NODE) translateElement(root as Element);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let current: Node | null;
      while ((current = walker.nextNode())) {
        if (current.nodeType === Node.TEXT_NODE) translateNode(current as Text);
        else translateElement(current as Element);
      }
    };

    const applyLanguage = (value: string | null) => {
      language = normalizeLangCode(value) ?? 'en';
      document.documentElement.lang = language;
      translateTree(document.body);
    };

    applyLanguage(window.localStorage.getItem(LANG_STORAGE_KEY));
    const onLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<LangCode>).detail;
      applyLanguage(detail);
    };
    window.addEventListener('taxflow-language-change', onLanguageChange);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') translateNode(record.target as Text);
        else {
          record.addedNodes.forEach(translateTree);
          if (record.target.nodeType === Node.ELEMENT_NODE) translateElement(record.target as Element);
          if (record.type === 'attributes' && record.target.nodeType === Node.ELEMENT_NODE) translateElement(record.target as Element);
        }
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES_TO_TRANSLATE] });

    return () => {
      observer.disconnect();
      window.removeEventListener('taxflow-language-change', onLanguageChange);
    };
  }, []);

  return children;
}

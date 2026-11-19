import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getDocumentLanguage, subscribeDocumentLanguage, translateUiString } from './domLocale.mjs';

const HAN = /\p{Script=Han}/u;

export function useFilmTranslation(text, enabled = true, { priority = true, pendingText } = {}) {
  const language = useSyncExternalStore(subscribeDocumentLanguage, getDocumentLanguage);
  const [result, setResult] = useState(null);
  const request = window.electronAPI?.translateFilmText;
  const shouldTranslate = enabled && language === 'vi' && typeof text === 'string' && /\p{L}/u.test(text) && request;

  useEffect(() => {
    if (!shouldTranslate) return undefined;

    let current = true;
    const finish = value => {
      if (current) setResult({ text, value: typeof value === 'string' && value ? value : null });
    };
    Promise.resolve().then(() => request(text, priority)).then(finish, () => finish(null));
    return () => { current = false; };
  }, [text, priority, request, shouldTranslate]);

  if (language !== 'vi') return text;
  if (result && result.text === text) return result.value || text;
  return shouldTranslate && pendingText !== undefined && HAN.test(text) ? pendingText : text;
}

export default function FilmText({ as: Tag = 'span', text, lazy = false, pendingText, ...props }) {
  const element = useRef(null);
  const [visible, setVisible] = useState(false);
  const displayText = useFilmTranslation(text, !lazy || visible, { priority: !lazy, pendingText });

  useEffect(() => {
    const node = element.current;
    if (!lazy || !node || visible) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        setVisible(true);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy, visible, Tag]);

  return <Tag {...props} ref={element} data-i18n-skip>{displayText}</Tag>;
}

export function FilmTags({ tags }) {
  const language = useSyncExternalStore(subscribeDocumentLanguage, getDocumentLanguage);
  return [...new Set(tags)].map((tag, index) => {
    const localized = language === 'vi' ? translateUiString(tag) : tag;
    return <React.Fragment key={tag}>
      {index > 0 && ' · '}
      {language === 'vi' && HAN.test(localized) ? <FilmText text={tag} pendingText="…" /> : <span data-i18n-skip>{localized}</span>}
    </React.Fragment>;
  });
}

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getDocumentLanguage, subscribeDocumentLanguage } from './domLocale.mjs';

export function useFilmTranslation(text, enabled = true) {
  const language = useSyncExternalStore(subscribeDocumentLanguage, getDocumentLanguage);
  const [translation, setTranslation] = useState(null);

  useEffect(() => {
    const request = window.electronAPI?.translateFilmText;
    if (!enabled || language !== 'vi' || typeof text !== 'string' || !/\p{L}/u.test(text) || !request) return undefined;

    let current = true;
    Promise.resolve().then(() => request(text)).then(value => {
      if (current && typeof value === 'string' && value) setTranslation({ text, value });
    }).catch(() => {});
    return () => { current = false; };
  }, [text, enabled, language]);

  return language === 'vi' && translation?.text === text ? translation.value : text;
}

export default function FilmText({ as: Tag = 'span', text, lazy = false, ...props }) {
  const element = useRef(null);
  const [visible, setVisible] = useState(false);
  const displayText = useFilmTranslation(text, !lazy || visible);

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

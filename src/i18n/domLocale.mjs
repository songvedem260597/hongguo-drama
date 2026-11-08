import viAuto from './vi-dictionary.mjs';
import viOverrides from './vi-overrides.mjs';
import { readMenuLanguage, normalizeMenuLanguage } from '../menuLocale.mjs';

// Offline-only UI translations. User content, film names and media are not sent to a translator.
const translated = Object.freeze({ ...viAuto, ...viOverrides });
const HAN = /[\u3400-\u9fff]/;
const HAN_RUN = /[\u3400-\u9fff]+/g;
const UI_ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'aria-description', 'alt', 'data-tooltip'];
const SKIP_SELECTOR = [
  'script', 'style', 'textarea', 'pre', 'code', 'kbd', 'svg',
  '[contenteditable="true"]', '[data-i18n-skip]', '#menu-language',
  '.browse-card-title', '.search-card-title', '.series-title',
  '.player-series-name', '.series-row-title', '.dm-task-title',
  '.search-history-term', '.series-description', '.comment-content',
  '.danmaku-text', '.danmaku-item', '.subtitle-text', '.drama-title',
].join(',');

const textRecords = new WeakMap();
const attrRecords = new WeakMap();
let language = 'vi';
let observer = null;
let initialTitle = null;
let pending = new Set();
let queued = false;

export function translateUiString(value) {
  if (typeof value !== 'string' || !HAN.test(value)) return value;
  // Hongguo catalog count units: 万 = 10,000; 亿 = 100,000,000.
  const countOnly = /^\d+(?:\.\d+)?(?:万|亿)$/.test(value.trim());
  const input = countOnly ? value.replace(/(\d+(?:\.\d+)?)(万|亿)/g, (_, digits, unit) => {
    const count = Number(digits) * (unit === '万' ? 10_000 : 100_000_000);
    if (!Number.isFinite(count)) return digits + unit;
    const divisor = count >= 1_000_000_000 ? 1_000_000_000 : count >= 1_000_000 ? 1_000_000 : 1_000;
    const suffix = divisor === 1_000_000_000 ? ' tỷ' : divisor === 1_000_000 ? ' triệu' : ' nghìn';
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(count / divisor) + suffix;
  }) : value;
  if (!HAN.test(input)) return input;
  const trimmed = input.trim();
  if (!trimmed) return value;
  const exact = translated[trimmed];
  if (exact && !HAN.test(exact)) {
    const start = input.indexOf(trimmed);
    return input.slice(0, start) + exact + input.slice(start + trimmed.length);
  }
  let changed = false;
  const result = input.replace(HAN_RUN, word => {
    const translation = translated[word];
    if (!translation || HAN.test(translation)) return word;
    changed = true;
    return translation;
  });
  if (!changed) return input;
  return result.replace(/，/g, ', ').replace(/。/g, '.').replace(/：/g, ': ')
    .replace(/！/g, '!').replace(/？/g, '?').replace(/、/g, ', ')
    .replace(/（/g, ' (').replace(/）/g, ')');
}

function excluded(node) {
  const element = node.nodeType === 1 ? node : node.parentElement;
  return !element || Boolean(element.closest(SKIP_SELECTOR));
}

function updateText(node) {
  if (excluded(node)) return;
  const current = node.nodeValue ?? '';
  let record = textRecords.get(node);
  if (record && current !== record.original && current !== record.translated) {
    if (HAN.test(current)) record = { original: current, translated: null };
    else { textRecords.delete(node); return; }
  }
  if (!record) {
    if (!HAN.test(current)) return;
    record = { original: current, translated: null };
  }
  const next = language === 'vi' ? translateUiString(record.original) : record.original;
  record.translated = next;
  textRecords.set(node, record);
  if (current !== next) node.nodeValue = next;
}

function updateAttributes(element) {
  if (excluded(element)) return;
  const state = attrRecords.get(element) || new Map();
  for (const attr of UI_ATTRIBUTES) {
    const current = element.getAttribute(attr);
    if (current === null) { state.delete(attr); continue; }
    let record = state.get(attr);
    if (record && current !== record.original && current !== record.translated) {
      if (HAN.test(current)) record = { original: current, translated: null };
      else { state.delete(attr); continue; }
    }
    if (!record) {
      if (!HAN.test(current)) continue;
      record = { original: current, translated: null };
    }
    const next = language === 'vi' ? translateUiString(record.original) : record.original;
    record.translated = next;
    state.set(attr, record);
    if (current !== next) element.setAttribute(attr, next);
  }
  attrRecords.set(element, state);
}

function processTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { updateText(root); return; }
  if (root.nodeType !== 1 || excluded(root)) return;
  updateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === 3) updateText(node);
    else updateAttributes(node);
  }
}

function flush() {
  queued = false;
  const work = pending;
  pending = new Set();
  for (const node of work) {
    if (node.nodeType === 1 && !node.isConnected) continue;
    processTree(node);
  }
}

function schedule(node) {
  if (!node) return;
  pending.add(node);
  if (!queued) {
    queued = true;
    queueMicrotask(flush);
  }
}

export function setDocumentLanguage(next) {
  language = normalizeMenuLanguage(next);
  if (typeof document === 'undefined') return language;
  document.documentElement.lang = language === 'vi' ? 'vi' : 'zh-CN';
  if (initialTitle === null) initialTitle = document.title;
  document.title = 'Hongguo Downloader';
  schedule(document.body);
  return language;
}

export function installDomLocalization() {
  if (typeof document === 'undefined' || observer) return;
  language = readMenuLanguage();
  const originalAlert = window.alert.bind(window);
  const originalConfirm = window.confirm.bind(window);
  const originalPrompt = window.prompt.bind(window);
  window.alert = message => originalAlert(language === 'vi' ? translateUiString(String(message)) : message);
  window.confirm = message => originalConfirm(language === 'vi' ? translateUiString(String(message)) : message);
  window.prompt = (message, defaultValue) => originalPrompt(language === 'vi' ? translateUiString(String(message)) : message, defaultValue);
  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') schedule(mutation.target);
      else if (mutation.type === 'attributes') schedule(mutation.target);
      else for (const node of mutation.addedNodes) schedule(node);
    }
  });
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: UI_ATTRIBUTES,
  });
  setDocumentLanguage(language);
}

export function getUiTranslationCount() {
  return Object.keys(translated).length;
}

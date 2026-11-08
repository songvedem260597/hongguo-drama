import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MENU_LANGUAGE,
  MENU_LANGUAGE_KEY,
  getMenuLabels,
  normalizeMenuLanguage,
  readMenuLanguage,
  writeMenuLanguage,
} from '../../menuLocale.mjs';

const menuIds = ['browse', 'feed', 'download', 'player', 'history', 'calendar', 'manager', 'account', 'settings'];

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
}

test('menu has complete Vietnamese and Chinese labels for every page', () => {
  assert.equal(DEFAULT_MENU_LANGUAGE, 'vi');
  for (const locale of ['vi', 'zh']) {
    const labels = getMenuLabels(locale);
    for (const id of menuIds) assert.equal(typeof labels.menu[id], 'string', `${locale}.${id}`);
    assert.equal(Object.keys(labels.menu).length, menuIds.length);
  }
  assert.equal(getMenuLabels('vi').menu.download, 'Tìm kiếm và tải');
  assert.equal(getMenuLabels('zh').menu.download, '搜索与下载');
});

test('language selection persists, and restores after reopening', () => {
  const storage = memoryStorage();
  assert.equal(readMenuLanguage(storage), 'vi');
  assert.equal(writeMenuLanguage('zh', storage), 'zh');
  assert.equal(storage.getItem(MENU_LANGUAGE_KEY), 'zh');
  assert.equal(readMenuLanguage(storage), 'zh');
  assert.equal(writeMenuLanguage('vi', storage), 'vi');
  assert.equal(readMenuLanguage(storage), 'vi');
});

test('unknown or damaged language value is reset to Vietnamese', () => {
  const storage = memoryStorage();
  storage.setItem(MENU_LANGUAGE_KEY, 'pt');
  assert.equal(normalizeMenuLanguage('fr'), 'vi');
  assert.equal(readMenuLanguage(storage), 'vi');
});

test('language selection remains functional if localStorage is blocked', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(readMenuLanguage(storage), 'vi');
  assert.equal(writeMenuLanguage('zh', storage), 'zh');
});

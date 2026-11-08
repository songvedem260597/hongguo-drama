import test from 'node:test';
import assert from 'node:assert/strict';
import { translateUiString, getUiTranslationCount } from '../../i18n/domLocale.mjs';

test('all public app UI strings are translated offline without a network request', () => {
  assert.ok(getUiTranslationCount() >= 3800);
  assert.equal(translateUiString('设置'), 'Cài đặt');
  assert.equal(translateUiString('搜索与下载'), 'Tìm kiếm và tải phim');
  assert.equal(translateUiString('下载管理'), 'Quản lý tải xuống');
  assert.equal(translateUiString('保存设置'), 'Lưu cài đặt');
  assert.equal(translateUiString('播放'), 'Phát');
  assert.equal(translateUiString('请稍后重试'), 'Vui lòng thử lại sau');
});

test('localization preserves spaces, dynamic numbers, Latin text and punctuation', () => {
  assert.equal(translateUiString('  设置  '), '  Cài đặt  ');
  assert.ok(translateUiString('共 12 集').includes('12'));
  assert.equal(translateUiString('1080P'), '1080P');
  assert.equal(translateUiString('https://example.org/series/你好'), 'https://example.org/series/你好');
});

test('server-provided categories and Chinese view counts show in Vietnamese', () => {
  assert.equal(translateUiString('现代言情'), 'Ngôn tình hiện đại');
  assert.equal(translateUiString('动作'), 'Hành động');
  assert.equal(translateUiString('7330万'), '73,3 triệu');
  assert.equal(translateUiString('1.5亿'), '150 triệu');
  assert.equal(translateUiString('100亿补贴'), '100亿补贴');
});

test('player labels use Vietnamese terms for video and comments', () => {
  assert.equal(translateUiString('原画'), 'Ảnh gốc');
  assert.equal(translateUiString('播放速度'), 'Tốc độ phát');
  assert.equal(translateUiString('开启时间轴弹幕'), 'Bật bình luận chạy');
  assert.equal(translateUiString('弹幕设置'), 'Cài đặt bình luận chạy');
});

test('built-in sources show brand names in Vietnamese', () => {
  for (const [brand, displayName] of [['红果', 'Hongguo'], ['西饭', 'Xifan'], ['河马', 'Hema']]) {
    assert.equal(translateUiString(brand), displayName);
    assert.equal(translateUiString(`${brand}短剧`), displayName);
  }
});

test('movie title not present in the known UI dictionary remains untouched', () => {
  assert.equal(translateUiString('这不是UI里的新电影名字'), '这不是UI里的新电影名字');
});

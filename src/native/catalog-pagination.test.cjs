const assert = require('node:assert/strict');
const test = require('node:test');
const { createCatalogPager } = require('./catalog-pagination');

const ids = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
const cards = values => values.map(series_id => ({ series_id }));
const titles = page => page.results.map(item => item.series_id);

test('packs uneven source batches in order, carries over extras and excludes duplicates', async () => {
  const browse = createCatalogPager();
  const calls = [];
  const batches = [ids(1, 6), ids(5, 22), ids(21, 32), ids(32, 35)];
  const fetch = async ({ page }) => {
    calls.push(page);
    return { success: true, page, results: cards(batches[page - 1]), hasMore: page < batches.length,
      genres: page === 1 ? [{ slug: 'action' }] : [], sourceUrl: 'source-page-' + page };
  };
  const first = await browse({ page: 1 }, fetch);
  assert.deepEqual(titles(first), ids(1, 16));
  assert.equal(first.hasMore, true);
  assert.equal(first.sourceUrl, 'source-page-1');
  assert.deepEqual(calls, [1, 2]);

  const second = await browse({ page: 2 }, fetch);
  assert.deepEqual(titles(second), ids(17, 32));
  assert.equal(second.hasMore, true);
  assert.equal(second.sourceUrl, 'source-page-2');
  assert.deepEqual(second.genres, first.genres);

  const last = await browse({ page: 3 }, fetch);
  assert.deepEqual(titles(last), ids(33, 35));
  assert.equal(last.hasMore, false);
  assert.equal(last.totalPages, 3);
  assert.equal(last.total, 35);
  assert.deepEqual(titles(await browse({ page: 1 }, fetch)), titles(first));
  assert.deepEqual(calls, [1, 2, 3, 4]);
});

test('uses numbered source pagination and suppresses a next page when only duplicates remain', async () => {
  const browse = createCatalogPager();
  const fetch = async ({ page }) => ({
    success: true, page, totalPages: 2, results: cards(page === 1 ? ids(1, 16) : ids(12, 16)),
  });
  const first = await browse({ source: 'hongguo', catalogChannel: 'web' }, fetch);
  assert.deepEqual(titles(first), ids(1, 16));
  assert.equal(first.hasMore, false);
  assert.equal(first.totalPages, 1);
});

test('a failed source page is retried at the same position with its earlier batch intact', async () => {
  const browse = createCatalogPager();
  const calls = [];
  let fail = true;
  const fetch = async ({ page }) => {
    calls.push(page);
    if (page === 2 && fail) return { success: false, error: 'offline' };
    return { success: true, results: cards(page === 1 ? ids(1, 6) : ids(7, 18)), hasMore: page === 1 };
  };
  assert.equal((await browse({}, fetch)).error, 'offline');
  fail = false;
  assert.deepEqual(titles(await browse({}, fetch)), ids(1, 16));
  assert.deepEqual(calls, [1, 2, 2]);
});

test('refresh replaces the old ordering and concurrent reads share the new source batches', async () => {
  const browse = createCatalogPager();
  const key = { category: 'comic-drama', catalogChannel: 'app' };
  const calls = [];
  let offset = 0;
  const fetch = async ({ page, forceRefresh }) => {
    calls.push([page, forceRefresh]);
    if (forceRefresh) offset = 100;
    const start = offset + (page - 1) * 17 + 1;
    return { success: true, results: cards(ids(start, start + 16)), hasMore: page < 2 };
  };
  assert.deepEqual(titles(await browse(key, fetch)), ids(1, 16));
  const [refresh, same] = await Promise.all([
    browse({ ...key, forceRefresh: true }, fetch),
    browse({ ...key, forceRefresh: true }, fetch),
  ]);
  assert.deepEqual(titles(refresh), ids(101, 116));
  assert.deepEqual(titles(same), titles(refresh));
  assert.deepEqual(titles(await browse({ ...key, page: 2 }, fetch)), ids(117, 132));
  assert.deepEqual(calls, [[1, false], [1, true], [2, false]]);
  assert.equal((await browse({ ...key, sourceRevision: 1, page: 2 }, fetch)).code, 'BROWSE_CURSOR');
});

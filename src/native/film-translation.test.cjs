const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');
const { createFilmTranslator } = require('./film-translation');

const memoryResult = translatedText => Response.json({ responseStatus: 200, responseData: { translatedText } });
const googleBusy = () => new Response(null, { status: 429 });

test('Chinese film text falls back after Google rate limits and is cached across app sessions', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hongguo-translation-'));
  const cachePath = path.join(directory, 'translations.json');
  const calls = [];
  try {
    const translate = createFilmTranslator({ cachePath, request: async input => {
      const url = new URL(input);
      calls.push(url.hostname);
      if (url.hostname === 'translate.googleapis.com') return googleBusy();
      assert.equal(url.searchParams.get('langpair'), 'zh-CN|vi');
      return memoryResult('Phim thử');
    } });
    assert.equal(await translate('测试剧'), 'Phim thử');
    assert.equal(await translate('第二部剧'), 'Phim thử');
    assert.deepEqual(calls, ['translate.googleapis.com', 'api.mymemory.translated.net', 'api.mymemory.translated.net']);
    await delay(450);
    assert.ok(fs.existsSync(cachePath));
    const reopen = createFilmTranslator({ cachePath, request: async () => assert.fail('should use cache') });
    assert.equal(await reopen('测试剧'), 'Phim thử');
  } finally {
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
    fs.rmdirSync(directory);
  }
});

test('fallback splits UTF-8 descriptions at the provider limit and joins all translated parts', async () => {
  const chunks = [];
  const translate = createFilmTranslator({ request: async input => {
    const url = new URL(input);
    if (url.hostname === 'translate.googleapis.com') return googleBusy();
    const q = url.searchParams.get('q');
    assert.ok(Buffer.byteLength(q) <= 500);
    chunks.push(q);
    return memoryResult('Đoạn ' + chunks.length);
  } });
  const synopsis = '故事开始了。'.repeat(57);
  const final = await translate(synopsis);
  assert.equal(chunks.join(''), synopsis);
  assert.equal(final, 'Đoạn 1 Đoạn 2 Đoạn 3');
});

test('featured film requests can move an already queued title ahead of background work', async () => {
  const calls = [];
  const waiting = [];
  const translate = createFilmTranslator({ request: (_input, options) => {
    calls.push(options.body.get('q'));
    return new Promise(resolve => waiting.push(resolve));
  } });
  const first = ['甲剧', '乙剧', '丙剧'].map(text => translate(text));
  const ordinary = translate('后台片单');
  const featured = translate('精选电影');
  assert.equal(translate('精选电影', true), featured);
  const translated = () => Response.json([[['Phim dịch']], null, 'zh-CN']);
  waiting.shift()(translated());
  await first[0];
  assert.equal(calls[3], '精选电影');
  waiting.shift()(translated());
  await first[1];
  assert.equal(calls[4], '后台片单');
  for (const resolve of waiting) resolve(translated());
  assert.deepEqual(await Promise.all([...first, ordinary, featured]), Array(5).fill('Phim dịch'));
});

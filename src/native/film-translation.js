const GOOGLE_TRANSLATE = 'https://translate.googleapis.com/translate_a/single';
const MAX_CONCURRENT = 3;
const MAX_PENDING = 100;
const MAX_CACHED = 1500;
const MAX_TEXT_LENGTH = 5000;

function createFilmTranslator({ request = fetch } = {}) {
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let running = 0;
  let rateLimitedUntil = 0;

  async function fetchTranslation(text) {
    try {
      const response = await request(GOOGLE_TRANSLATE, {
        method: 'POST',
        body: new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'vi', dt: 't', q: text }),
        signal: AbortSignal.timeout(6000),
        redirect: 'error',
      });
      if (response.status === 429) rateLimitedUntil = Date.now() + 60_000;
      if (!response.ok) return null;

      const [sentences, , source] = await response.json();
      if (source === 'vi') return text;
      if (!Array.isArray(sentences)) return null;
      const translation = sentences.map(sentence => typeof sentence?.[0] === 'string' ? sentence[0] : '').join('').trim();
      return translation || null;
    } catch {
      return null;
    }
  }

  function drain() {
    while (running < MAX_CONCURRENT && queue.length) {
      const { text, resolve } = queue.shift();
      if (Date.now() < rateLimitedUntil) {
        pending.delete(text);
        resolve(null);
        continue;
      }
      running += 1;
      void fetchTranslation(text).then(translation => {
        if (translation !== null) {
          cache.set(text, translation);
          if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
        }
        pending.delete(text);
        running -= 1;
        resolve(translation);
        drain();
      });
    }
  }

  return function translateFilmText(value) {
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH || !/\p{L}/u.test(value)) return null;
    const text = value.trim();
    if (cache.has(text)) return cache.get(text);
    if (pending.has(text)) return pending.get(text);
    if (pending.size >= MAX_PENDING || Date.now() < rateLimitedUntil) return null;

    const result = new Promise(resolve => queue.push({ text, resolve }));
    pending.set(text, result);
    drain();
    return result;
  };
}

module.exports = { createFilmTranslator };

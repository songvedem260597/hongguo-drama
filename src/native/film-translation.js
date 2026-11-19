const fs = require('node:fs');

const GOOGLE_TRANSLATE = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY_TRANSLATE = 'https://api.mymemory.translated.net/get';
const MYMEMORY_BYTES = 500;
const GOOGLE_BACKOFF_MS = 10 * 60_000;
const MYMEMORY_BACKOFF_MS = 60 * 60_000;
const MAX_CONCURRENT = 3;
const MAX_PENDING = 100;
const MAX_CACHED = 1500;
const MAX_TEXT_LENGTH = 5000;
const HAN = /\p{Script=Han}/u;
const sentences = new Intl.Segmenter('zh', { granularity: 'sentence' });

function splitForMyMemory(text) {
  const chunks = [];
  let chunk = '';
  let bytes = 0;
  function flush() {
    if (chunk.trim()) chunks.push(chunk.trim());
    chunk = '';
    bytes = 0;
  }
  for (const { segment } of sentences.segment(text)) {
    if (bytes + Buffer.byteLength(segment) > MYMEMORY_BYTES) flush();
    for (const character of segment) {
      const size = Buffer.byteLength(character);
      if (bytes + size > MYMEMORY_BYTES) flush();
      chunk += character;
      bytes += size;
    }
  }
  flush();
  return chunks;
}

function readCache(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Map(data.slice(-MAX_CACHED).filter(entry =>
      Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].length <= MAX_TEXT_LENGTH
      && typeof entry[1] === 'string' && entry[1].length <= MAX_TEXT_LENGTH * 4));
  } catch {
    return new Map();
  }
}

function createFilmTranslator({ request = fetch, cachePath } = {}) {
  const cache = cachePath ? readCache(cachePath) : new Map();
  const pending = new Map();
  const queue = [];
  let running = 0;
  let googleRetryAt = 0;
  let myMemoryRetryAt = 0;
  let saveTimer;

  function remember(text, translation) {
    cache.set(text, translation);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
    if (!cachePath || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const staging = cachePath + '.tmp';
      try {
        fs.writeFileSync(staging, JSON.stringify([...cache]), 'utf8');
        fs.renameSync(staging, cachePath);
      } catch {
        // Translation remains usable in memory if the optional disk cache cannot be written.
        try { fs.unlinkSync(staging); } catch {}
      }
    }, 350);
    saveTimer.unref();
  }

  async function fetchGoogle(text) {
    if (Date.now() < googleRetryAt) return null;
    try {
      const response = await request(GOOGLE_TRANSLATE, {
        method: 'POST',
        body: new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'vi', dt: 't', q: text }),
        signal: AbortSignal.timeout(4500),
        redirect: 'error',
        credentials: 'omit',
      });
      if (response.status === 429 || response.status === 403) googleRetryAt = Date.now() + GOOGLE_BACKOFF_MS;
      if (!response.ok) return null;
      const [parts, , source] = await response.json();
      if (source === 'vi') return text;
      if (!Array.isArray(parts)) return null;
      const translated = parts.map(part => typeof part?.[0] === 'string' ? part[0] : '').join('').trim();
      return translated && !(HAN.test(text) && HAN.test(translated)) ? translated : null;
    } catch {
      return null;
    }
  }

  async function fetchMyMemory(text) {
    if (!HAN.test(text) || Date.now() < myMemoryRetryAt) return null;
    const chunks = splitForMyMemory(text);
    const signal = AbortSignal.timeout(7500);
    const translated = [];
    try {
      for (const q of chunks) {
        const url = new URL(MYMEMORY_TRANSLATE);
        url.search = new URLSearchParams({ q, langpair: 'zh-CN|vi' });
        const response = await request(url.toString(), { signal, redirect: 'error', credentials: 'omit' });
        if (response.status === 429) myMemoryRetryAt = Date.now() + MYMEMORY_BACKOFF_MS;
        if (!response.ok) return null;
        const data = await response.json();
        if (data.quotaFinished || Number(data.responseStatus) === 429) myMemoryRetryAt = Date.now() + MYMEMORY_BACKOFF_MS;
        const part = data.responseData?.translatedText?.trim();
        if (data.quotaFinished || Number(data.responseStatus) !== 200 || !part || HAN.test(part)) return null;
        translated.push(part);
      }
      return translated.join(' ') || null;
    } catch {
      return null;
    }
  }

  function drain() {
    while (running < MAX_CONCURRENT && queue.length) {
      const priority = queue.findIndex(job => job.priority);
      const [{ text, resolve }] = queue.splice(Math.max(0, priority), 1);
      running++;
      void fetchGoogle(text).then(value => value || fetchMyMemory(text)).then(translation => {
        if (translation !== null) remember(text, translation);
        pending.delete(text);
        running--;
        resolve(translation);
        drain();
      });
    }
  }

  return function translateFilmText(value, priority = false) {
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH || !/\p{L}/u.test(value)) return null;
    const text = value.trim();
    if (cache.has(text)) return cache.get(text);
    const queued = pending.get(text);
    if (queued) {
      if (priority) queued.priority = true;
      return queued.result;
    }
    if (pending.size >= MAX_PENDING) return null;

    const job = { text, priority };
    job.result = new Promise(resolve => { job.resolve = resolve; });
    queue.push(job);
    pending.set(text, job);
    drain();
    return job.result;
  };
}

module.exports = { createFilmTranslator };

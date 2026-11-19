const PAGE_SIZE = 16;
const MAX_SESSIONS = 32;
const MAX_BATCHES_PER_LOAD = 24;
const SESSION_TTL_MS = 120_000;
const FETCH_BUDGET_MS = 20_000;

const expired = () => ({ success: false, code: 'BROWSE_CURSOR', error: '分页记录已失效，请重新加载第 1 页' });

function createCatalogPager() {
  const sessions = new Map();

  return async function browsePage(options, fetchPage) {
    const { source, category, genre, catalogChannel, sourceRevision, page = 1, forceRefresh = false } = options;
    if (!Number.isSafeInteger(page) || page < 1) {
      return { success: false, error: '无效的页码' };
    }

    const key = JSON.stringify([source, category, genre, catalogChannel, sourceRevision]);
    let state = sessions.get(key);
    if (page === 1 && (!state || (!state.refreshing && (forceRefresh || state.expires <= Date.now())))) {
      state = {
        entries: [], seen: new Set(), next: 1, finished: false, genres: [], metadata: {},
        work: state?.work, refreshing: forceRefresh, refreshUpstream: forceRefresh,
        expires: Date.now() + SESSION_TTL_MS,
      };
    }
    if (!state) return expired();

    sessions.delete(key);
    sessions.set(key, state);
    if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);

    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const load = async () => {
      if (sessions.get(key) !== state || start > state.entries.length) return expired();
      const deadline = Date.now() + FETCH_BUDGET_MS;
      // Read one item beyond the current page to avoid a next button that leads to an empty page.
      let batches = 0;
      while (!state.finished && state.entries.length <= end) {
        if (batches++ === MAX_BATCHES_PER_LOAD || Date.now() >= deadline) return { success: false, error: '目录加载超时，请重试' };
        const upstreamPage = state.next;
        const result = await fetchPage({
          ...options,
          page: upstreamPage,
          forceRefresh: state.refreshUpstream && (upstreamPage === 1 || catalogChannel === 'web'),
        });
        if (sessions.get(key) !== state) return expired();
        if (!result?.success) return result;
        if (result.page && Number(result.page) !== upstreamPage) return expired();

        const hasMore = result.hasMore ?? (Number(result.totalPages) > upstreamPage);
        const { results, sourceUrl, pageTitle, total, unsupported, emptyMessage } = result;
        state.metadata = { sourceUrl, pageTitle, total, unsupported, emptyMessage };
        if (result.genres?.length) state.genres = result.genres;
        for (const item of results || []) {
          const id = String(item?.series_id ?? '');
          if (!id || state.seen.has(id)) continue;
          state.seen.add(id);
          state.entries.push({ item, sourceUrl });
        }
        state.finished = !hasMore || unsupported === true;
        state.next++;
      }

      const { entries, metadata, finished } = state;
      return {
        ...metadata,
        success: true,
        page,
        results: entries.slice(start, end).map(entry => entry.item),
        sourceUrl: entries[start]?.sourceUrl || metadata.sourceUrl,
        genres: state.genres,
        total: finished ? entries.length : Number(metadata.total) || 0,
        totalPages: finished ? Math.ceil(entries.length / PAGE_SIZE) : 0,
        hasMore: entries.length > end,
      };
    };

    const work = (state.work || Promise.resolve()).then(load).finally(() => {
      if (page === 1) state.refreshing = false;
    });
    state.work = work.catch(() => {});
    return work;
  };
}

module.exports = { createCatalogPager };

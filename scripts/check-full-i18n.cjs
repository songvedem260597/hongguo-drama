// UI smoke test for the built Windows Electron application, using an isolated QA profile.
// Launch: "dist/win-unpacked/Hongguo Open Downloader.exe" --user-data-dir=<temp> --remote-debugging-port=9346 --remote-allow-origins=*
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  const port = process.env.CDP_PORT || '9346';
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const tab = tabs.find(item => item.type === 'page' && item.url.includes('index.html'));
  assert.ok(tab?.webSocketDebuggerUrl, 'No renderer target');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    const entry = pending.get(packet.id);
    if (!entry) return;
    pending.delete(packet.id);
    packet.error ? entry.reject(Error(packet.error.message)) : entry.resolve(packet.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJS = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  const waitFor = async (predicate, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await predicate()) return;
      await sleep(250);
    }
    throw Error('Timed out waiting for UI');
  };
  const menuText = () => evalJS('document.querySelector(".sidebar-menu")?.innerText || ""');
  const settingsText = () => evalJS('document.querySelector(".settings-container")?.innerText || ""');
  const choose = value => evalJS(`(() => { const target = document.getElementById('menu-language'); if (!target) throw Error('language selector unavailable'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(target,${JSON.stringify(value)}); target.dispatchEvent(new Event('change',{bubbles:true})); return target.value; })()`);
  try {
    await waitFor(async () => (await menuText()).includes('Khám phá phim'));
    assert.equal(await evalJS('document.documentElement.lang'), 'vi');
    assert.equal(await evalJS('document.title'), 'Hongguo Downloader');
    console.log('PASS Vietnamese by default; Hongguo Downloader window title');

    await evalJS(`(() => { const e=document.createElement('section'); e.id='i18n-qa-fixture'; e.innerHTML='<p>下载失败，请重试</p><p class="series-title">这不是UI里的新电影名字</p><input type="text" placeholder="搜索短剧" value="这不是UI里的新电影名字"><button title="打开文件夹">保存设置</button>'; document.body.appendChild(e); return true; })()`);
    await waitFor(async () => (await evalJS('document.querySelector("#i18n-qa-fixture p")?.textContent || ""')).includes('Tải'));
    assert.equal(await evalJS('document.querySelector("#i18n-qa-fixture .series-title").textContent'), '这不是UI里的新电影名字');
    assert.equal(await evalJS('document.querySelector("#i18n-qa-fixture input").value'), '这不是UI里的新电影名字');
    assert.equal(await evalJS('document.querySelector("#i18n-qa-fixture input").placeholder'), 'Tìm phim');
    assert.equal(await evalJS('document.querySelector("#i18n-qa-fixture button").title'), 'Mở thư mục');
    console.log('PASS dynamic messages and attributes translate; movie title and typed text stay unchanged');

    await evalJS('document.querySelector(".sidebar-footer button")?.click()');
    await waitFor(async () => (await settingsText()).includes('Máy chủ proxy'));
    assert.ok((await settingsText()).includes('Thư mục tải xuống'));
    await waitFor(async () => (await settingsText()).includes('Nguồn quốc tế mặc định tắt'));
    for (const source of ['DramaBox', 'ReelShort']) {
      assert.equal(await evalJS(`document.querySelector('[aria-label="Nguồn ${source} (quốc tế)"]')?.checked`), false);
    }
    console.log('PASS Settings labels and default-off 6.3 sources in Vietnamese');

    await choose('zh');
    await waitFor(async () => (await menuText()).includes('发现短剧') && (await settingsText()).includes('网络代理'));
    assert.ok((await settingsText()).includes('海外来源默认关闭'));
    assert.equal(await evalJS('document.title'), 'Hongguo Downloader');
    assert.equal(await evalJS('document.querySelector("#i18n-qa-fixture p").textContent'), '下载失败，请重试');
    assert.equal(await evalJS('document.querySelector("#i18n-qa-fixture input").placeholder'), '搜索短剧');
    assert.equal(await evalJS('document.querySelector("#i18n-qa-fixture button").title'), '打开文件夹');
    console.log('PASS Chinese restores all original texts and attributes');

    await choose('vi');
    await waitFor(async () => (await settingsText()).includes('Máy chủ proxy'));
    console.log('PASS toggling back restores Vietnamese across full Settings page');

    await evalJS('document.querySelector(".sidebar-menu button:nth-of-type(3)")?.click()');
    await waitFor(async () => (await menuText()).includes('Tìm kiếm và tải'));
    console.log('PASS navigation remains functional after language switching');

    const routes = ['browse', 'feed', 'download', 'player', 'history', 'calendar', 'manager', 'account'];
    for (const [index, route] of routes.entries()) {
      await evalJS(`document.querySelectorAll('.sidebar-menu button')[${index}]?.click()`);
      await waitFor(async () => Boolean(await evalJS(`document.querySelector('main[data-page="${route}"]')?.hidden === false`)), 8000);
      await sleep(600);
      const remaining = await evalJS(`(() => { const root=document.querySelector('main[data-page="${route}"]');const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const out=[];while(walker.nextNode()){const n=walker.currentNode;if(/[\\u3400-\\u9fff]/.test(n.nodeValue) && n.parentElement && !n.parentElement.closest('.browse-card-title,.search-card-title,.series-title,.series-row-title,.player-series-name,.dm-task-title,.series-description,.subtitle-text,.danmaku-text,.comment-content,[data-i18n-skip]'))out.push(n.nodeValue.trim().slice(0,70));}return [...new Set(out)].slice(0,90);})()`);
      console.log('SCREEN', route, 'visible untranslated samples:', JSON.stringify(remaining));
    }
    const summary = await evalJS(`({lang:document.documentElement.lang,title:document.title,visibleSettings:document.querySelector('.settings-container')?.innerText.slice(0,140) || '',translateStats:document.body.innerText.length})`);
    console.log('QA SUMMARY', JSON.stringify(summary));
  } finally { ws.close(); }
}
run().catch(err => { console.error(err.stack || err); process.exitCode = 1; });

// Optional real Electron smoke test: start the built app with --remote-debugging-port=9344
// --user-data-dir=<isolated-test-folder>. Does not touch the regular portable profile.
const assert = require('node:assert/strict');
const port = Number(process.env.CDP_PORT || '9344');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const tab = tabs.find(item => item.type === 'page' && /index\.html/.test(item.url));
  assert.ok(tab?.webSocketDebuggerUrl, 'Electron app tab is not available');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    if (!packet.id || !pending.has(packet.id)) return;
    const entry = pending.get(packet.id);
    pending.delete(packet.id);
    packet.error ? entry.reject(new Error(packet.error.message)) : entry.resolve(packet.result);
  });
  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  async function waitFor(predicate, timeout = 18000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (await predicate()) return; } catch (_) { /* app may be reloading */ }
      await sleep(350);
    }
    throw new Error('Timed out waiting for UI');
  }
  const menuText = () => evaluate('document.querySelector(".sidebar-menu")?.innerText || ""');
  const currentStorage = () => evaluate('localStorage.getItem("hongguo.menu.language")');
  const select = () => evaluate('document.getElementById("menu-language")?.value || ""');
  const setSelect = value => evaluate(`(() => { const select = document.getElementById('menu-language'); if (!select) throw Error('selector missing'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })); return select.value; })()`);

  try {
    await waitFor(async () => (await menuText()).includes('Tìm kiếm và tải'));
    console.log('PASS: first launch defaults to Vietnamese sidebar');
    await evaluate('document.querySelector(".sidebar-footer button")?.click()');
    await waitFor(async () => (await select()) === 'vi');
    console.log('PASS: bilingual Settings language selector is visible');
    await setSelect('zh');
    await waitFor(async () => (await menuText()).includes('搜索与下载') && (await currentStorage()) === 'zh');
    console.log('PASS: selecting Chinese changes navigation immediately and persists it');
    await send('Page.reload', { ignoreCache: true });
    await waitFor(async () => (await menuText()).includes('搜索与下载'));
    console.log('PASS: relaunch/reload restores Chinese');
    await evaluate('document.querySelector(".sidebar-footer button")?.click()');
    await waitFor(async () => (await select()) === 'zh');
    await setSelect('vi');
    await waitFor(async () => (await menuText()).includes('Tìm kiếm và tải') && (await currentStorage()) === 'vi');
    console.log('PASS: selecting Vietnamese restores sidebar and persists it');
    await send('Page.reload', { ignoreCache: true });
    await waitFor(async () => (await menuText()).includes('Tìm kiếm và tải'));
    console.log('PASS: reload restores Vietnamese');
  } finally {
    ws.close();
  }
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

// Visual UI regression check against the actual built Electron renderer.
// Launch Electron with --user-data-dir=<isolated> and --remote-debugging-port=9352.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const port = process.env.CDP_PORT || '9352';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = tabs.find(x => x.type === 'page' && /index\.html/.test(x.url));
  assert.ok(page?.webSocketDebuggerUrl, 'QA tab missing');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const pending = new Map(); let id = 1;
  ws.addEventListener('message', e => {
    const packet = JSON.parse(e.data);
    const callback = pending.get(packet.id);
    if (!callback) return;
    pending.delete(packet.id);
    packet.error ? callback.reject(Error(packet.error.message)) : callback.resolve(packet.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = id++; pending.set(key, { resolve, reject });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(response.exceptionDetails.text);
    return response.result?.value;
  };
  const selectPage = async pageId => {
    await evaluate(`(() => {const id=${JSON.stringify(pageId)}; const buttons=[...document.querySelectorAll('.sidebar-item')]; buttons.find(b=>b.textContent.includes(id==='settings'?'Cài đặt':id==='download'?'Tìm kiếm và tải':'Khám phá phim'))?.click(); return true;})()`);
    await delay(550);
  };
  const screenshots = path.resolve('qa/screenshots');
  fs.mkdirSync(screenshots, { recursive: true });
  try {
    await send('Page.enable');
    for (const width of [1366, 1024, 760]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 820, deviceScaleFactor: 1, mobile: false });
      await delay(450);
      const geometry = await evaluate(`(() => {
        const get = s => document.querySelector(s);
        const rect = el => { if(!el) return null; const a=el.getBoundingClientRect(); return {x:Math.round(a.x),w:Math.round(a.width),h:Math.round(a.height)}; };
        const nav = get('.sidebar'); const item = get('.sidebar-item'); const body=get('body');
        return {
          width: innerWidth, bodyWidth: body.scrollWidth,
          font: getComputedStyle(body).fontFamily,
          baseFont: getComputedStyle(body).fontSize,
          baseLine: getComputedStyle(body).lineHeight,
          sidebar: rect(nav), navFont: item && getComputedStyle(item).fontSize,
          menuItemHeight: rect(item)?.h,
          brand: rect(get('.brand-text')),
          brandScroll: get('.brand-text')?.scrollWidth,
          buttonSize: rect(get('.toolbar-actions .btn')),
          main: rect(get('.main-content:not([hidden])')),
        };
      })()`);
      console.log('GEOMETRY', JSON.stringify(geometry));
      assert.ok(geometry.font.includes('Be Vietnam Pro'), 'Vietnamese font missing');
      assert.equal(geometry.baseFont, '14px');
      assert.ok(geometry.sidebar && geometry.sidebar.w >= 180, 'sidebar too narrow');
      assert.ok(geometry.menuItemHeight >= 40, 'menu item too cramped');
      assert.ok(geometry.bodyWidth <= width + 2, 'unexpected full-page overflow');
      if (width === 1366) {
        for (const pageId of ['browse', 'download', 'settings']) {
          await selectPage(pageId);
          await delay(800);
          const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          const out = path.join(screenshots, `${pageId}-${width}-vi.png`);
          fs.writeFileSync(out, Buffer.from(capture.data, 'base64'));
          console.log('SCREENSHOT', out, fs.statSync(out).size);
        }
      }
    }
    console.log('PASS typography, spacing, responsive geometry');
  } finally {
    await send('Emulation.clearDeviceMetricsOverride');
    ws.close();
  }
}
run().catch(e=>{console.error(e.stack || e); process.exitCode=1});

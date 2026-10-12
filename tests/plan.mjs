import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import { chromium, devices } from 'playwright';
const TEST = 'ce20bee2-c58a-4df9-bf75-59bc5a588b04', REAL = 'adf60071-22d2-4497-9a3d-439176b9827b';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'], hasTouch: true }); const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=' + TEST, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
// READ-ONLY plan render from a real project (no rows written)
console.log('plan', await page.evaluate(async (pid) => {
  const supa = SurveyStore.client(); const floors = await SurveyPlan.listFloors(supa, pid); const f = floors[0];
  const pl = await SurveyPlan.activePlan(supa, pid, f.floor_id); const t0 = Date.now();
  const im = await SurveyPlan.loadImage(supa, pl);
  // show it on the current page WITHOUT saving (ink.setPage on a detached page object)
  const ink = window.__svInk || null;
  return { floor: f.code, file: pl.filename, mime: pl.mime_type, img: [im.image.width, im.image.height], fit: im.fit, k: im.basis.k, ms: Date.now() - t0 };
}, REAL));
// OFFLINE: draw while offline, then reconnect
await page.click('#svNew'); await page.waitForTimeout(2500);
await ctx.setOffline(true); await page.waitForTimeout(500);
await page.evaluate(() => {
  const host = document.querySelector('#svCanvas'); const r = host.getBoundingClientRect();
  const ev = (type, x, y, p) => host.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'pen', clientX: r.left + x, clientY: r.top + y, pressure: p, bubbles: true, buttons: 1 }));
  ev('pointerdown', 100, 100, .5); for (let i = 0; i < 30; i++) ev('pointermove', 100 + i * 7, 100 + i * 5, .5); ev('pointerup', 300, 250, 0);
});
await page.click('#svAdd'); await page.click('[data-add="grid"]'); await page.waitForTimeout(2000);
console.log('offline', await page.evaluate(() => ({ online: navigator.onLine, pending: SurveyStore.status().pending, sync: document.querySelector('#svSync').textContent, pages: SurveyApp.state.pages.length })));
await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForTimeout(5000);
console.log('back online', await page.evaluate(() => ({ pending: SurveyStore.status().pending, sync: document.querySelector('#svSync').textContent })));
await page.screenshot({ path: 'shot-landscape.png' });
await browser.close();

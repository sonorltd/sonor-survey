import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import { chromium, devices } from 'playwright';
const PID = 'ce20bee2-c58a-4df9-bf75-59bc5a588b04'; // SON-2026-BGTRL (metadata.is_test)
const URL = 'http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=' + PID;
const browser = await chromium.launch({ executablePath: (await import('fs')).existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : require('child_process').execSync('ls -d /opt/pw-browsers/chromium*/chrome-linux/chrome').toString().trim() });
const ctx = await browser.newContext({ ...devices['iPad Pro 11'], hasTouch: true });
const page = await ctx.newPage();
const errors = [], logs = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const hdr = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, hdrH: document.querySelector('.header')?.getBoundingClientRect().height, bar: !!document.querySelector('.sonor-project-bar'), sessions: document.querySelector('#svSession').options.length, sync: document.querySelector('#svSync').textContent }));
console.log('boot', hdr);
// new survey via UI
await page.click('#svNew'); await page.waitForTimeout(4000);
let st = await page.evaluate(() => ({ session: !!SurveyApp.state.session, pages: SurveyApp.state.pages.length, canvasHidden: document.querySelector('#svCanvas').hidden }));
console.log('after new', st);
// draw with a "pen" — Playwright can't set pointerType=pen; dispatch synthetic pointer events
await page.evaluate(() => {
  const host = document.querySelector('#svCanvas'); const r = host.getBoundingClientRect();
  const ev = (type, x, y, p) => host.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: r.left + x, clientY: r.top + y, pressure: p, bubbles: true, buttons: 1 }));
  ev('pointerdown', 120, 120, .3); for (let i = 0; i < 40; i++) ev('pointermove', 120 + i * 6, 120 + Math.sin(i / 3) * 30, .3 + i / 80); ev('pointerup', 360, 120, 0);
  ev('pointerdown', 150, 250, .6); for (let i = 0; i < 20; i++) ev('pointermove', 150 + i * 8, 250 + i * 4, .6); ev('pointerup', 310, 330, 0);
});
await page.waitForTimeout(1800);
st = await page.evaluate(() => ({ strokes: SurveyApp.state.page.ink.strokes.length, pts: SurveyApp.state.page.ink.strokes.map(s => s.pts.length), pending: SurveyStore.status().pending, sync: document.querySelector('#svSync').textContent }));
console.log('after draw', st);
// eraser on first stroke
await page.click('[data-tool="eraser"]');
await page.evaluate(() => {
  const host = document.querySelector('#svCanvas'); const r = host.getBoundingClientRect();
  const ev = (type, x, y) => host.dispatchEvent(new PointerEvent(type, { pointerId: 8, pointerType: 'pen', clientX: r.left + x, clientY: r.top + y, pressure: .5, bubbles: true, buttons: 1 }));
  ev('pointerdown', 200, 250); ev('pointermove', 210, 265); ev('pointermove', 230, 290); ev('pointerup', 230, 290);
});
await page.waitForTimeout(1800);
st = await page.evaluate(() => ({ strokesAfterErase: SurveyApp.state.page.ink.strokes.length, canUndo: !document.querySelector('#svUndo').disabled }));
console.log('erase', st);
// touch should PAN not draw (finger) — two-finger pinch
await page.evaluate(() => {
  const host = document.querySelector('#svCanvas'); const r = host.getBoundingClientRect();
  const ev = (type, id, x, y) => host.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: r.left + x, clientY: r.top + y, pressure: .5, bubbles: true }));
  ev('pointerdown', 21, 300, 300); ev('pointerdown', 22, 400, 300); for (let i = 1; i <= 10; i++) { ev('pointermove', 21, 300 - i * 5, 300); ev('pointermove', 22, 400 + i * 5, 300); } ev('pointerup', 21, 250, 300); ev('pointerup', 22, 450, 300);
});
st = await page.evaluate(() => ({ strokesAfterPinch: SurveyApp.state.page.ink.strokes.length }));
console.log('pinch', st);
await page.click('#svUndo'); await page.waitForTimeout(1600);
// add lined + grid + plan menu
await page.click('#svAdd'); await page.click('[data-add="lined"]'); await page.waitForTimeout(800);
await page.click('#svAdd'); await page.click('[data-add="grid"]'); await page.waitForTimeout(800);
await page.click('#svAdd'); await page.click('[data-add="plan"]'); await page.waitForTimeout(1500);
const modal = await page.evaluate(() => ({ open: !document.querySelector('#svModal').hidden, body: document.querySelector('#svModalBody').innerText.slice(0, 200) }));
console.log('plan modal', modal); await page.click('#svModalClose');
// photo page from a generated jpeg
await page.setInputFiles('#svPhotoLib', { name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await (async () => { const c = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#7a8a6a'; x.fillRect(0, 0, 900, 600); x.fillStyle = '#fff'; x.font = '48px sans-serif'; x.fillText('SITE PHOTO', 260, 320); return c.toDataURL('image/jpeg', .8); }); return Buffer.from(c.split(',')[1], 'base64'); })()) });
await page.waitForTimeout(2500);
st = await page.evaluate(() => ({ pages: SurveyApp.state.pages.map(p => p.kind), cur: SurveyApp.state.page.kind, space: SurveyApp.state.page.ink.space, hasImg: !!document.querySelector('#svCanvas canvas') }));
console.log('photo', st);
await page.waitForTimeout(3000);
st = await page.evaluate(() => ({ pending: SurveyStore.status().pending, sync: document.querySelector('#svSync').textContent }));
console.log('sync', st);
await page.screenshot({ path: 'shot-ipad.png' });
// reload → pages persist from cloud
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
st = await page.evaluate(() => ({ sessions: document.querySelector('#svSession').options.length, pages: SurveyApp.state.pages.map(p => p.kind + ':' + (p.ink.strokes || []).length) }));
console.log('reload', st);
await page.click('#svPublish'); await page.waitForTimeout(2500);
console.log('errors', errors); console.log('logs', logs.slice(0, 12));
await browser.close();

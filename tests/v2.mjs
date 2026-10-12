import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import { chromium, devices } from 'playwright'; import fs from 'fs';
const TEST = 'ce20bee2-c58a-4df9-bf75-59bc5a588b04';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/GoTrue/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=' + TEST, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.click('#svNew'); await page.waitForTimeout(2500);
console.log('page', await page.evaluate(() => ({ kind: SurveyApp.state.page.kind, space: SurveyApp.state.page.ink.space })));
// draw with mouse at page centre
const box = await page.locator('#svCanvas').boundingBox();
await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 - 80); await page.mouse.down(); for (let i = 0; i < 30; i++) await page.mouse.move(box.x + box.width / 2 - 150 + i * 10, box.y + box.height / 2 - 80 + Math.sin(i / 4) * 40); await page.mouse.up();
// wheel pan a lot (the v0.1 striping repro)
for (let i = 0; i < 25; i++) await page.mouse.wheel(60, 35);
await page.waitForTimeout(300);
// white-pixel sanity: paper should still be a big white block
const white = await page.evaluate(() => { const c = document.querySelector('#svCanvas .sv-layer-bg'); const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let w = 0; for (let i = 0; i < d.length; i += 16) if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) w++; return Math.round(100 * w / (d.length / 16)); });
console.log('white% after pan', white);
// insert an image object
await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 500; const x = c.getContext('2d'); x.fillStyle = '#5a7a9a'; x.fillRect(0, 0, 800, 500); x.fillStyle = '#fff'; x.font = '60px sans-serif'; x.fillText('DROPPED PHOTO', 120, 270); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .8)); await SurveyApp.insertImage(new File([b], 'drop.jpg', { type: 'image/jpeg' })); });
await page.waitForTimeout(1500);
let st = await page.evaluate(() => ({ tool: document.querySelector('#svCanvas').dataset.tool, objects: SurveyApp.state.page.ink.objects || ink_objs(), sel: !!SurveyApp.state && !!document.querySelector('#svDelObj') && !document.querySelector('#svDelObj').hidden }));
function ink_objs() { return null; }
console.log('object', JSON.stringify(st).slice(0, 300));
// drag the object with the mouse (select tool) by 100px
const o = await page.evaluate(() => { const pg = SurveyApp.state.page.ink.objects[0]; return pg; });
const vc = await page.evaluate(() => { const c = document.querySelector('#svCanvas').getBoundingClientRect(); return [c.left, c.top]; });
// object centre in page units -> need view; use ink internals via a trick: click at viewCentre since we inserted at view centre
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(1600);
console.log('moved', await page.evaluate((o) => { const n = SurveyApp.state.page.ink.objects[0]; return { dx: Math.round(n.x - o.x), dy: Math.round(n.y - o.y), pending: SurveyStore.status().pending }; }, o));
// checklist page
await page.click('#svAdd'); await page.click('[data-add="checklist"]'); await page.waitForTimeout(1500);
console.log('templates', await page.evaluate(() => document.querySelectorAll('#svModalBody button').length));
await page.click('#svModalBody button:nth-child(2)'); await page.waitForTimeout(1500);
await page.click('#svCheck .sv-ci-tick'); await page.fill('#svCheck .sv-ci-val', '5.2'); await page.waitForTimeout(1200);
console.log('checklist', await page.evaluate(() => { const p = SurveyApp.state.page; return { kind: p.kind, name: p.metadata.checklist.name, prog: SurveyChecklist.progress(p.metadata.checklist) }; }));
await page.screenshot({ path: 'shot-v2-check.png' });
// report
const pdf = await page.evaluate(async () => { const proj = { id: SurveyApp.state.pid, name: 'Bungalow Trial', ref: 'SON-2026-BGTRL', client_name: 'Trial', address: '6 Rosebery Road' }; const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: p.kind === 'checklist' ? null : await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: proj, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('report.pdf', Buffer.from(pdf)); console.log('pdf bytes', pdf.length);
await page.evaluate(() => { const first = SurveyApp.state.pages[0]; return SurveyApp.state.pages.length; });
// go back to page 1 and screenshot the object + ink
await page.click('#svPages .sv-thumb'); await page.waitForTimeout(1500); await page.screenshot({ path: 'shot-v2-page.png' });
await page.waitForTimeout(3000); console.log('sync', await page.evaluate(() => SurveyStore.status().pending));
console.log('errors', errs);
await browser.close();

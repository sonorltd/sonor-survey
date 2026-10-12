import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import { chromium } from 'playwright'; import fs from 'fs';
const TEST = 'ce20bee2-c58a-4df9-bf75-59bc5a588b04';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=' + TEST, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
// a plan page for GF (no plan image on the test project — plan_ref minimal, floor_id real)
await page.evaluate(() => SurveyApp.addPage('plan', { floor_id: 'fhnyskasbyr7d', floor_code: 'GF', title: 'GF marks test', plan_ref: { plan_id: null, revision_label: 'Rev A' } })); await page.waitForTimeout(1500);
await page.click('[data-tool="mark"]'); await page.waitForTimeout(200);
console.log('palette', await page.evaluate(() => ({ visible: !document.querySelector('#svPalette').hidden, chips: document.querySelectorAll('.sv-mark-chip').length })));
const box = await page.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.click('.sv-mark-chip[data-code="tv"]'); await page.mouse.click(cx - 120, cy - 60);
await page.click('.sv-mark-chip[data-code="cspk"]'); await page.mouse.click(cx + 40, cy - 90); await page.mouse.click(cx + 120, cy - 90);
await page.click('.sv-mark-chip[data-code="kp"]'); await page.mouse.click(cx - 40, cy + 100);
await page.waitForTimeout(1800);
let st = await page.evaluate(() => ({ marks: SurveyApp.state.page.ink.marks.map(m => m.code + ':' + m.block_code), pending: SurveyStore.status().pending }));
console.log('marks', st);
// select the TV mark, pin a photo to it
await page.click('[data-tool="select"]'); await page.mouse.click(cx - 120, cy - 60); await page.waitForTimeout(200);
console.log('selected', await page.evaluate(() => ({ photoBtn: !document.querySelector('#svMarkPhoto').hidden })));
function ink_sel() { return null; }
const planId = await page.evaluate(() => SurveyApp.state.page.id);
await page.evaluate(() => { window.__mid = document.querySelector('#svMarkPhoto'); });
// drive the "Photo here" path with a generated file
const jpg = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d'); x.fillStyle = '#6a5a4a'; x.fillRect(0, 0, 640, 480); x.fillStyle = '#fff'; x.font = '40px sans-serif'; x.fillText('TV WALL', 200, 250); return c.toDataURL('image/jpeg', .8); });
await page.click('#svMarkPhoto');
await page.setInputFiles('#svPhotoIn', { name: 'tvwall.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg.split(',')[1], 'base64') });
await page.waitForTimeout(3000);
st = await page.evaluate(() => { const p = SurveyApp.state.page; return { kind: p.kind, pin: p.metadata.plan_pin, chip: document.querySelector('#svPinChip').textContent, floor: p.floor_code }; });
console.log('photo page', JSON.stringify(st).slice(0, 400));
await page.click('#svPinChip'); await page.waitForTimeout(1500);
console.log('back on plan', await page.evaluate(() => ({ kind: SurveyApp.state.page.kind, tvHasPhoto: !!SurveyApp.state.page.ink.marks.find(m => m.code === 'tv').photo_page_id, openBtn: !document.querySelector('#svMarkOpen').hidden })));
await page.screenshot({ path: 'shot-marks.png' });
await page.waitForTimeout(3000);
console.log('synced', await page.evaluate(() => SurveyStore.status().pending), 'errors', errs);
await page.evaluate(async () => { await SurveyStore.publishSummary(SurveyApp.state.pid); });
await browser.close();

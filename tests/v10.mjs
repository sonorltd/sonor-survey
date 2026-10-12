import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.click('#svSurveyBtn'); await page.click('#svNew'); await page.waitForTimeout(2000);   // fresh session → opens a blank NOTES page (Bryn's case: pins on notes)
const notesId = await page.evaluate(() => SurveyApp.state.page.id);
const box = await page.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.click('[data-tool="mark"]');
for (const [code, dx, dy] of [['cspk', -300, -150], ['cspk', -200, -150], ['tv', 250, -120], ['lkp', 300, 60]]) { await page.click('.sv-mark-chip[data-code="' + code + '"]'); await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(80); }
const mkPhoto = (label, col, w = 1200, h = 900) => page.evaluate(async ([label, col, w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = 'bold 90px sans-serif'; x.fillText(label, 100, h / 2); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .85)); return Array.from(new Uint8Array(await b.arrayBuffer())); }, [label, col, w, h]);
async function pinPhoto(dx, dy, label, col) {
  await page.evaluate((id) => SurveyApp.openPage(id), notesId); await page.waitForTimeout(500);
  await page.click('[data-tool="photopin"]'); await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(300);
  await page.setInputFiles('#svPhotoIn', { name: label + '.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await mkPhoto(label, col)) }); await page.waitForTimeout(1800);
}
await pinPhoto(-250, 40, 'LOUNGE WALL', '#5a7a9a'); await pinPhoto(200, -40, 'TV WALL', '#7a5a5a');
// unpinned photo via library
await page.setInputFiles('#svPhotoLib', { name: 'loose.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await mkPhoto('LOOSE', '#4f6b4f')) }); await page.waitForTimeout(1800);
// photo page UI: chip text + retake/change buttons visible
const ui1 = await page.evaluate(() => ({ chip: document.querySelector('#svPinChip').textContent, chipHidden: document.querySelector('#svPinChip').hidden, retake: !document.querySelector('#svPhotoRetake').hidden, change: !document.querySelector('#svPhotoChange').hidden, tags: SurveyApp.tags().tag, thumbTags: Array.from(document.querySelectorAll('.sv-thumb-tag')).map(e => e.textContent) }));
console.log('loose photo page', JSON.stringify(ui1));
// open P2 (TV WALL) and retake with a different-shape photo (dialog auto-accepted) → same id, same tag
const p2 = Object.keys(ui1.tags).find(k => ui1.tags[k] === 'P2');
await page.evaluate((id) => SurveyApp.openPage(id), p2); await page.waitForTimeout(600);
const chip2 = await page.evaluate(() => document.querySelector('#svPinChip').textContent);
await page.click('#svPhotoRetake'); await page.setInputFiles('#svPhotoIn', { name: 'retake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await mkPhoto('RETAKEN', '#8a3a3a', 900, 1200)) }); await page.waitForTimeout(2000);
const after = await page.evaluate((id) => { const p = SurveyApp.state.pages.find(x => x.id === id); return { id: p.id, space: p.ink.space, tag: SurveyApp.tags().tag[p.id], pinKept: !!p.metadata.plan_pin, replaced: !!p.metadata.replaced_at, pages: SurveyApp.state.pages.length }; }, p2);
console.log('chip P2', chip2, 'after retake', JSON.stringify(after));
// back on the notes page: labels painted? select the P2 mark → button says Retake / Open P2
await page.evaluate((id) => SurveyApp.openPage(id), notesId); await page.waitForTimeout(800);
await page.click('[data-tool="select"]'); await page.mouse.click(cx + 200, cy - 40); await page.waitForTimeout(200);
const mkUi = await page.evaluate(() => ({ labels: SurveyApp.ink().getLabels(), photoBtn: document.querySelector('#svMarkPhoto .lbl').textContent, openBtn: document.querySelector('#svMarkOpen .lbl').textContent, sel: (SurveyApp.ink().selectedMark() || {}).code }));
console.log('notes page mark UI', JSON.stringify(mkUi));
await page.screenshot({ path: 'shot-v10.png' });
const thumb = await page.evaluate(() => SurveyApp.ink().thumbnail(300)); fs.writeFileSync('thumb-v10.png', Buffer.from(thumb.split(',')[1], 'base64'));
const pdf = await page.evaluate(async () => { const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: p.kind === 'checklist' ? null : await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: { id: SurveyApp.state.pid, name: 'Bungalow Trial', ref: 'SON-2026-BGTRL', client_name: 'Trial', address: '6 Rosebery Road' }, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('report-v10.pdf', Buffer.from(pdf)); console.log('pdf bytes', pdf.length, 'errors', errs);
await browser.close();

import { chromium, devices } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'], hasTouch: true }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.evaluate(() => SurveyApp.addPage('plan', { floor_id: 'fhnyskasbyr7d', floor_code: 'GF', title: 'pdf marks test', plan_ref: { plan_id: null } })); await page.waitForTimeout(1200);
await page.tap('[data-tool="mark"]'); await page.waitForTimeout(300);
const box = await page.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2 + 40;
for (const [code, dx, dy] of [['cspk', 0, 0], ['cspk', 60, 0], ['tv', -150, -60], ['lkp', 150, 40], ['trv', 200, -80], ['pend', -80, 80], ['wall', -220, 20]]) { await page.tap('.sv-mark-chip[data-code="' + code + '"]'); await page.touchscreen.tap(cx + dx, cy + dy); await page.waitForTimeout(120); }
await page.tap('[data-tool="photopin"]'); await page.touchscreen.tap(cx + 40, cy + 120); await page.waitForTimeout(200);
// pen stroke over the top
await page.tap('[data-tool="pen"]'); await page.waitForTimeout(100);
await page.mouse.move(cx - 200, cy - 120); await page.mouse.down(); for (let i = 0; i < 30; i++) await page.mouse.move(cx - 200 + i * 14, cy - 120 + Math.sin(i / 4) * 30); await page.mouse.up();
await page.waitForTimeout(1800);
console.log('marks', await page.evaluate(() => SurveyApp.ink().getPage().marks.map(m => m.code)), 'strokes', await page.evaluate(() => SurveyApp.ink().getPage().strokes.length));
// thumbnail
const thumb = await page.evaluate(() => SurveyApp.ink().thumbnail(260)); fs.writeFileSync('thumb-v7.png', Buffer.from(thumb.split(',')[1], 'base64'));
await page.screenshot({ path: 'shot-v7.png' });
const pdf = await page.evaluate(async () => { const proj = { id: SurveyApp.state.pid, name: 'Bungalow Trial', ref: 'SON-2026-BGTRL', client_name: 'Trial', address: '6 Rosebery Road' }; const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: p.kind === 'checklist' ? null : await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: proj, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('report-v7.pdf', Buffer.from(pdf)); console.log('pdf bytes', pdf.length, 'pages', await page.evaluate(() => SurveyApp.state.pages.length));
console.log('errors', errs);
await browser.close();

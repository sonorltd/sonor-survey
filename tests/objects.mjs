import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
await page.click('#svSurveyBtn'); await page.click('#svNew'); await page.waitForTimeout(2000);
await page.click('[data-tool="object"]'); await page.waitForTimeout(300);
console.log('palette', await page.evaluate(() => ({ shown: !document.querySelector('#svObjects').hidden, chips: document.querySelectorAll('.sv-obj-chip').length, groups: Array.from(document.querySelectorAll('.sv-obj-group')).map(g => g.textContent), active: document.querySelector('.sv-obj-chip.active') && document.querySelector('.sv-obj-chip.active').dataset.code, toolNow: document.querySelector('#svToolNow').textContent })));
const box = await page.locator('#svCanvas canvas').first().boundingBox();
await page.mouse.click(box.x + 300, box.y + 250);   // steel beam (first chip)
await page.click('.sv-obj-chip[data-code="rad"]'); await page.mouse.click(box.x + 500, box.y + 250); await page.mouse.click(box.x + 700, box.y + 250);
await page.click('.sv-obj-chip[data-code="xtv"]'); await page.mouse.click(box.x + 400, box.y + 450);
await page.click('[data-tool="mark"]'); await page.waitForTimeout(200); await page.mouse.click(box.x + 600, box.y + 450);   // a device for contrast
await page.waitForTimeout(1500);
console.log('marks', await page.evaluate(() => SurveyApp.state.page.ink.marks.map(m => [m.kind, m.code, m.glyph, m.c])));
await page.screenshot({ path: 'objects.png' });
const pdf = await page.evaluate(async () => { const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: { id: SurveyApp.state.pid, name: 'Bungalow Trial', ref: 'SON-2026-BGTRL' }, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('report-objects.pdf', Buffer.from(pdf)); console.log('pdf', pdf.length, 'errors', errs);
await browser.close();

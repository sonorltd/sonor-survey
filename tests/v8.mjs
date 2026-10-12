import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.evaluate(() => SurveyApp.addPage('plan', { floor_id: 'fhnyskasbyr7d', floor_code: 'GF', title: 'select test', plan_ref: { plan_id: null } })); await page.waitForTimeout(1200);
const box = await page.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
// two marks + one image object
await page.click('[data-tool="mark"]'); await page.click('.sv-mark-chip[data-code="cspk"]'); await page.mouse.click(cx - 200, cy); await page.click('.sv-mark-chip[data-code="tv"]'); await page.mouse.click(cx + 200, cy);
await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').fillStyle = '#5a7a9a'; c.getContext('2d').fillRect(0, 0, 400, 300); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .8)); await SurveyApp.insertImage(new File([b], 'o.jpg', { type: 'image/jpeg' })); });
await page.waitForTimeout(800);
const geom = await page.evaluate(() => { const p = SurveyApp.ink().getPage(); return { marks: p.marks.map(m => [m.code, m.x, m.y]), obj: p.objects[0] }; });
console.log('setup', JSON.stringify(geom));
// Select tool: click CS (mark 1), then click TV (mark 2) → selection must move to TV, CS must not have moved
await page.click('[data-tool="select"]');
await page.mouse.click(cx - 200, cy); await page.waitForTimeout(100);
const s1 = await page.evaluate(() => (SurveyApp.ink().selectedMark() || {}).code);
await page.mouse.click(cx + 200, cy); await page.waitForTimeout(100);
const s2 = await page.evaluate(() => (SurveyApp.ink().selectedMark() || {}).code);
// click on the image object → object selected, mark cleared
// object was inserted at view centre; move pointer across page first (hover should not move anything)
await page.mouse.move(cx - 100, cy - 100); await page.mouse.move(cx, cy, { steps: 5 });
await page.mouse.click(cx, cy); await page.waitForTimeout(100);
const s3 = await page.evaluate(() => ({ obj: !!SurveyApp.ink().selected(), mark: (SurveyApp.ink().selectedMark() || {}).code, cursor: document.querySelector('#svCanvas').style.cursor }));
// drag the object 80px, then click empty → deselect
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 80, cy + 30, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(100);
await page.mouse.click(cx - 350, cy - 250); await page.waitForTimeout(100);
const s4 = await page.evaluate(() => ({ obj: !!SurveyApp.ink().selected(), mark: !!SurveyApp.ink().selectedMark() }));
// re-select CS and drag it; then select TV again
await page.mouse.move(cx - 200, cy); await page.mouse.down(); await page.mouse.move(cx - 260, cy + 40, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(100);
await page.mouse.click(cx + 200, cy); await page.waitForTimeout(100);
const s5 = await page.evaluate(() => ({ sel: (SurveyApp.ink().selectedMark() || {}).code, marks: SurveyApp.ink().getPage().marks.map(m => [m.code, m.x, m.y]), undo: SurveyApp.ink().canUndo() }));
await page.keyboard.press('Escape'); const s6 = await page.evaluate(() => !!SurveyApp.ink().selectedMark());
console.log({ s1, s2, s3, s4, s5, esc_cleared: !s6 });
const after = await page.evaluate(() => { const p = SurveyApp.ink().getPage(); return { marks: p.marks.map(m => [m.code, m.x, m.y]), obj: [p.objects[0].x, p.objects[0].y] }; });
console.log('after', JSON.stringify(after));
await page.screenshot({ path: 'shot-v8.png' });
// report must build (img regression)
const n = await page.evaluate(async () => { const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: p.kind === 'checklist' ? null : await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: { id: SurveyApp.state.pid, name: 'T', ref: 'R' }, session: SurveyApp.state.session, pages, engineer: 'B' }); return bytes.length; });
console.log('pdf bytes', n, 'errors', errs);
await browser.close();

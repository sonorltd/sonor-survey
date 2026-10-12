import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'], hasTouch: true }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.evaluate(() => SurveyApp.addPage('plan', { floor_id: 'fhnyskasbyr7d', floor_code: 'GF', title: 'touch test', plan_ref: { plan_id: null } })); await page.waitForTimeout(1200);
await page.tap('[data-tool="mark"]'); await page.waitForTimeout(300);
console.log('palette', await page.evaluate(() => ({ chips: document.querySelectorAll('.sv-mark-chip').length, active: (document.querySelector('.sv-mark-chip.active') || {}).dataset?.code, photoChip: !!document.querySelector('.sv-mark-chip[data-code="photo"]') })));
const box = await page.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2 + 60;
// place CS, then LK right next to it (within 10px) — must place, not grab
await page.tap('.sv-mark-chip[data-code="cspk"]'); await page.touchscreen.tap(cx, cy); await page.waitForTimeout(150);
await page.tap('.sv-mark-chip[data-code="lkp"]'); await page.touchscreen.tap(cx + 8, cy + 6); await page.waitForTimeout(150);
await page.tap('.sv-mark-chip[data-code="trv"]'); await page.touchscreen.tap(cx + 120, cy); await page.waitForTimeout(150);
await page.tap('.sv-mark-chip[data-code="pend"]'); await page.touchscreen.tap(cx - 120, cy); await page.waitForTimeout(400);
console.log('placed', await page.evaluate(() => SurveyApp.ink().getPage().marks.map(m => m.code + '/' + m.c)));
// select tool: tap on the TRV → selected; drag it
await page.tap('[data-tool="select"]'); await page.touchscreen.tap(cx + 120, cy); await page.waitForTimeout(200);
console.log('selected', await page.evaluate(() => (SurveyApp.ink().selectedMark() || {}).code), 'photoBtn', await page.evaluate(() => !document.querySelector('#svMarkPhoto').hidden));
// photo pin tool
await page.tap('[data-tool="photopin"]'); await page.waitForTimeout(200);
console.log('photopin', await page.evaluate(() => ({ tool: SurveyApp.ink().getTool(), paletteHidden: document.querySelector('#svPalette').hidden, btnActive: document.querySelector('[data-tool="photopin"]').classList.contains('active') })));
await page.screenshot({ path: 'shot-v6.png' });
await page.waitForTimeout(2000); console.log('errors', errs);
await browser.close();

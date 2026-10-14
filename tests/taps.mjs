import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, hasTouch: true })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
// TEST PROJECT ONLY
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
await page.click('#svSurveyBtn'); await page.click('#svNew'); await page.waitForTimeout(2500);
const box = await page.locator('#svCanvas canvas').first().boundingBox(); const marks = () => page.evaluate(() => (SurveyApp.ink().getPage().marks || []).length);
await page.click('[data-tool="mark"]'); await page.waitForTimeout(200);
await page.mouse.click(box.x + 300, box.y + 300); await page.waitForTimeout(100); console.log('tap places:', await marks());
// tap an existing mark = select (no duplicate); tap again quickly = remove
await page.mouse.click(box.x + 300, box.y + 300); await page.waitForTimeout(100); console.log('tap on existing → still', await marks(), 'selected:', await page.evaluate(() => !!SurveyApp.ink().selectedMark()));
await page.mouse.click(box.x + 300, box.y + 300); await page.waitForTimeout(100); console.log('second tap removes →', await marks(), 'undo available:', await page.evaluate(() => SurveyApp.ink().canUndo()));
await page.evaluate(() => SurveyApp.ink().undo()); console.log('undo restores →', await marks());
// two taps far apart in time on the same mark do NOT remove (slow double tap)
await page.waitForTimeout(600); await page.mouse.click(box.x + 300, box.y + 300); await page.waitForTimeout(700); await page.mouse.click(box.x + 300, box.y + 300); await page.waitForTimeout(100); console.log('slow re-tap keeps it →', await marks());
// a drag (scroll with the device tool armed) must NOT place
await page.mouse.move(box.x + 600, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 700, box.y + 380, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(100); console.log('drag places nothing:', await marks());
// a slow press (> 600 ms) must not place
await page.mouse.move(box.x + 800, box.y + 300); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.waitForTimeout(100); console.log('long press places nothing:', await marks());
// stabiliser: same jittery stroke drawn off vs strong — the strong one should have a shorter path (wobble removed)
async function wobble(y) { await page.mouse.move(box.x + 300, y); await page.mouse.down(); for (let j = 1; j <= 80; j++) await page.mouse.move(box.x + 300 + j * 4, y + ((j % 2) ? 6 : -6)); await page.mouse.up(); await page.waitForTimeout(150); }
await page.click('[data-tool="pen"]'); await page.evaluate(() => SurveyApp.ink().setStabiliser(0)); await wobble(box.y + 500);
await page.evaluate(() => SurveyApp.ink().setStabiliser(2)); await wobble(box.y + 560);
const len = await page.evaluate(() => SurveyApp.ink().getPage().strokes.slice(-2).map(s => Math.round(s.pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - s.pts[i - 1][0], p[1] - s.pts[i - 1][1]) : 0, 0))));
console.log('path length off vs strong:', len, 'chips:', await page.evaluate(() => Array.from(document.querySelectorAll('.sv-stab')).map(b => b.textContent + (b.classList.contains('active') ? '*' : ''))));
console.log('layers:', await page.evaluate(() => document.querySelectorAll('#svCanvas canvas').length), 'errors', errs);
await browser.close();

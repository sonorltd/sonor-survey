import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(5000);
// TEST PROJECT ONLY (Bungalow Trial, is_test) — never the live jobs: a survey may be in progress on the iPad
await page.click('#svSurveyBtn'); await page.click('#svNew'); await page.waitForTimeout(2500);
await page.evaluate(() => SurveyApp.setTool('pen'));
const box = await page.locator('#svCanvas canvas').first().boundingBox();
// 6 quick lines of "handwriting": 120 points each, no pause between them, time the whole thing
const t0 = Date.now();
for (let k = 0; k < 6; k++) {
  const y = box.y + 200 + k * 40; await page.mouse.move(box.x + 300, y); await page.mouse.down();
  for (let j = 1; j <= 120; j++) await page.mouse.move(box.x + 300 + j * 3, y + Math.sin(j / 4) * 12);
  await page.mouse.up();
}
const dt = Date.now() - t0;
await page.waitForTimeout(3000);
const st = await page.evaluate(() => ({ strokes: SurveyApp.state.page.ink.strokes.length, pts: SurveyApp.state.page.ink.strokes.map(s => s.pts.length), drawing: SurveyApp.ink().isDrawing(), sync: document.querySelector('#svSync').textContent.trim() }));
console.log('6 lines in', dt, 'ms', JSON.stringify(st), 'errors', errs);
// longtask probe: any main-thread stall > 80 ms during the next 4 s of writing?
await page.evaluate(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); });
for (let k = 0; k < 6; k++) { const y = box.y + 480 + k * 40; await page.mouse.move(box.x + 300, y); await page.mouse.down(); for (let j = 1; j <= 120; j++) await page.mouse.move(box.x + 300 + j * 3, y + Math.sin(j / 4) * 12); await page.mouse.up(); await page.waitForTimeout(300); }
await page.waitForTimeout(4000);
console.log('long tasks (ms) while writing + autosave + echo:', await page.evaluate(() => window.__lt));
await page.screenshot({ path: 'strokes.png' });
// pinch / pan preview: a pan must not repaint the canvases until the finger lifts (CSS transform while moving, cleared after)
await page.evaluate(() => SurveyApp.setTool('pan'));
await page.mouse.move(box.x + 500, box.y + 500); await page.mouse.down(); await page.mouse.move(box.x + 560, box.y + 530, { steps: 6 });
const mid = await page.evaluate(() => document.querySelector('#svCanvas canvas').style.transform); await page.mouse.up(); await page.waitForTimeout(100);
console.log('pan preview transform while moving:', mid, '→ after:', JSON.stringify(await page.evaluate(() => document.querySelector('#svCanvas canvas').style.transform)));
await browser.close();

import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, hasTouch: true })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
// TEST PROJECT ONLY
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
await page.click('#svSurveyBtn'); await page.click('#svNew'); await page.waitForTimeout(2500);
const box = await page.locator('#svCanvas canvas').first().boundingBox();
const ptr = (type, kind, x, y, id) => page.evaluate(([type, kind, x, y, id]) => { document.querySelector('#svCanvas').dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: kind, clientX: x, clientY: y, bubbles: true, isPrimary: kind === 'pen', pressure: type === 'pointerup' ? 0 : 0.5, buttons: type === 'pointerup' ? 0 : 1 })); }, [type, kind, x, y, id]);
const view = () => page.evaluate(() => SurveyApp.ink().pageToScreen(0, 0).map(Math.round));
const strokes = () => page.evaluate(() => SurveyApp.ink().getPage().strokes.length);
// PEN TOOL: palm lands first, then the Pencil writes a line while the palm wobbles
await page.evaluate(() => SurveyApp.setTool('pen')); const v0 = await view();
await ptr('pointerdown', 'touch', box.x + 600, box.y + 700, 21); await page.waitForTimeout(80);
await ptr('pointerdown', 'pen', box.x + 300, box.y + 300, 22);
for (let i = 1; i <= 20; i++) { await ptr('pointermove', 'pen', box.x + 300 + i * 10, box.y + 300 + Math.sin(i / 3) * 8, 22); if (i % 4 === 0) await ptr('pointermove', 'touch', box.x + 600 + i * 2, box.y + 700 + i, 21); }
await ptr('pointerup', 'pen', box.x + 500, box.y + 300, 22); await ptr('pointerup', 'touch', box.x + 640, box.y + 720, 21); await page.waitForTimeout(150);
console.log('palm + pencil writing → strokes', await strokes(), '(expect 1), view moved', JSON.stringify(await view()) !== JSON.stringify(v0) ? 'YES (bad)' : 'no (good)');
// DEVICES TOOL: palm resting, Pencil tap places; palm wobble must not pan or stop the tap
await page.click('[data-tool="mark"]'); await page.waitForTimeout(700); const v1 = await view(); console.log('tool', await page.evaluate(() => SurveyApp.ink().getTool()), 'marks before', await page.evaluate(() => (SurveyApp.ink().getPage().marks || []).length));
await ptr('pointerdown', 'touch', box.x + 650, box.y + 720, 31); await page.waitForTimeout(60); console.log('after palm down:', JSON.stringify(await page.evaluate(() => SurveyApp.ink()._gestures())));
await ptr('pointerdown', 'pen', box.x + 400, box.y + 400, 32); console.log('after pen down:', JSON.stringify(await page.evaluate(() => SurveyApp.ink()._gestures()))); await ptr('pointermove', 'touch', box.x + 660, box.y + 730, 31); await ptr('pointerup', 'pen', box.x + 400, box.y + 400, 32); await ptr('pointerup', 'touch', box.x + 660, box.y + 730, 31); await page.waitForTimeout(150);
console.log('palm + pencil tap → marks', await page.evaluate(() => (SurveyApp.ink().getPage().marks || []).length), '(expect 1), view moved', JSON.stringify(await view()) !== JSON.stringify(v1) ? 'YES (bad)' : 'no (good)');
// a real finger pan AFTER the pencil has been away > 0.6 s still works
await page.waitForTimeout(800); const v2 = await view();
await ptr('pointerdown', 'touch', box.x + 700, box.y + 600, 41); for (let i = 1; i <= 5; i++) await ptr('pointermove', 'touch', box.x + 700 - i * 20, box.y + 600, 41); await ptr('pointerup', 'touch', box.x + 600, box.y + 600, 41); await page.waitForTimeout(150);
console.log('finger pan later → view moved', (await view())[0] - v2[0], 'px (expect -100)', 'errors', errs);
await browser.close();

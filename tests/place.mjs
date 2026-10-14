import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, hasTouch: true }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
// TEST PROJECT ONLY
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
await page.evaluate(() => { try { localStorage.removeItem('sonor_survey_keep'); } catch (e) {} });
await page.click('#svSurveyBtn'); await page.click('#svNew'); await page.waitForTimeout(2500);
const box = await page.locator('#svCanvas canvas').first().boundingBox();
const marks = () => page.evaluate(() => (SurveyApp.ink().getPage().marks || []).map(m => m.code + '@' + Math.round(m.x)));
const tool = () => page.evaluate(() => document.querySelector('button[data-tool].active').dataset.tool + '/' + SurveyApp.ink().getTool());
const chip = code => page.evaluate(c => document.querySelector('.sv-mark-chip[data-code="' + c + '"]').click(), code);
// synthetic pointer events: Pencil vs finger
const ptr = (type, kind, x, y, id) => page.evaluate(([type, kind, x, y, id]) => { const h = document.querySelector('#svCanvas'); h.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: kind, clientX: x, clientY: y, bubbles: true, isPrimary: true, pressure: type === 'pointerup' ? 0 : 0.5, buttons: type === 'pointerup' ? 0 : 1 })); }, [type, kind, x, y, id]);
const tap = async (kind, x, y) => { await ptr('pointerdown', kind, x, y, 7); await ptr('pointerup', kind, x, y, 7); await page.waitForTimeout(120); };
const drag = async (kind, x, y, x2, y2) => { await ptr('pointerdown', kind, x, y, 8); for (let i = 1; i <= 6; i++) await ptr('pointermove', kind, x + (x2 - x) * i / 6, y + (y2 - y) * i / 6, 8); await ptr('pointerup', kind, x2, y2, 8); await page.waitForTimeout(120); };
await page.click('[data-tool="mark"]'); await chip('tv'); await page.waitForTimeout(100); console.log('armed', await tool(), 'keep:', await page.evaluate(() => SurveyApp.state.keepPlacing));
await tap('pen', box.x + 300, box.y + 300); console.log('pencil tap places:', await marks());
await tap('touch', box.x + 500, box.y + 300); console.log('finger tap places nothing:', await marks());
await tap('pen', box.x + 520, box.y + 300); console.log('pencil again (keep placing) places:', await marks(), 'tool', await tool());
await drag('touch', box.x + 300, box.y + 300, box.x + 400, box.y + 350); console.log('finger drag on the TV moves it:', await marks());
await tap('pen', box.x + 408, box.y + 352); console.log('pencil tap on the moved TV → select, not stack:', await marks(), 'sel', await page.evaluate(() => !!SurveyApp.ink().selectedMark()));
await tap('pen', box.x + 408, box.y + 352); console.log('second pencil tap removes:', await marks());
await tap('touch', box.x + 520, box.y + 300); await tap('touch', box.x + 520, box.y + 300); console.log('finger double-tap removes too:', await marks());
// one-shot mode
await page.evaluate(() => document.querySelector('.sv-keep').click()); await chip('dl'); await tap('pen', box.x + 300, box.y + 500); await page.waitForTimeout(100); console.log('one-shot: placed', await marks(), 'tool back to', await tool());
await tap('pen', box.x + 400, box.y + 500); console.log('…and the next pencil tap draws, not drops:', await marks());
await page.evaluate(() => document.querySelector('.sv-keep').click());
// drag a chip up and onto the plan
await page.click('[data-tool="mark"]'); const c2 = await page.locator('.sv-mark-chip[data-code="cspk"]').boundingBox();
await page.mouse.move(c2.x + 20, c2.y + 16); await page.mouse.down(); await page.mouse.move(c2.x + 20, c2.y - 40, { steps: 4 }); await page.mouse.move(box.x + 700, box.y + 400, { steps: 10 });
const ghost = await page.evaluate(() => { const g = document.querySelector('.sv-chip-ghost'); return g ? g.className.replace('btn sv-mark-chip ', '') : null; }); await page.mouse.up(); await page.waitForTimeout(200);
console.log('drag chip → ghost', ghost, '→', await marks());
await page.mouse.move(c2.x + 20, c2.y + 16); await page.mouse.down(); await page.mouse.move(c2.x + 120, c2.y + 18, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150); console.log('sideways on a chip = no drag:', (await marks()).length);
const before = (await marks()).length; const tx0 = await page.evaluate(() => SurveyApp.ink().pageToScreen(0, 0)[0]); await drag('touch', box.x + 800, box.y + 600, box.x + 700, box.y + 600); console.log('finger drag on empty pans:', (await page.evaluate(() => SurveyApp.ink().pageToScreen(0, 0)[0])) - tx0, 'px, marks', (await marks()).length === before ? 'unchanged' : 'CHANGED', 'errors', errs);

await browser.close();

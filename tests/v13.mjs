import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const url = 'http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04';
const A = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(), B = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errs = []; [A, B].forEach((p, i) => p.on('pageerror', e => errs.push((i ? 'B ' : 'A ') + e.stack.split('\n').slice(0, 3).join(' | '))));
await A.goto(url, { waitUntil: 'networkidle' }); await A.waitForTimeout(3000);
await A.click('#svSurveyBtn'); await A.click('#svNew'); await A.waitForTimeout(2500);
const sid = await A.evaluate(() => SurveyApp.state.session.id);
await A.evaluate((sid) => { window.__rt = []; const db = new window.SonorDB(); db.client.channel('dbg:' + sid).on('postgres_changes', { event: '*', schema: 'public', table: 'survey_pages', filter: 'session_id=eq.' + sid }, (pl) => { window.__rt.push({ ev: pl.eventType, keys: Object.keys(pl.new || {}), ink: pl.new && pl.new.ink ? Object.keys(pl.new.ink) : null, errors: pl.errors }); }).subscribe(); }, sid);
await B.goto(url + '&session=' + sid, { waitUntil: 'networkidle' }); await B.waitForTimeout(4000);
console.log('B session', await B.evaluate(() => ({ sid: SurveyApp.state.session && SurveyApp.state.session.id, pages: SurveyApp.state.pages.length })), 'match', sid);
// A places devices + a stroke on the blank page
const box = await A.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await A.click('[data-tool="mark"]'); for (const [c, dx] of [['cspk', -200], ['tv', 0], ['lkp', 200]]) { await A.click('.sv-mark-chip[data-code="' + c + '"]'); await A.mouse.click(cx + dx, cy); }
await A.click('[data-tool="pen"]'); await A.mouse.move(cx - 200, cy - 150); await A.mouse.down(); await A.mouse.move(cx + 200, cy - 100, { steps: 10 }); await A.mouse.up();
await A.waitForTimeout(6000);   // autosave 1.2 s + flush + realtime
const b1 = await B.evaluate(() => { const pg = SurveyApp.ink().getPage(); return { marks: pg.marks.length, strokes: pg.strokes.length, rowMarks: (SurveyApp.state.page.ink.marks || []).length, known: SurveyStore.knownVersion(SurveyApp.state.page.id), ver: SurveyApp.state.page.version }; });
console.log('B after A marks', JSON.stringify(b1));
// A adds a new photo-less page → B strip grows
await A.evaluate(() => SurveyApp.addPage('grid')); await A.waitForTimeout(5000);
console.log('B pages', await B.evaluate(() => SurveyApp.state.pages.length), 'A pages', await A.evaluate(() => SurveyApp.state.pages.length));
console.log('rt', JSON.stringify(await A.evaluate(() => window.__rt)).slice(0, 900));
console.log('errors', errs);
await browser.close();

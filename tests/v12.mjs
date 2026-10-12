import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/GoTrue|favicon|404/.test(m.text())) errs.push('C ' + m.text().slice(0, 160)); });
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
console.log('bars', await page.evaluate(() => ({ top: document.querySelectorAll('.sv-bar-top .btn').length, tools: Array.from(document.querySelectorAll('.sv-bar-tools > button[data-tool]')).map(b => b.dataset.tool), sync: document.querySelector('#svSync').textContent, find: document.querySelector('#svFindLbl').textContent, where: document.querySelector('#svWhere').textContent })));
// finder
await page.click('#svFind'); await page.waitForTimeout(600);
const f0 = await page.evaluate(() => ({ rows: document.querySelectorAll('.sv-finder-row').length, count: document.querySelector('#svFindCount').textContent, recent: !!document.querySelector('.sv-finder-h') }));
await page.fill('#svFindQ', 'bung'); await page.waitForTimeout(200);
const f1 = await page.evaluate(() => ({ rows: document.querySelectorAll('.sv-finder-row').length, first: (document.querySelector('.sv-finder-row') || {}).textContent }));
await page.check('#svFindTest'); await page.waitForTimeout(200);
const f2 = await page.evaluate(() => ({ rows: document.querySelectorAll('.sv-finder-row').length, first: (document.querySelector('.sv-finder-row') || {}).textContent }));
console.log('finder', JSON.stringify({ f0, f1, f2 }));
await page.click('#svModalClose');
// new survey → context strip for pen (inks), hidden for select, chips for devices
await page.click('#svSurveyBtn'); await page.waitForTimeout(100); const menu = await page.evaluate(() => ({ open: !document.querySelector('#svSurveyMenu').hidden, items: Array.from(document.querySelectorAll('#svSurveyMenu .btn')).map(b => b.textContent.trim()) }));
await page.click('#svNew'); await page.waitForTimeout(2000);
const ctx1 = await page.evaluate(() => ({ palette: !document.querySelector('#svPalette').hidden, inks: !document.querySelector('#svCtxInks').hidden, swatchTxt: Array.from(document.querySelectorAll('.sv-swatch')).map(s => s.textContent).join(','), inkName: document.querySelector('#svInkName').textContent, toolNow: document.querySelector('#svToolNow').textContent, menuClosed: document.querySelector('#svSurveyMenu').hidden, where: document.querySelector('#svWhere').textContent }));
await page.click('[data-tool="select"]'); const ctx2 = await page.evaluate(() => ({ palette: !document.querySelector('#svPalette').hidden, toolNow: document.querySelector('#svToolNow').textContent }));
await page.click('[data-tool="mark"]'); const ctx3 = await page.evaluate(() => ({ palette: !document.querySelector('#svPalette').hidden, chips: !document.querySelector('#svMarks').hidden, inks: !document.querySelector('#svCtxInks').hidden }));
await page.click('#svMoreBtn'); await page.waitForTimeout(100); const more = await page.evaluate(() => ({ open: !document.querySelector('#svMoreMenu').hidden, pins: document.querySelectorAll('#svPinsMenu .sv-pin-item').length }));
await page.click('#svPinsMenu .sv-pin-item:nth-child(1)'); await page.waitForTimeout(100);
const pinState = await page.evaluate(() => ({ tool: SurveyApp.ink().getTool(), toolNow: document.querySelector('#svToolNow').textContent, moreActive: document.querySelector('#svMoreBtn').classList.contains('active'), menuClosed: document.querySelector('#svMoreMenu').hidden }));
console.log('menu', JSON.stringify(menu), '\nctx', JSON.stringify({ ctx1, ctx2, ctx3 }), '\nmore', JSON.stringify(more), JSON.stringify(pinState));
await page.click('[data-tool="pen"]'); await page.screenshot({ path: 'shot-v12.png' });
// saving sheet
await page.click('#svSync'); await page.waitForTimeout(300); const sv = await page.evaluate(() => ({ title: document.querySelector('#svModalTitle').textContent, text: document.querySelector('#svModalBody p').textContent.slice(0, 80) })); await page.click('#svModalClose');
// finish
await page.click('#svFinish'); await page.waitForTimeout(300); const fin = await page.evaluate(() => ({ title: document.querySelector('#svModalTitle').textContent, steps: Array.from(document.querySelectorAll('.sv-step h4')).map(h => h.textContent), li: document.querySelectorAll('.sv-step li').length })); await page.screenshot({ path: 'shot-v12-finish.png' }); await page.click('#svModalClose');
// focus
await page.click('#svFocus'); await page.waitForTimeout(300); const foc = await page.evaluate(() => ({ on: document.body.classList.contains('sv-focus'), chip: getComputedStyle(document.querySelector('#svFocusChip')).display, pagesHidden: getComputedStyle(document.querySelector('#svPages')).display })); await page.screenshot({ path: 'shot-v12-focus.png' }); await page.click('#svFocusExit');
// page ⋯ menu
await page.click('#svPageBtn'); const pm = await page.evaluate(() => ({ open: !document.querySelector('#svPageMenu').hidden, items: Array.from(document.querySelectorAll('#svPageMenu .btn')).filter(b => !b.hidden).map(b => b.textContent.trim()) }));
console.log('saving', JSON.stringify(sv), '\nfinish', JSON.stringify(fin), '\nfocus', JSON.stringify(foc), '\npagemenu', JSON.stringify(pm));
console.log('errors', errs);
await browser.close();

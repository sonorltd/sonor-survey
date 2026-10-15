import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 1024 } })).newPage();
const errs = [], ext = new Set(); page.on('pageerror', e => errs.push(e.message)); page.on('request', r => { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1') ext.add(u.hostname); });
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/demo/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(5000);
const st = await page.evaluate(() => ({ pid: SurveyApp.state.pid, sess: SurveyApp.state.session && SurveyApp.state.session.title, pages: SurveyApp.state.pages.map(p => p.title.slice(0, 22)), proj: (window.SonorProjectBar.getProject() || {}).client_name, links: Array.from(document.querySelectorAll('a[href]')).filter(a => a.offsetParent !== null && !/^#/.test(a.getAttribute('href'))).map(a => a.getAttribute('href')).slice(0, 8), tag: !!document.querySelector('.sv-demo-tag') }));
console.log(JSON.stringify(st)); console.log('external hosts:', Array.from(ext));
const i = await page.evaluate(() => SurveyApp.state.pages.findIndex(p => p.floor_code === 'GF'));
await page.evaluate(i => SurveyApp.openPage(SurveyApp.state.pages[i].id), i); await page.waitForTimeout(4000); await page.screenshot({ path: 'demo-gf.png' });
// draw + place + report
await page.evaluate(() => SurveyApp.setTool('pen')); const box = await page.locator('#svCanvas canvas').first().boundingBox();
await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 500, box.y + 360, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(2500);
console.log('after drawing:', await page.evaluate(() => ({ strokes: SurveyApp.ink().getPage().strokes.length, sync: document.querySelector('#svSync').textContent.trim() })));
const pdf = await page.evaluate(async () => { const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: SurveyApp.projectRow ? await SurveyApp.projectRow() : { id: SurveyApp.state.pid, name: '31 Prestbury Road' }, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('demo-report.pdf', Buffer.from(pdf)); console.log('pdf', pdf.length, 'errors', errs, 'external hosts now:', Array.from(ext));
await browser.close();

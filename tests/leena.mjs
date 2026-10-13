import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=dbe32b1a-e799-43be-815b-8b4fdf53487a&session=8a5ad576-7f45-4b85-8874-5a1160a61eaa', { waitUntil: 'networkidle' }); await page.waitForTimeout(4000);
const st = await page.evaluate(() => ({ sess: SurveyApp.state.session && SurveyApp.state.session.title, pages: SurveyApp.state.pages.map(p => [p.seq, p.kind, p.title, (p.metadata || {}).category, (p.ink.marks || []).length]) }));
console.log(JSON.stringify(st));
const ids = await page.evaluate(() => SurveyApp.state.pages.map(p => p.id));
for (let i = 0; i < ids.length; i++) { await page.evaluate(id => SurveyApp.openPage(id), ids[i]); await page.waitForTimeout(i < 4 ? 6000 : 2500); await page.screenshot({ path: 'leena-' + i + '.png' }); }
const pdf = await page.evaluate(async () => { const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: p.kind === 'checklist' ? null : await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: { id: SurveyApp.state.pid, name: 'ENQ - 31 Prestbury Road, Wilmslow', ref: 'ENQ' }, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('report-leena.pdf', Buffer.from(pdf)); console.log('pdf', pdf.length, 'errors', errs);
await browser.close();

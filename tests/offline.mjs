import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const URL = 'http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=dbe32b1a-e799-43be-815b-8b4fdf53487a&session=8a5ad576-7f45-4b85-8874-5a1160a61eaa';
await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForTimeout(5000);
// open every page once online so photos / plans land in IndexedDB
await page.waitForTimeout(12000);   // warmOffline() does the pulling now — nothing opened by hand
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); const c = await caches.keys(); const cache = await caches.open(c[0] || 'x'); const keys = (await cache.keys()).map(k => k.url); return { reg: !!r, caches: c, n: keys.length, vendor: keys.filter(k => /jsdelivr|cdnjs|github\.io/.test(k)).length, projCache: (localStorage.getItem('sonor_projects_cache') || '').length }; });
console.log('sw', JSON.stringify(sw));
// --- now no signal: reload the same deep link ---
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' }).catch(e => console.log('reload', e.message)); await page.waitForTimeout(9000);
const st = await page.evaluate(() => ({ online: navigator.onLine, proj: (window.SonorProjectBar.getProjects() || []).length, name: (window.SonorProjectBar.getProject() || {}).name, sess: SurveyApp.state.session && SurveyApp.state.session.title, pages: SurveyApp.state.pages.length, sync: document.querySelector('#svSync') && document.querySelector('#svSync').textContent.trim() }));
console.log('offline', JSON.stringify(st));
const ids2 = await page.evaluate(() => SurveyApp.state.pages.map(p => [p.id, p.kind]));
for (const [id, kind] of ids2) { if (kind === 'photo' || kind === 'plan') { await page.evaluate(id => SurveyApp.openPage(id), id); await page.waitForTimeout(2500); break; } }
await page.evaluate(() => SurveyApp.openPage(SurveyApp.state.pages[3].id)); await page.waitForTimeout(3000); await page.screenshot({ path: 'offline-plan.png' });
await page.evaluate(() => SurveyApp.openPage(SurveyApp.state.pages[6].id)); await page.waitForTimeout(3000); await page.screenshot({ path: 'offline-photo.png' });
// draw a stroke offline → outbox
await page.evaluate(() => SurveyApp.setTool('pen')); const box = await page.locator('#svCanvas canvas').first().boundingBox();
await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 500, box.y + 400, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(1500);
const pend = await page.evaluate(async () => ({ pending: (await SurveyStore.outboxAll()).length, sync: document.querySelector('#svSync') && document.querySelector('#svSync').textContent.trim() }));
console.log('offline edit', JSON.stringify(pend));
// remove page confirm sheet
await page.evaluate(() => SurveyApp.openPage(SurveyApp.state.pages[0].id)); await page.waitForTimeout(800);
await page.click('#svPageBtn'); await page.click('#svRemove'); await page.waitForTimeout(300);
console.log('remove sheet', await page.evaluate(() => ({ open: !document.querySelector('#svModal').hidden, title: document.querySelector('#svModalTitle').textContent })));
await page.click('#rmGo'); await page.waitForTimeout(1000);
console.log('after remove', await page.evaluate(() => SurveyApp.state.pages.map(p => p.title).slice(0, 3)));
await ctx.setOffline(false); await page.waitForTimeout(9000);
const after = await page.evaluate(async () => ({ pending: (await SurveyStore.outboxAll()).length, sync: document.querySelector('#svSync') && document.querySelector('#svSync').textContent.trim() }));
console.log('back online', JSON.stringify(after));
const pdf = await page.evaluate(async () => { const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: p.kind === 'checklist' ? null : await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: { id: SurveyApp.state.pid, name: 'ENQ - 31 Prestbury Road, Wilmslow', ref: 'ENQ' }, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('report-leena.pdf', Buffer.from(pdf)); console.log('pdf', pdf.length, 'errors', errs);
await browser.close();

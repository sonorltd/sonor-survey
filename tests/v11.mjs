import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.click('#svSurveyBtn'); await page.click('#svNew'); await page.waitForTimeout(2000);
await page.evaluate(() => SurveyApp.addPage('plan', { floor_id: 'fhnyskasbyr7d', floor_code: 'GF', title: 'Ground floor', plan_ref: { plan_id: null } })); await page.waitForTimeout(1200);
const box = await page.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
// palette order = service order
console.log('palette', await page.evaluate(() => Array.from(document.querySelectorAll('.sv-mark-chip')).slice(0, 8).map(b => b.dataset.code).join(' ')));
await page.click('[data-tool="mark"]'); for (const [code, dx, dy] of [['sock', -300, -150], ['cspk', -200, -150], ['tv', 250, -120], ['pj', 300, 60]]) { await page.click('.sv-mark-chip[data-code="' + code + '"]'); await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(80); }
// TEXT tool: tap, type, Enter
await page.click('#svMoreBtn'); await page.click('[data-tool="text"]'); await page.mouse.click(cx - 320, cy + 40); await page.waitForTimeout(200);
const edOpen = await page.evaluate(() => !!document.querySelector('.sv-text-ed'));
await page.keyboard.type('Ceiling height 2.6m'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('existing coving'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
let objs = await page.evaluate(() => SurveyApp.ink().getPage().objects.map(o => ({ kind: o.kind, text: o.text, size: o.size, w: o.w, h: Math.round(o.h) })));
console.log('text created', edOpen, JSON.stringify(objs));
// edit via Select + Edit text button
await page.click('[data-tool="select"]'); const tpos = await page.evaluate(() => { const o = SurveyApp.ink().getPage().objects[0]; return SurveyApp.ink().pageToScreen(o.x + 20, o.y + 10); });
await page.mouse.click(box.x + tpos[0], box.y + tpos[1]); await page.waitForTimeout(150);
const editVisible = await page.evaluate(() => !document.querySelector('#svTextEdit').hidden);
await page.click('#svTextEdit'); await page.waitForTimeout(150); await page.keyboard.press('Control+End'); await page.keyboard.type(' (ok)'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
objs = await page.evaluate(() => SurveyApp.ink().getPage().objects.map(o => o.text));
console.log('text edited', editVisible, JSON.stringify(objs));
// PINS: open menu, pick RFI, tap, sheet appears, type text + to, save
await page.click('#svMoreBtn'); await page.waitForTimeout(150);
const menuItems = await page.evaluate(() => Array.from(document.querySelectorAll('.sv-pin-item b')).map(b => b.textContent));
await page.click('.sv-pin-item:nth-child(1)'); await page.waitForTimeout(150);
await page.mouse.click(cx + 100, cy + 150); await page.waitForTimeout(300);
const sheet = await page.evaluate(() => ({ open: !document.querySelector('#svModal').hidden, title: document.querySelector('#svModalTitle').textContent, tool: SurveyApp.ink().getTool(), marks: SurveyApp.ink().getPage().marks.map(m => m.kind + ':' + (m.pin || m.code)), menuHidden: document.querySelector('#svPinsMenu').hidden }));
console.log('sheet', JSON.stringify(sheet)); console.log('ta box', await page.locator('.sv-pin-text').boundingBox(), await page.evaluate(() => { const t = document.querySelector('.sv-pin-text'); const cs = getComputedStyle(t); return [cs.display, cs.visibility, cs.opacity, t.offsetWidth, t.offsetHeight, getComputedStyle(document.querySelector('#svModal')).display]; }));
await page.fill('.sv-pin-text', 'Confirm ceiling void depth for in-ceiling speakers'); await page.fill('.sv-pin-to', 'Architect'); await page.click('.sv-pin-ok'); await page.waitForTimeout(300);
// second RFI + a client comment
await page.mouse.click(cx - 100, cy + 200); await page.waitForTimeout(300); console.log('2nd', await page.evaluate(() => ({ modal: !document.querySelector('#svModal').hidden, tool: SurveyApp.ink().getTool(), marks: SurveyApp.ink().getPage().marks.filter(m => m.kind === 'pin').map(m => [m.pin, m.n, m.text]), textEd: !!SurveyApp.state.textEd }))); await page.fill('.sv-pin-text', 'Is the rear wall load-bearing?'); await page.click('.sv-pin-ok'); await page.waitForTimeout(200);
await page.click('#svMoreBtn'); await page.click('.sv-pin-item:nth-child(2)'); await page.mouse.click(cx + 200, cy + 200); await page.waitForTimeout(200); await page.fill('.sv-pin-text', 'Wants the TV above the fireplace'); await page.click('.sv-pin-ok'); await page.waitForTimeout(1800);
const pins = await page.evaluate(() => SurveyApp.ink().getPage().marks.filter(m => m.kind === 'pin').map(m => [m.pin, m.n, m.text, m.to]));
console.log('menu', menuItems.join(' | '), '\nsheet', JSON.stringify(sheet), '\npins', JSON.stringify(pins));
await page.screenshot({ path: 'shot-v11.png' });
// report
const pdf = await page.evaluate(async () => { const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: p.kind === 'checklist' ? null : await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: { id: SurveyApp.state.pid, name: 'Bungalow Trial', ref: 'SON-2026-BGTRL', client_name: 'Trial', address: '6 Rosebery Road' }, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('report-v11.pdf', Buffer.from(pdf));
// publish → plan_notes mirror
await page.waitForTimeout(2500);
const pn = await page.evaluate(async () => { await SurveyStore.publishSummary(SurveyApp.state.pid); const r = await (new window.SonorDB()).client.from('projects').select('metadata').eq('id', SurveyApp.state.pid).maybeSingle(); const m = r.data.metadata; return { survey_pins: (m.survey_summary.pins || []).length, notes: Object.keys(m.plan_notes.sections).map(k => k + ':' + m.plan_notes.sections[k].filter(n => n.source === 'survey').map(n => n.text + (n.is_rfi ? ' [RFI→' + n.to + ']' : '')).join(' / ')) }; });
console.log('plan_notes', JSON.stringify(pn));
console.log('pdf bytes', pdf.length, 'errors', errs);
await browser.close();

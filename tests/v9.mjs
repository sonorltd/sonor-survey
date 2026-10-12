import { chromium } from 'playwright'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
// fresh session so the report is small
await page.click('#svNew'); await page.waitForTimeout(2000);
await page.evaluate(() => SurveyApp.addPage('plan', { floor_id: 'fhnyskasbyr7d', floor_code: 'GF', title: 'Ground floor', plan_ref: { plan_id: null } })); await page.waitForTimeout(1200);
const planIdx = await page.evaluate(() => SurveyApp.state.pages.findIndex(p => p.id === SurveyApp.state.page.id));
const box = await page.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.click('[data-tool="mark"]');
for (const [code, dx, dy] of [['cspk', -300, -150], ['cspk', -200, -150], ['cspk', -100, -150], ['tv', 250, -120], ['lkp', 300, 60], ['trv', -320, 120], ['pend', 0, 0], ['wall', -150, 100], ['sock', 150, 150], ['ap', 60, -200]]) { await page.click('.sv-mark-chip[data-code="' + code + '"]'); await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(80); }
// photo image file
const mkPhoto = (label, col) => page.evaluate(async ([label, col]) => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 1200, 900); x.fillStyle = '#fff'; x.font = 'bold 90px sans-serif'; x.fillText(label, 100, 480); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .85)); const buf = await b.arrayBuffer(); return Array.from(new Uint8Array(buf)); }, [label, col]);
async function pinPhoto(dx, dy, label, col) {
  // make sure we are on the plan page
  await page.click('#svPages .sv-thumb:nth-child(' + (planIdx + 1) + ')'); await page.waitForTimeout(600);
  await page.click('[data-tool="photopin"]'); await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(300);
  const pending = await page.evaluate(() => SurveyApp.state.pendingPhotoMark);
  const bytes = await mkPhoto(label, col);
  await page.setInputFiles('#svPhotoIn', { name: label + '.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes) }); await page.waitForTimeout(1800);
  return pending;
}
console.log('pins', await pinPhoto(-250, 40, 'LOUNGE WALL', '#5a7a9a'), await pinPhoto(200, -40, 'TV WALL', '#7a5a5a'), await pinPhoto(-50, 170, 'CONSUMER UNIT', '#4f6b4f'), await pinPhoto(320, -200, 'LOFT HATCH', '#6b5a7a'), await pinPhoto(-350, -60, 'FRONT DOOR', '#7a6a4a'));
// draw on the last photo page
await page.click('[data-tool="pen"]'); await page.mouse.move(cx - 100, cy - 50); await page.mouse.down(); await page.mouse.move(cx + 100, cy + 50, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(600);
// name a photo page room
await page.evaluate(() => { const pg = SurveyApp.state.page; pg.room = 'Hall'; pg.title = 'Front door photo'; });
const st = await page.evaluate(() => ({ pages: SurveyApp.state.pages.map(p => [p.kind, p.title, !!(p.metadata && p.metadata.plan_pin)]), marks: SurveyApp.state.pages.find(p => p.kind === 'plan').ink.marks.map(m => m.code + (m.photo_page_id ? '*' : '')) }));
console.log(JSON.stringify(st));
const pdf = await page.evaluate(async () => { const pages = []; for (const p of SurveyApp.state.pages) pages.push({ row: p, model: p.kind === 'checklist' ? null : await SurveyApp.pageModel(p) }); const bytes = await SurveyPdf.report({ project: { id: SurveyApp.state.pid, name: 'Bungalow Trial', ref: 'SON-2026-BGTRL', client_name: 'Trial', address: '6 Rosebery Road' }, session: SurveyApp.state.session, pages, engineer: 'Bryn' }); return Array.from(bytes); });
fs.writeFileSync('report-v9.pdf', Buffer.from(pdf)); console.log('pdf bytes', pdf.length, 'errors', errs);
await browser.close();

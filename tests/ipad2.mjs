import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'], viewport: { width: 1366, height: 1024 } }); const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=b7c40775-31ee-47e9-9720-be880f7d4d88', { waitUntil: 'networkidle' }); await page.waitForTimeout(5000);
const i = await page.evaluate(() => SurveyApp.state.pages.findIndex(p => p.floor_code === 'GF'));
await page.evaluate(i => SurveyApp.openPage(SurveyApp.state.pages[i].id), i); await page.waitForTimeout(8000);
console.log(await page.evaluate(() => { const r = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; }; return { projectBar: r('#projectBarHost'), header: r('#sonor-header'), stage: r('.sv-stage'), canvas: r('#svCanvas canvas'), scroll: document.documentElement.scrollHeight === window.innerHeight }; }));
await page.screenshot({ path: 'ipad2.png' }); await browser.close();

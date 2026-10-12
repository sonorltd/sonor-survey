import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const dev of ['iPad Pro 11 landscape', 'iPad Pro 11', 'iPhone 14 Pro']) {
  const ctx = await browser.newContext({ ...devices[dev] }); const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
  const m = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; }; return { inner: [innerWidth, innerHeight], scrollH: document.documentElement.scrollHeight, bodyH: document.body.scrollHeight, bodyDisplay: getComputedStyle(document.body).display, bodyOverflow: getComputedStyle(document.body).overflow, header: r('#sonor-header'), pbar: r('#projectBarHost'), top: r('.sv-bar-top'), tools: r('.sv-bar-tools'), body: r('.sv-body'), stage: r('.sv-stage'), canvas: r('#svCanvas'), empty: r('#svEmpty') }; });
  console.log(dev, JSON.stringify(m));
  await page.screenshot({ path: 'ipad-' + dev.replace(/\W+/g, '_') + '.png' });
  await ctx.close();
}
await browser.close();

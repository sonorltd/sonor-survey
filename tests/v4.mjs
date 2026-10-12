import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8765/APP%20-%20Survey/dashboard/sonor-survey.html?pid=ce20bee2-c58a-4df9-bf75-59bc5a588b04', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
console.log('SI delegate', await page.evaluate(() => !!window.SonorInk && SonorInk.VERSION));
await page.evaluate(() => SurveyApp.addPage('blank')); await page.waitForTimeout(1200);
const box = await page.locator('#svCanvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
for (let k = 0; k < 2; k++) { await page.mouse.move(cx - 100, cy + k * 40); await page.mouse.down(); for (let i = 0; i < 15; i++) await page.mouse.move(cx - 100 + i * 12, cy + k * 40 + Math.sin(i) * 20); await page.mouse.up(); await page.waitForTimeout(2200); }
await page.waitForTimeout(2500);
await page.click('#svHistory'); await page.waitForTimeout(1500);
const hist = await page.evaluate(() => ({ title: document.querySelector('#svModalTitle').textContent, rows: document.querySelectorAll('.sv-hist').length, cur: document.querySelector('#svModalBody .muted').textContent }));
console.log('history', hist);
await page.click('.sv-hist .btn'); await page.waitForTimeout(800); console.log('preview img', await page.evaluate(() => !!document.querySelector('.sv-hist img')));
await page.click('.sv-hist .btn:nth-child(2)'); await page.click('.sv-hist .btn:nth-child(2)'); await page.waitForTimeout(2500);
console.log('after restore strokes', await page.evaluate(() => SurveyApp.state.page.ink.strokes.length), 'errors', errs);
await browser.close();

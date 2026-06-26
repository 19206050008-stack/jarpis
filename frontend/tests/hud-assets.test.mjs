#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('.dock button[title="AI Chat"]');
  await page.waitForSelector('.popup-window .window-header', { timeout: 30000 });

  const s = await page.evaluate(() => {
    const el = document.querySelector('.popup-window');
    const header = document.querySelector('.window-header');
    const title = document.querySelector('.window-header .title');
    const cs = (x) => getComputedStyle(x);
    return {
      panelClip: cs(el).clipPath,
      panelRadius: cs(el).borderRadius,
      headerClip: cs(header).clipPath,
      headerText: title.textContent,
      headerColor: cs(header).backgroundImage,
      titleUpper: cs(title).textTransform,
    };
  });

  if (!s.panelClip.includes('polygon')) throw new Error(`Panel belum pakai bentuk HUD miring: ${JSON.stringify(s)}`);
  if (!s.headerClip.includes('polygon')) throw new Error(`Header belum miring seperti referensi: ${JSON.stringify(s)}`);
  if (s.panelRadius !== '0px') throw new Error(`Panel masih rounded, bukan asset referensi: ${JSON.stringify(s)}`);
  if (!/linear-gradient/.test(s.headerColor)) throw new Error(`Header belum gradient neon: ${JSON.stringify(s)}`);
  if (!/Anta|ANTA/.test(s.headerText || '')) throw new Error(`Bahasa lokal hilang: ${JSON.stringify(s)}`);
  console.log('✓ HUD assets match: angled neon panels, localized title, no rounded card chrome');
} finally {
  await browser.close();
}

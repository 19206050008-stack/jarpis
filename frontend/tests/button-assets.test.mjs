#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.dock.orbit-menu button', { timeout: 30000 });
  await page.click('.dock.orbit-menu button[title="AI Chat"]');
  await page.waitForSelector('.dock.popup-dock button', { timeout: 30000 });

  const data = await page.evaluate(() => [...document.querySelectorAll('.dock.popup-dock button')].map((button) => {
    const cs = getComputedStyle(button);
    const svg = button.querySelector('svg');
    const icon = svg ? getComputedStyle(svg) : null;
    return {
      clip: cs.clipPath,
      bg: cs.backgroundImage,
      border: cs.borderTopColor,
      shadow: cs.boxShadow,
      radius: cs.borderRadius,
      w: button.getBoundingClientRect().width,
      h: button.getBoundingClientRect().height,
      iconShadow: icon?.filter || '',
    };
  }));

  if (data.length < 2) throw new Error(`Dock buttons missing: ${JSON.stringify(data)}`);
  for (const b of data) {
    if (!b.clip.includes('polygon')) throw new Error(`Button not angled HUD shape: ${JSON.stringify(b)}`);
    if (!/linear-gradient/.test(b.bg)) throw new Error(`Button missing blue neon gradient: ${JSON.stringify(b)}`);
    if (b.radius !== '0px') throw new Error(`Button still rounded, not reference chip: ${JSON.stringify(b)}`);
    if (!/drop-shadow/.test(b.iconShadow)) throw new Error(`Icon missing neon glow: ${JSON.stringify(b)}`);
    if (b.w < 54 || b.h < 42) throw new Error(`Button too small for reference asset: ${JSON.stringify(b)}`);
  }

  console.log('✓ Popup dock button assets match: angled blue HUD chips with glowing icons');
} finally {
  await browser.close();
}

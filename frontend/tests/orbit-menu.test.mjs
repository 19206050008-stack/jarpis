#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.dock.orbit-menu button', { timeout: 30000 });

  const closed = await page.evaluate(() => {
    const rect = (s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    };
    const buttons = [...document.querySelectorAll('.dock.orbit-menu button')].map((b) => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const line = getComputedStyle(b, '::after');
      return { x: r.x, y: r.y, w: r.width, h: r.height, radius: cs.borderRadius, bg: cs.backgroundImage, shadow: cs.boxShadow, lineBg: line.backgroundImage, lineW: line.width };
    });
    return { orb: rect('.orb-equalizer'), dock: rect('.dock'), buttons };
  });

  if (closed.buttons.length !== 2) throw new Error(`Expected 2 orbit buttons: ${JSON.stringify(closed)}`);
  for (const b of closed.buttons) {
    if (b.x < closed.orb.right + 18) throw new Error(`Button overlaps orb: ${JSON.stringify(closed)}`);
    if (Math.abs(b.w - b.h) > 1 || b.radius !== '50%') throw new Error(`Button not round: ${JSON.stringify(b)}`);
    if (!/radial-gradient/.test(b.bg)) throw new Error(`Button not orb-colored radial: ${JSON.stringify(b)}`);
    if (!/rgb/.test(b.shadow)) throw new Error(`Button missing glow: ${JSON.stringify(b)}`);
    if (!/linear-gradient/.test(b.lineBg) || parseFloat(b.lineW) < 40) throw new Error(`Button missing magnetic line: ${JSON.stringify(b)}`);
  }
  if (Math.abs(closed.dock.cy - closed.orb.cy) > 120) throw new Error(`Menu not beside orbit: ${JSON.stringify(closed)}`);

  await page.click('.dock.orbit-menu button[title="AI Chat"]');
  await page.waitForSelector('.dock.popup-dock', { timeout: 30000 });
  const open = await page.evaluate(() => {
    const r = document.querySelector('.dock.popup-dock').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottomGap: innerHeight - r.bottom, row: getComputedStyle(document.querySelector('.dock.popup-dock')).flexDirection };
  });
  if (open.y < 650 || open.row !== 'row') throw new Error(`Popup dock did not return to bottom dock: ${JSON.stringify(open)}`);

  console.log('✓ Orbit menu: round magnetic buttons beside orb, docked when popup opens');
} finally {
  await browser.close();
}

#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.dock.orbit-menu button', { timeout: 30000 });

  await page.screenshot({ path: 'orbit-menu-check.png' });
  const closed = await page.evaluate(() => {
    const rect = (s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    };
    const buttons = [...document.querySelectorAll('.dock.orbit-menu button')].map((b) => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const line = getComputedStyle(b, '::after');
      const icon = b.querySelector('svg').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, radius: cs.borderRadius, bg: cs.backgroundImage, shadow: cs.boxShadow, lineDisplay: line.display, iconW: icon.width, iconH: icon.height };
    });
    return { orb: rect('.orb-equalizer'), dock: rect('.dock'), buttons };
  });

  if (closed.buttons.length !== 2) throw new Error(`Expected 2 orbit buttons: ${JSON.stringify(closed)}`);
  for (const b of closed.buttons) {
    if (b.x < closed.orb.right + 40) throw new Error(`Button too close / overlaps orb: ${JSON.stringify(closed)}`);
    if (Math.abs(b.w - b.h) > 1 || b.radius !== '50%') throw new Error(`Button not round: ${JSON.stringify(b)}`);
    if (!/radial-gradient/.test(b.bg)) throw new Error(`Button not orb-colored radial: ${JSON.stringify(b)}`);
    if (!/rgb/.test(b.shadow)) throw new Error(`Button missing glow: ${JSON.stringify(b)}`);
    if (b.lineDisplay !== 'none') throw new Error(`Icon button line still visible: ${JSON.stringify(b)}`);
    if (b.w > 36 || b.h > 36) throw new Error(`Button still too large: ${JSON.stringify(b)}`);
    if (b.iconW > 14 || b.iconH > 14) throw new Error(`Icon still too large: ${JSON.stringify(b)}`);
  }
  if (Math.abs(closed.dock.cy - closed.orb.cy) > 20) throw new Error(`Menu not exactly beside orbit: ${JSON.stringify(closed)}`);
  const dockLine = await page.locator('.dock.orbit-menu').evaluate((el) => getComputedStyle(el, '::before').display);
  if (dockLine !== 'none') throw new Error('Dock connector line still visible');

  await page.click('.dock.orbit-menu button[title="AI Chat"]');
  await page.waitForSelector('.dock.popup-dock', { timeout: 30000 });
  const open = await page.evaluate(() => {
    const r = document.querySelector('.dock.popup-dock').getBoundingClientRect();
    const b = document.querySelector('.dock.popup-dock button').getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector('.dock.popup-dock button'));
    return { x: r.x, y: r.y, w: r.width, h: r.height, bw: b.width, bh: b.height, radius: cs.borderRadius, row: getComputedStyle(document.querySelector('.dock.popup-dock')).flexDirection };
  });
  if (open.row !== 'column' || open.radius !== '50%' || open.bw > 36) throw new Error(`Desktop popup controls must stay round beside orb: ${JSON.stringify(open)}`);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 780 } });
  await mobile.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mobile.click('.dock.orbit-menu button[title="AI Chat"]');
  await mobile.waitForSelector('.dock.popup-dock', { timeout: 30000 });
  const m = await mobile.evaluate(() => {
    const r = document.querySelector('.dock.popup-dock').getBoundingClientRect();
    return { y: r.y, row: getComputedStyle(document.querySelector('.dock.popup-dock')).flexDirection };
  });
  await mobile.close();
  if (m.y < 650 || m.row !== 'row') throw new Error(`Mobile popup controls did not become bottom dock: ${JSON.stringify(m)}`);

  console.log('✓ Orbit menu: desktop stays round beside orb; mobile popup becomes dock');
} finally {
  await browser.close();
}

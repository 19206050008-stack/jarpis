#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 945 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.jarvis-orb', { timeout: 30000 });
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      if (!r) throw new Error(`${selector} not found`);
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    };
    const lines = [...document.querySelectorAll('.jarvis-eq line')].map((line) => line.getBoundingClientRect());
    const minX = Math.min(...lines.map((r) => r.x));
    const maxX = Math.max(...lines.map((r) => r.x + r.width));
    const minY = Math.min(...lines.map((r) => r.y));
    const maxY = Math.max(...lines.map((r) => r.y + r.height));
    return {
      orb: box('.jarvis-orb'),
      core: box('.jarvis-core'),
      main: box('.jarvis-ring.main'),
      bars: { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 },
    };
  });

  const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const gap = (data.bars.w - data.main.w) / 2;
  if (dist(data.core, data.main) > 1 || dist(data.core, data.bars) > 1) throw new Error(`Orb centers not aligned: ${JSON.stringify(data)}`);
  if (gap < 2 || gap > 14) throw new Error(`Equalizer gap not snug: ${gap}px ${JSON.stringify(data)}`);

  console.log(`✓ Orb aligned. gap=${gap.toFixed(1)}px center=(${data.core.cx.toFixed(1)}, ${data.core.cy.toFixed(1)})`);
} finally {
  await browser.close();
}

#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.subtitle-bubble', { timeout: 30000 });

  const data = await page.evaluate(() => {
    const box = (s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, bottom: r.y + r.height };
    };
    const bubble = document.querySelector('.subtitle-bubble');
    const cs = getComputedStyle(bubble);
    const before = getComputedStyle(bubble, '::before');
    const after = getComputedStyle(bubble, '::after');
    return {
      orb: box('.orb-equalizer'),
      subtitle: box('.subtitle-bubble'),
      width: cs.width,
      maxWidth: cs.maxWidth,
      clip: cs.clipPath,
      bg: cs.backgroundImage,
      border: cs.borderTopColor,
      beforeDisplay: before.display,
      beforeBg: before.backgroundImage,
      afterDisplay: after.display,
      afterBorder: after.borderTopColor,
      textAlign: cs.textAlign,
    };
  });

  if (data.subtitle.y < data.orb.bottom + 18) throw new Error(`Subtitle overlaps orb: ${JSON.stringify(data)}`);
  if (!data.clip.includes('polygon')) throw new Error(`Subtitle is not angled HUD box: ${JSON.stringify(data)}`);
  if (!/linear-gradient/.test(data.bg)) throw new Error(`Subtitle missing HUD gradient: ${JSON.stringify(data)}`);
  if (data.beforeDisplay === 'none' || !/linear-gradient/.test(data.beforeBg)) throw new Error(`Subtitle missing top title strip/line: ${JSON.stringify(data)}`);
  if (data.afterDisplay === 'none' || !/rgb/.test(data.afterBorder)) throw new Error(`Subtitle missing speaking connector line: ${JSON.stringify(data)}`);
  if (data.subtitle.w < 178 || data.subtitle.w > 560) throw new Error(`Subtitle width not content-bounded: ${JSON.stringify(data)}`);

  console.log('✓ Subtitle UI match: angled HUD box, below orb, connector line, content width');
} finally {
  await browser.close();
}

#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.orb-equalizer.movable', { timeout: 30000 });

  const before = await page.locator('.center-container').boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 60);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const after = await page.locator('.center-container').boundingBox();
  if (Math.abs(after.x - before.x) < 20 && Math.abs(after.y - before.y) < 20) throw new Error('Orb is not freely draggable by default');

  const subtitleAnim = await page.locator('.subtitle-bubble').evaluate((el) => getComputedStyle(el).animationName);
  if (!subtitleAnim.includes('subtitle-float')) throw new Error(`Subtitle is not idly floating: ${subtitleAnim}`);

  console.log('✓ Orb free by default and subtitle idle float is alive');
} finally {
  await browser.close();
}

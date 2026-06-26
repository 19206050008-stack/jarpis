#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.orb-equalizer.locked', { timeout: 30000 });

  const before = await page.locator('.center-container').boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 160, before.y + before.height / 2 + 80);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const locked = await page.locator('.center-container').boundingBox();
  if (Math.abs(locked.x - before.x) > 2 || Math.abs(locked.y - before.y) > 2) throw new Error('Orb moved while locked');

  await page.click('.dock button[title="AI Chat"]');
  await page.fill('.form input', 'bisa geser orb');
  await page.click('.form button');
  await page.waitForSelector('.orb-equalizer.movable', { timeout: 30000 });

  const movable = await page.locator('.orb-equalizer').evaluate((el) => getComputedStyle(el).cursor);
  if (movable !== 'grab') throw new Error(`Orb not movable after command, cursor=${movable}`);

  console.log('✓ Orb locked by default, movable only after command');
} finally {
  await browser.close();
}

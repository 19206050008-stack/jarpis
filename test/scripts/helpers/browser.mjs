import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../../frontend/node_modules/playwright');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

export async function createBrowser(viewport = { width: 1365, height: 900 }) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport });
  return { browser, page };
}

export async function navigateAndWait(page, timeout = 15000) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.orb-equalizer', { timeout });
}

export async function openChat(page) {
  const btn = await page.$('.dock.orbit-menu button[title="AI Chat"]');
  if (btn) await btn.click();
  else await page.evaluate(() => document.querySelector('.dock button')?.click());
  await page.waitForSelector('.chat-window', { timeout: 3000 }).catch(() => {});
}

export async function sendChatMessage(page, text) {
  await page.fill('.form input', text);
  await page.click('.form button:last-of-type');
  await page.waitForTimeout(500);
}

export async function waitForAiResponse(page, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const msgs = await page.$$('.msg.ai');
    const last = msgs[msgs.length - 1];
    if (last) {
      const text = await last.textContent();
      if (text && !text.includes('mengetik')) return text;
    }
    await page.waitForTimeout(500);
  }
  return null;
}

export async function setMobileViewport(page) {
  await page.setViewportSize({ width: 375, height: 812 });
}

export async function setDesktopViewport(page) {
  await page.setViewportSize({ width: 1365, height: 900 });
}

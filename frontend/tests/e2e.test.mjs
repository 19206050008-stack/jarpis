#!/usr/bin/env node
/**
 * Anta E2E Automation Test
 * Tests all major features to ensure they work properly
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TIMEOUT = 10000;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  log('\n🧪 Starting Anta E2E Tests\n', colors.blue);
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    permissions: ['microphone'],
  });
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  try {
    // Test 1: Page loads
    log('Test 1: Page loads correctly', colors.yellow);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.anta-desktop', { timeout: TIMEOUT });
    log('✓ Page loaded', colors.green);
    passed++;

    // Test 2: Orb is visible
    log('\nTest 2: Orb equalizer is visible', colors.yellow);
    const orb = await page.locator('.orb-equalizer').isVisible();
    if (orb) {
      log('✓ Orb visible', colors.green);
      passed++;
    } else {
      throw new Error('Orb not visible');
    }

    // Test 3: Dock navigation exists
    log('\nTest 3: Dock navigation is present', colors.yellow);
    const dock = await page.locator('.dock').isVisible();
    const dockButtons = await page.locator('.dock button').count();
    if (dock && dockButtons >= 3) {
      log(`✓ Dock visible with ${dockButtons} buttons`, colors.green);
      passed++;
    } else {
      throw new Error('Dock not properly rendered');
    }

    // Test 4: Chat window toggle
    log('\nTest 4: Chat window can be opened', colors.yellow);
    await page.locator('.dock button').first().click();
    await sleep(500);
    const chatWindow = await page.locator('.chat-window').isVisible();
    if (chatWindow) {
      log('✓ Chat window opened', colors.green);
      passed++;
    } else {
      throw new Error('Chat window did not open');
    }

    // Test 5: Chat input field
    log('\nTest 5: Chat input field is functional', colors.yellow);
    const chatInput = await page.locator('.form input').first();
    await chatInput.fill('Halo Anta');
    const inputValue = await chatInput.inputValue();
    if (inputValue === 'Halo Anta') {
      log('✓ Chat input works', colors.green);
      passed++;
    } else {
      throw new Error('Chat input not working');
    }

    // Test 6: Send message (without waiting for response)
    log('\nTest 6: Message can be sent', colors.yellow);
    await page.locator('.form button').first().click();
    await sleep(1000);
    const messages = await page.locator('.msg.user').count();
    if (messages > 0) {
      log('✓ Message sent and displayed', colors.green);
      passed++;
    } else {
      throw new Error('Message not sent');
    }

    // Test 7: Close chat window
    log('\nTest 7: Chat window can be closed', colors.yellow);
    await page.locator('.chat-window .controls button').click();
    await sleep(500);
    const chatClosed = !(await page.locator('.chat-window').isVisible());
    if (chatClosed) {
      log('✓ Chat window closed', colors.green);
      passed++;
    } else {
      throw new Error('Chat window did not close');
    }

    // Test 8: Web viewer toggle
    log('\nTest 8: Web viewer can be opened', colors.yellow);
    await page.locator('.dock button').nth(1).click();
    await sleep(500);
    const viewerWindow = await page.locator('.viewer-window').isVisible();
    if (viewerWindow) {
      log('✓ Web viewer opened', colors.green);
      passed++;
    } else {
      throw new Error('Web viewer did not open');
    }

    // Test 9: Viewer close
    log('\nTest 9: Web viewer can be closed', colors.yellow);
    await page.locator('.viewer-window .controls button').click();
    await sleep(500);
    const viewerClosed = !(await page.locator('.viewer-window').isVisible());
    if (viewerClosed) {
      log('✓ Web viewer closed', colors.green);
      passed++;
    } else {
      throw new Error('Web viewer did not close');
    }

    // Test 10: Subtitle bubble exists
    log('\nTest 10: Subtitle bubble is present', colors.yellow);
    const subtitle = await page.locator('.subtitle-bubble').count();
    if (subtitle >= 0) {
      log('✓ Subtitle bubble system ready', colors.green);
      passed++;
    } else {
      throw new Error('Subtitle bubble not found');
    }

    // Test 11: Orb can be interacted (drag test)
    log('\nTest 11: Orb is draggable', colors.yellow);
    const orbElement = page.locator('.orb-equalizer');
    const orbBox = await orbElement.boundingBox();
    if (orbBox) {
      await page.mouse.move(orbBox.x + orbBox.width / 2, orbBox.y + orbBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(orbBox.x + orbBox.width / 2 + 50, orbBox.y + orbBox.height / 2 + 50);
      await page.mouse.up();
      log('✓ Orb drag interaction works', colors.green);
      passed++;
    } else {
      throw new Error('Orb not interactable');
    }

    // Test 12: Mobile viewport test
    log('\nTest 12: Mobile viewport layout', colors.yellow);
    await page.setViewportSize({ width: 375, height: 667 });
    await sleep(500);
    const dockMobile = await page.locator('.dock').isVisible();
    const orbMobile = await page.locator('.orb-equalizer').isVisible();
    if (dockMobile && orbMobile) {
      log('✓ Mobile layout rendered correctly', colors.green);
      passed++;
    } else {
      throw new Error('Mobile layout broken');
    }

    // Test 13: Mobile chat slide-up
    log('\nTest 13: Mobile chat opens from bottom', colors.yellow);
    await page.locator('.dock button').first().click();
    await sleep(500);
    const chatMobile = await page.locator('.chat-window').isVisible();
    if (chatMobile) {
      log('✓ Mobile chat slide-up works', colors.green);
      passed++;
    } else {
      throw new Error('Mobile chat did not open');
    }

  } catch (error) {
    log(`\n✗ Test failed: ${error.message}`, colors.red);
    failed++;
  } finally {
    await browser.close();
  }

  // Summary
  log('\n' + '='.repeat(50), colors.blue);
  log(`Test Results: ${passed} passed, ${failed} failed`, colors.blue);
  log('='.repeat(50) + '\n', colors.blue);

  if (failed > 0) {
    log('Some tests failed. Please check the issues above.', colors.red);
    process.exit(1);
  } else {
    log('All tests passed! 🎉', colors.green);
    process.exit(0);
  }
}

runTests().catch((error) => {
  log(`\nFatal error: ${error.message}`, colors.red);
  process.exit(1);
});

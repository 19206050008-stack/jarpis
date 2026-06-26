#!/usr/bin/env node
/**
 * Quick Button Test - Verify all buttons work
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function testButtons() {
  console.log('🧪 Testing all button functionality...\n');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.dock', { timeout: 5000 });

    // Test 1: Chat open button
    console.log('Test 1: Opening chat via dock button...');
    await page.locator('.dock button').first().click();
    await page.waitForTimeout(500);
    let chatVisible = await page.locator('.chat-window').isVisible();
    console.log(chatVisible ? '✓ Chat opened' : '✗ Chat failed to open');

    // Test 2: Chat close button (x)
    console.log('\nTest 2: Closing chat via X button...');
    const closeBtn = page.locator('.chat-window .controls button');
    const closeBtnVisible = await closeBtn.isVisible();
    console.log(`Close button visible: ${closeBtnVisible}`);
    
    if (closeBtnVisible) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(500);
      chatVisible = await page.locator('.chat-window').isVisible();
      console.log(!chatVisible ? '✓ Chat closed via X' : '✗ Chat X button not working');
    }

    // Test 3: Re-open and test again
    console.log('\nTest 3: Re-opening chat...');
    await page.locator('.dock button').first().click();
    await page.waitForTimeout(500);
    chatVisible = await page.locator('.chat-window').isVisible();
    console.log(chatVisible ? '✓ Chat re-opened' : '✗ Failed to re-open');

    // Test 4: Voice button
    console.log('\nTest 4: Voice button click...');
    await page.locator('.dock button').nth(1).click();
    await page.waitForTimeout(500);
    console.log('✓ Voice button clicked (no crash)');

    // Test 5: Desktop mode - check if all buttons are clickable
    console.log('\nTest 5: Desktop viewport - button accessibility...');
    await page.setViewportSize({ width: 1280, height: 720 });
    const allButtons = await page.locator('.dock button, .controls button').all();
    console.log(`Total buttons found: ${allButtons.length}`);
    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      const isClickable = await btn.isEnabled();
      console.log(`  Button ${i + 1}: ${isClickable ? 'clickable' : 'NOT clickable'}`);
    }

    // Test 6: Mobile mode - button accessibility
    console.log('\nTest 6: Mobile viewport - button accessibility...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const mobileButtons = await page.locator('.dock button, .controls button').all();
    console.log(`Mobile buttons found: ${mobileButtons.length}`);
    for (let i = 0; i < mobileButtons.length; i++) {
      const btn = mobileButtons[i];
      const isVisible = await btn.isVisible();
      const isClickable = await btn.isEnabled();
      console.log(`  Button ${i + 1}: visible=${isVisible}, clickable=${isClickable}`);
    }

    console.log('\n✅ Button test completed');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testButtons();

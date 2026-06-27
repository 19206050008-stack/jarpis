import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../../frontend/node_modules/playwright');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

export async function runBubbleSyncTest() {
  const results = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.orb-equalizer', { timeout: 10000 });

    // Wait for startup greeting to trigger
    console.log('  Waiting for greeting speech...');
    
    // Wait up to 8 seconds for subtitle to appear
    let t = Date.now();
    let subtitleAppeared = false;
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(500);
      const sub = await page.evaluate(() => {
        const el = document.querySelector('.subtitle-bubble');
        return el ? el.textContent : null;
      });
      if (sub && sub.length > 3) {
        subtitleAppeared = true;
        console.log(`  Subtitle appeared: "${sub.slice(0, 40)}..." (after ${Date.now() - t}ms)`);
        break;
      }
    }

    results.push({
      id: 'SYNC-001',
      scenario: 'Bubble Sync',
      name: 'Greeting bubble appears during speech',
      expected: 'Subtitle bubble appears within 8s of page load',
      actual: subtitleAppeared ? 'Appeared' : 'Did not appear',
      status: subtitleAppeared ? 'PASS' : 'FAIL',
      duration: Date.now() - t,
      notes: ''
    });

    // Check orb is orange (active) when bubble shows
    if (subtitleAppeared) {
      const orbActive = await page.evaluate(() => document.querySelector('.orb-equalizer')?.classList.contains('active'));
      results.push({
        id: 'SYNC-002',
        scenario: 'Bubble Sync',
        name: 'Orb orange while bubble visible',
        expected: 'Orb has .active class',
        actual: orbActive ? 'Active (orange)' : 'Not active',
        status: orbActive ? 'PASS' : 'FAIL',
        duration: 0,
        notes: ''
      });
    }

    // Wait for bubble to disappear (cleanup)
    t = Date.now();
    let bubbleCleared = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const sub = await page.evaluate(() => {
        const el = document.querySelector('.subtitle-bubble');
        return el ? el.textContent : null;
      });
      if (!sub || sub.length === 0) {
        bubbleCleared = true;
        break;
      }
    }

    results.push({
      id: 'SYNC-003',
      scenario: 'Bubble Sync',
      name: 'Bubble clears after speech ends',
      expected: 'Subtitle gone within 15s',
      actual: bubbleCleared ? 'Cleared' : 'Still showing',
      status: bubbleCleared ? 'PASS' : 'FAIL',
      duration: Date.now() - t,
      notes: ''
    });

    // After clear, orb should not be active
    if (bubbleCleared) {
      const orbStillActive = await page.evaluate(() => document.querySelector('.orb-equalizer')?.classList.contains('active'));
      results.push({
        id: 'SYNC-004',
        scenario: 'Bubble Sync',
        name: 'Orb back to normal after speech',
        expected: 'Orb not active',
        actual: orbStillActive ? 'Still active (BAD)' : 'Normal (cyan)',
        status: !orbStillActive ? 'PASS' : 'FAIL',
        duration: 0,
        notes: ''
      });
    }

  } finally {
    await browser.close();
  }

  // Print results
  console.log('\n  Bubble Sync Results:');
  results.forEach(r => console.log(`    ${r.status === 'PASS' ? '✓' : '✗'} ${r.name}: ${r.actual}`));
  
  return results;
}

// Run directly
runBubbleSyncTest().then(results => {
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n  ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
}).catch(e => { console.error(e); process.exitCode = 1; });

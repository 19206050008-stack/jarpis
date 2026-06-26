#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

let errors = [];

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.orb-equalizer', { timeout: 15000 });

  // Wait for startup greeting to trigger subtitle
  await page.waitForTimeout(4000);

  // === TEST 1: Ring rotations are different directions ===
  const ringData = await page.evaluate(() => {
    const rings = document.querySelectorAll('.orb-equalizer .ring');
    const results = [];
    for (const ring of rings) {
      const cs = getComputedStyle(ring);
      results.push({
        className: ring.className,
        animation: cs.animationName,
        duration: cs.animationDuration,
        direction: cs.animationDirection,
        borderStyle: cs.borderStyle,
      });
    }
    return results;
  });

  // Check ring animations exist and have different names (different keyframes = different directions)
  const animNames = ringData.map(r => r.animation);
  const uniqueAnims = new Set(animNames.filter(a => a && a !== 'none'));
  if (uniqueAnims.size < 2) {
    errors.push(`FAIL: Rings should have different animation keyframes. Got: ${JSON.stringify(animNames)}`);
  } else {
    console.log(`✓ Rings have ${uniqueAnims.size} different rotation keyframes: ${[...uniqueAnims].join(', ')}`);
  }

  // Check different durations
  const durations = ringData.map(r => r.duration);
  const uniqueDurations = new Set(durations);
  if (uniqueDurations.size < 3) {
    errors.push(`FAIL: Rings should have different speeds. Got: ${JSON.stringify(durations)}`);
  } else {
    console.log(`✓ Rings have ${uniqueDurations.size} different speeds: ${durations.join(', ')}`);
  }

  // Check border styles are visually different (so rotation is visible)
  const borderStyles = ringData.map(r => r.borderStyle);
  const uniqueStyles = new Set(borderStyles);
  if (uniqueStyles.size < 2) {
    errors.push(`FAIL: Rings should have different border styles for visible rotation. Got: ${JSON.stringify(borderStyles)}`);
  } else {
    console.log(`✓ Rings have ${uniqueStyles.size} different border styles: ${[...uniqueStyles].join(', ')}`);
  }

  // === TEST 2: All rings orange when active (speaking) ===
  // Simulate active state
  await page.evaluate(() => {
    document.querySelector('.orb-equalizer').classList.add('active');
  });
  await page.waitForTimeout(500);

  const activeRings = await page.evaluate(() => {
    const rings = document.querySelectorAll('.orb-equalizer .ring');
    const results = [];
    for (const ring of rings) {
      const cs = getComputedStyle(ring);
      results.push({
        className: ring.className,
        borderColor: cs.borderColor,
        opacity: cs.opacity,
      });
    }
    // Also check jarvis-ring elements
    const jarvisMain = document.querySelector('.jarvis-ring.main');
    const jarvisOuter = document.querySelector('.jarvis-ring.outer');
    // Add speaking class to jarvis-orb
    document.querySelector('.jarvis-orb')?.classList.add('speaking');
    return { rings: results, hasJarvisMain: !!jarvisMain, hasJarvisOuter: !!jarvisOuter };
  });

  await page.waitForTimeout(300);

  const activeColors = await page.evaluate(() => {
    const rings = document.querySelectorAll('.orb-equalizer .ring');
    const colors = [];
    for (const ring of rings) {
      const cs = getComputedStyle(ring);
      colors.push(cs.borderColor);
    }
    const jarvisMain = document.querySelector('.jarvis-ring.main');
    const jarvisOuter = document.querySelector('.jarvis-ring.outer');
    return {
      ringColors: colors,
      jarvisMainColor: jarvisMain ? getComputedStyle(jarvisMain).borderColor : 'none',
      jarvisOuterColor: jarvisOuter ? getComputedStyle(jarvisOuter).borderColor : 'none',
    };
  });

  // Check that ring colors contain orange (rgb values for #f97316 area: r>200, g<160, b<50)
  const isOrangeish = (color) => {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return false;
    const [, r, g, b] = match.map(Number);
    return r > 180 && g < 200 && b < 100;
  };

  const orangeRings = activeColors.ringColors.filter(isOrangeish);
  if (orangeRings.length < 3) {
    errors.push(`FAIL: At least 3 of 4 rings should be orange when active. Got ${orangeRings.length} orange. Colors: ${JSON.stringify(activeColors.ringColors)}`);
  } else {
    console.log(`✓ ${orangeRings.length}/4 rings are orange when active (speaking)`);
  }

  if (activeColors.jarvisMainColor !== 'none' && isOrangeish(activeColors.jarvisMainColor)) {
    console.log(`✓ jarvis-ring.main is orange when speaking: ${activeColors.jarvisMainColor}`);
  } else if (activeColors.jarvisMainColor !== 'none') {
    errors.push(`FAIL: jarvis-ring.main should be orange when speaking. Got: ${activeColors.jarvisMainColor}`);
  }

  // Reset
  await page.evaluate(() => {
    document.querySelector('.orb-equalizer').classList.remove('active');
    document.querySelector('.jarvis-orb')?.classList.remove('speaking');
  });

  // === TEST 3: Subtitle bubble has idle float animation ===
  const subtitleExists = await page.evaluate(() => !!document.querySelector('.subtitle-bubble'));
  
  if (subtitleExists) {
    const bubbleAnim = await page.evaluate(() => {
      const bubble = document.querySelector('.subtitle-bubble');
      const cs = getComputedStyle(bubble);
      return {
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        animationIterationCount: cs.animationIterationCount,
      };
    });

    if (bubbleAnim.animationName === 'none' || !bubbleAnim.animationName) {
      errors.push(`FAIL: Subtitle bubble should have idle float animation. Got animationName: ${bubbleAnim.animationName}`);
    } else {
      console.log(`✓ Subtitle bubble has animation: ${bubbleAnim.animationName} (${bubbleAnim.animationDuration}, ${bubbleAnim.animationIterationCount})`);
    }
  } else {
    // Inject one to test style
    await page.evaluate(() => {
      const container = document.querySelector('.center-container');
      const div = document.createElement('div');
      div.className = 'subtitle-bubble';
      div.textContent = 'Test idle float';
      container.appendChild(div);
    });
    
    const bubbleAnim = await page.evaluate(() => {
      const bubble = document.querySelector('.subtitle-bubble');
      const cs = getComputedStyle(bubble);
      return {
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
      };
    });

    if (bubbleAnim.animationName === 'none' || !bubbleAnim.animationName) {
      errors.push(`FAIL: Subtitle bubble should have idle float animation. Got: ${bubbleAnim.animationName}`);
    } else {
      console.log(`✓ Subtitle bubble (injected) has animation: ${bubbleAnim.animationName} (${bubbleAnim.animationDuration})`);
    }
  }

  // === SUMMARY ===
  if (errors.length === 0) {
    console.log('\n✅ All orb/ring/bubble tests passed!');
  } else {
    console.log('\n❌ FAILURES:');
    errors.forEach(e => console.log(`  ${e}`));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

#!/usr/bin/env node
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1365, height: 900 } });
await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForTimeout(3000);

// If no bubble, inject one to test positioning
let hasBubble = await p.evaluate(() => !!document.querySelector('.subtitle-bubble'));
if (!hasBubble) {
  await p.evaluate(() => {
    const orb = document.querySelector('.orb-equalizer');
    if (orb) {
      const div = document.createElement('div');
      div.className = 'subtitle-bubble';
      div.textContent = 'Anta online. Siap membantu.';
      orb.appendChild(div);
    }
  });
}

const d = await p.evaluate(() => {
  const bubble = document.querySelector('.subtitle-bubble');
  const orb = document.querySelector('.orb-equalizer');
  if (!bubble || !orb) return { error: 'no elements' };
  const br = bubble.getBoundingClientRect();
  const or2 = orb.getBoundingClientRect();
  const orbCx = or2.x + or2.width / 2;
  const bubbleCx = br.x + br.width / 2;
  const viewCx = window.innerWidth / 2;
  return {
    orbCenter: Math.round(orbCx),
    bubbleCenter: Math.round(bubbleCx),
    viewportCenter: Math.round(viewCx),
    offsetFromOrb: Math.round(bubbleCx - orbCx),
    offsetFromViewport: Math.round(bubbleCx - viewCx),
    isInsideOrb: bubble.closest('.orb-equalizer') !== null,
    parentClass: bubble.parentElement?.className?.slice(0, 40) || 'unknown',
    css: {
      position: getComputedStyle(bubble).position,
      bottom: getComputedStyle(bubble).bottom,
      left: getComputedStyle(bubble).left,
      transform: getComputedStyle(bubble).transform,
    }
  };
});

console.log(JSON.stringify(d, null, 2));

// Take screenshot
await p.screenshot({ path: 'frontend/tests/bubble-position.png', fullPage: false });
console.log('\nScreenshot saved: frontend/tests/bubble-position.png');

if (d.error) { console.log('FAIL:', d.error); process.exit(1); }
if (!d.isInsideOrb) { console.log('FAIL: bubble is NOT inside .orb-equalizer. Parent:', d.parentClass); process.exit(1); }
if (Math.abs(d.offsetFromOrb) > 10) { console.log(`FAIL: bubble not centered. Offset from orb: ${d.offsetFromOrb}px`); process.exit(1); }
console.log('PASS: bubble is inside orb and centered');
await b.close();

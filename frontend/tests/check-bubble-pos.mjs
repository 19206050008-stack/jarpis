#!/usr/bin/env node
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1365, height: 900 } });
await p.goto('https://antasiar.my.id', { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForTimeout(5000);
const d = await p.evaluate(() => {
  const bubble = document.querySelector('.subtitle-bubble');
  const orb = document.querySelector('.orb-equalizer');
  if (!bubble || !orb) return { error: 'no elements', hasBubble: !!bubble, hasOrb: !!orb };
  const br = bubble.getBoundingClientRect();
  const or2 = orb.getBoundingClientRect();
  const orbCx = or2.x + or2.width / 2;
  const bubbleCx = br.x + br.width / 2;
  const viewCx = window.innerWidth / 2;
  return {
    orbCenter: Math.round(orbCx),
    bubbleCenter: Math.round(bubbleCx),
    viewportCenter: Math.round(viewCx),
    bubbleOffsetFromOrb: Math.round(bubbleCx - orbCx),
    bubbleOffsetFromViewport: Math.round(bubbleCx - viewCx),
    bubbleIsInsideOrb: bubble.closest('.orb-equalizer') !== null,
    bubbleParent: bubble.parentElement?.className || 'unknown',
    bubblePosition: getComputedStyle(bubble).position,
    bubbleLeft: getComputedStyle(bubble).left,
    bubbleBottom: getComputedStyle(bubble).bottom,
    bubbleTransform: getComputedStyle(bubble).transform,
  };
});
console.log(JSON.stringify(d, null, 2));
if (d.error) { console.log('ERROR:', d.error); process.exit(1); }
if (Math.abs(d.bubbleOffsetFromOrb) > 15) {
  console.log(`FAIL: bubble not centered on orb. Offset: ${d.bubbleOffsetFromOrb}px`);
  process.exit(1);
}
console.log('OK: bubble is centered under orb');
await b.close();

#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Subtitle should be hidden when not speaking
  const subtitleVisible = await page.evaluate(() => {
    return document.querySelector('.subtitle-bubble') !== null;
  });
  if (subtitleVisible) throw new Error('Subtitle should be hidden when AI is not speaking');
  console.log('✓ Subtitle hidden when not speaking');

  // Inject a subtitle to test styling
  await page.evaluate(() => {
    const container = document.querySelector('.center-container');
    const div = document.createElement('div');
    div.className = 'subtitle-bubble';
    div.textContent = 'Ini adalah teks subtitle percobaan untuk mengetes kotak.';
    container.appendChild(div);
  });

  const data = await page.evaluate(() => {
    const bubble = document.querySelector('.subtitle-bubble');
    const cs = getComputedStyle(bubble);
    const before = getComputedStyle(bubble, '::before');
    const after = getComputedStyle(bubble, '::after');
    const rect = bubble.getBoundingClientRect();
    return {
      w: rect.width,
      h: rect.height,
      clip: cs.clipPath,
      bg: cs.backgroundImage,
      borderColor: cs.borderColor,
      borderWidth: cs.borderWidth,
      borderStyle: cs.borderStyle,
      beforeContent: before.content,
      beforeInset: before.inset,
      afterContent: after.content,
      afterBg: after.backgroundImage || after.background,
      padding: cs.padding,
      textContent: bubble.textContent,
    };
  });

  // 1. Must have polygon clip-path (angled sci-fi corners)
  if (!data.clip.includes('polygon')) throw new Error(`Missing polygon clip-path for angled corners: clip=${data.clip}`);
  console.log('✓ Subtitle has polygon clip-path (angled sci-fi corners)');

  // 2. Must have gradient background (dark navy)
  if (!/linear-gradient/.test(data.bg)) throw new Error(`Missing dark gradient background: bg=${data.bg}`);
  console.log('✓ Subtitle has dark gradient background');

  // 3. Border must be bright blue/cyan (rgb values for #00bfff area)
  // #00bfff = rgb(0, 191, 255)
  if (!/rgb\(0,\s*191,\s*255\)/.test(data.borderColor)) throw new Error(`Border color should be bright cyan (#00bfff): got ${data.borderColor}`);
  console.log('✓ Subtitle border is bright cyan (#00bfff)');

  // 4. Border width should be 2px (thick visible border like the reference)
  if (!data.borderWidth.includes('2px')) throw new Error(`Border should be 2px thick: got ${data.borderWidth}`);
  console.log('✓ Subtitle border is 2px thick');

  // 5. Inner border (::before) should exist as inner frame
  if (data.beforeContent === 'none') throw new Error('Missing inner border frame (::before)');
  console.log('✓ Subtitle has inner border frame (::before pseudo-element)');

  // 6. Top accent line (::after) with gradient
  if (data.afterContent === 'none') throw new Error('Missing top accent line (::after)');
  console.log('✓ Subtitle has top accent line (::after)');

  // 7. No title text in pseudo-elements
  if (data.beforeContent.includes('ANTA') || data.beforeContent.includes('BICARA')) throw new Error('Subtitle should NOT have title text');
  console.log('✓ Subtitle has no title text');

  // 8. Test stretching with long text
  await page.evaluate(() => {
    const bubble = document.querySelector('.subtitle-bubble');
    bubble.textContent = 'Ini adalah teks yang sangat panjang sekali untuk memastikan bahwa kotak subtitle bisa merenggang dengan baik tanpa rusak atau terbelah satu sama lain ketika kontennya bertambah panjang.';
  });

  const longData = await page.evaluate(() => {
    const bubble = document.querySelector('.subtitle-bubble');
    const rect = bubble.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  });

  if (longData.h < data.h) throw new Error(`Subtitle should stretch vertically for long text: short=${data.h}px, long=${longData.h}px`);
  console.log(`✓ Subtitle stretches with long text (short: ${Math.round(data.h)}px → long: ${Math.round(longData.h)}px)`);

  // 9. Test with short text — should be compact
  await page.evaluate(() => {
    const bubble = document.querySelector('.subtitle-bubble');
    bubble.textContent = 'Halo.';
  });

  const shortData = await page.evaluate(() => {
    const bubble = document.querySelector('.subtitle-bubble');
    const rect = bubble.getBoundingClientRect();
    return { w: rect.width };
  });

  if (shortData.w >= longData.w) throw new Error(`Subtitle should be narrower with short text: short=${shortData.w}px vs long=${longData.w}px`);
  console.log(`✓ Subtitle compact with short text (${Math.round(shortData.w)}px < ${Math.round(longData.w)}px)`);

  console.log('\n✅ All subtitle UI tests passed!');
} finally {
  await browser.close();
}

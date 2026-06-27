import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../../frontend/node_modules/playwright');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function runPurpleOrbTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.orb-equalizer', { timeout: 10000 });
    await page.waitForTimeout(4000); // wait for greeting

    // Directly add .listening class to test purple rendering
    await page.evaluate(() => {
      document.querySelector('.orb-equalizer')?.classList.add('listening');
    });
    await page.waitForTimeout(300);

    // Check orb has .listening class
    const hasListening = await page.evaluate(() => document.querySelector('.orb-equalizer')?.classList.contains('listening'));
    console.log(`Orb .listening class: ${hasListening ? 'YES' : 'NO'}`);

    // Check computed colors of all elements
    const colors = await page.evaluate(() => {
      const results = {};
      const orb = document.querySelector('.orb-equalizer');
      if (!orb) return { error: 'no orb' };
      
      // Core
      const core = orb.querySelector('.core');
      if (core) results.core = getComputedStyle(core).background.slice(0, 80);
      
      // Rings
      const rings = orb.querySelectorAll('.ring');
      results.rings = Array.from(rings).map(r => getComputedStyle(r).borderColor);
      
      // Jarvis inner elements
      const jCore = document.querySelector('.jarvis-core');
      if (jCore) results.jarvisCore = getComputedStyle(jCore).background.slice(0, 80);
      
      const jRingMain = document.querySelector('.jarvis-ring.main');
      if (jRingMain) results.jarvisRingMain = getComputedStyle(jRingMain).borderColor;
      
      const jRingOuter = document.querySelector('.jarvis-ring.outer');
      if (jRingOuter) results.jarvisRingOuter = getComputedStyle(jRingOuter).borderColor;
      
      const eqLines = document.querySelectorAll('.jarvis-eq line');
      if (eqLines.length) results.eqLineStroke = getComputedStyle(eqLines[0]).stroke;
      
      const hudNodes = document.querySelectorAll('.hud-node');
      if (hudNodes.length) results.hudNodeStroke = getComputedStyle(hudNodes[0]).stroke;
      
      const hudCircles = document.querySelectorAll('.hud-circle');
      if (hudCircles.length) results.hudCircleStroke = getComputedStyle(hudCircles[0]).stroke;

      return results;
    });

    console.log('\nComputed colors when .listening:');
    console.log(JSON.stringify(colors, null, 2));

    // Check if purple (rgb values containing 124,58,237 or 167,139,250 or 124)
    const isPurple = (color) => {
      if (!color) return false;
      return color.includes('124') || color.includes('139') || color.includes('168') || color.includes('167');
    };

    let allPurple = true;
    const checks = [];

    // Check rings
    if (colors.rings) {
      const purpleRings = colors.rings.filter(isPurple);
      checks.push({ name: 'Outer rings purple', pass: purpleRings.length >= 3, detail: `${purpleRings.length}/${colors.rings.length}` });
      if (purpleRings.length < 3) allPurple = false;
    }

    // Check jarvis ring main
    if (colors.jarvisRingMain) {
      const pass = isPurple(colors.jarvisRingMain);
      checks.push({ name: 'Jarvis ring main purple', pass, detail: colors.jarvisRingMain });
      if (!pass) allPurple = false;
    }

    // Check jarvis ring outer
    if (colors.jarvisRingOuter) {
      const pass = isPurple(colors.jarvisRingOuter);
      checks.push({ name: 'Jarvis ring outer purple', pass, detail: colors.jarvisRingOuter });
      if (!pass) allPurple = false;
    }

    // Check eq lines
    if (colors.eqLineStroke) {
      const pass = isPurple(colors.eqLineStroke);
      checks.push({ name: 'EQ lines purple', pass, detail: colors.eqLineStroke });
      if (!pass) allPurple = false;
    }

    // Check hud nodes
    if (colors.hudNodeStroke) {
      const pass = isPurple(colors.hudNodeStroke);
      checks.push({ name: 'HUD nodes purple', pass, detail: colors.hudNodeStroke });
      if (!pass) allPurple = false;
    }

    // Check hud circles
    if (colors.hudCircleStroke) {
      const pass = isPurple(colors.hudCircleStroke);
      checks.push({ name: 'HUD circles purple', pass, detail: colors.hudCircleStroke });
      if (!pass) allPurple = false;
    }

    console.log('\nResults:');
    checks.forEach(c => console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}: ${c.detail}`));
    console.log(`\n  Overall: ${allPurple ? 'ALL PURPLE ✓' : 'NOT ALL PURPLE ✗'}`);
    
    if (!allPurple) process.exitCode = 1;

  } finally {
    await browser.close();
  }
}

runPurpleOrbTest().catch(e => { console.error(e); process.exitCode = 1; });

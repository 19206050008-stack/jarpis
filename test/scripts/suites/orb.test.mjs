import { createBrowser, navigateAndWait } from '../helpers/browser.mjs';

export async function runOrbTests() {
  const results = [];
  const { browser, page } = await createBrowser();

  try {
    await navigateAndWait(page);

    // TC-001: Orb visible at center
    let t = Date.now();
    try {
      const data = await page.evaluate(() => {
        const orb = document.querySelector('.orb-equalizer');
        if (!orb) return null;
        const r = orb.getBoundingClientRect();
        return { cx: r.x + r.width / 2, vw: window.innerWidth };
      });
      const offset = Math.abs(data.cx - data.vw / 2);
      results.push({ id: 'TC-001', scenario: 'SC-001', name: 'Orb visible at center', expected: 'Orb centered (offset<30px)', actual: `Offset: ${Math.round(offset)}px`, status: offset < 30 ? 'PASS' : 'FAIL', duration: Date.now() - t, notes: '' });
    } catch (e) { results.push({ id: 'TC-001', scenario: 'SC-001', name: 'Orb visible at center', expected: 'Orb centered', actual: 'Error', status: 'FAIL', duration: Date.now() - t, notes: e.message }); }

    // TC-002: Orb idle breathing
    t = Date.now();
    try {
      const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.orb-equalizer')).animationName);
      results.push({ id: 'TC-002', scenario: 'SC-001', name: 'Orb idle breathing animation', expected: 'animationName=orb-idle', actual: `animationName=${anim}`, status: anim.includes('orb-idle') ? 'PASS' : 'FAIL', duration: Date.now() - t, notes: '' });
    } catch (e) { results.push({ id: 'TC-002', scenario: 'SC-001', name: 'Orb idle breathing', expected: 'orb-idle', actual: 'Error', status: 'FAIL', duration: Date.now() - t, notes: e.message }); }

    // TC-003: Rings spinning different directions
    t = Date.now();
    try {
      const rings = await page.evaluate(() => {
        const els = document.querySelectorAll('.orb-equalizer .ring');
        return Array.from(els).map(el => ({ anim: getComputedStyle(el).animationName, dur: getComputedStyle(el).animationDuration, border: getComputedStyle(el).borderStyle }));
      });
      const uniqueAnims = new Set(rings.map(r => r.anim).filter(a => a !== 'none'));
      const uniqueDurs = new Set(rings.map(r => r.dur));
      const pass = uniqueAnims.size >= 2 && uniqueDurs.size >= 3;
      results.push({ id: 'TC-003', scenario: 'SC-001', name: 'Rings spinning different', expected: '>=2 keyframes, >=3 speeds', actual: `${uniqueAnims.size} keyframes, ${uniqueDurs.size} speeds`, status: pass ? 'PASS' : 'FAIL', duration: Date.now() - t, notes: '' });
    } catch (e) { results.push({ id: 'TC-003', scenario: 'SC-001', name: 'Rings spinning', expected: 'Different', actual: 'Error', status: 'FAIL', duration: Date.now() - t, notes: e.message }); }

    // TC-004: Orb orange when speaking
    t = Date.now();
    try {
      await page.evaluate(() => {
        document.querySelector('.orb-equalizer')?.classList.add('active');
        document.querySelector('.jarvis-orb')?.classList.add('speaking');
      });
      await page.waitForTimeout(200);
      const color = await page.evaluate(() => {
        const ring = document.querySelector('.jarvis-ring.main');
        return ring ? getComputedStyle(ring).borderColor : 'none';
      });
      const isOrange = /rgb\(249/.test(color);
      results.push({ id: 'TC-004', scenario: 'SC-001', name: 'Orb turns orange', expected: 'Ring border orange', actual: color, status: isOrange ? 'PASS' : 'FAIL', duration: Date.now() - t, notes: '' });
      await page.evaluate(() => {
        document.querySelector('.orb-equalizer')?.classList.remove('active');
        document.querySelector('.jarvis-orb')?.classList.remove('speaking');
      });
    } catch (e) { results.push({ id: 'TC-004', scenario: 'SC-001', name: 'Orb orange', expected: 'Orange', actual: 'Error', status: 'FAIL', duration: Date.now() - t, notes: e.message }); }

  } finally { await browser.close(); }
  return results;
}

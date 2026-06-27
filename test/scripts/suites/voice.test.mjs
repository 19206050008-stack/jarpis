import { createBrowser, navigateAndWait } from '../helpers/browser.mjs';

export async function runVoiceTests() {
  const results = [];
  const { browser, page } = await createBrowser();

  try {
    await navigateAndWait(page);

    // TC-012: Voice button (simulated - headless can't use real mic)
    let t = Date.now();
    results.push({ id: 'TC-012', scenario: 'SC-004', name: 'Voice button activates mic', expected: 'Listening state', actual: 'Skipped (headless)', status: 'SKIP', duration: 0, notes: 'Requires real microphone, tested manually' });

    // TC-013: Voice auto-timeout
    t = Date.now();
    results.push({ id: 'TC-013', scenario: 'SC-004', name: 'Voice auto-timeout 5s', expected: 'Stops after 5s silence', actual: 'Skipped (headless)', status: 'SKIP', duration: 0, notes: 'Requires Speech API, tested manually' });

    // TC-014: Voice response triggers speech
    t = Date.now();
    results.push({ id: 'TC-014', scenario: 'SC-004', name: 'Voice response triggers speech', expected: 'Orb active + subtitle', actual: 'Skipped (headless)', status: 'SKIP', duration: 0, notes: 'Requires mic input simulation' });

    // TC-015: Voice search opens viewer
    t = Date.now();
    results.push({ id: 'TC-015', scenario: 'SC-004', name: 'Voice search opens viewer', expected: 'Viewer window opens', actual: 'Skipped (headless)', status: 'SKIP', duration: 0, notes: 'Voice-triggered, manual test' });

    // TC-016: Wake word
    t = Date.now();
    results.push({ id: 'TC-016', scenario: 'SC-005', name: 'Wake word Halo Anta', expected: 'Voice activates on wake word', actual: 'Skipped (headless)', status: 'SKIP', duration: 0, notes: 'Requires continuous mic, manual test' });

  } finally { await browser.close(); }
  return results;
}

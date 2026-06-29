import { createBrowser, navigateAndWait, openChat, sendChatMessage, waitForAiResponse } from '../helpers/browser.mjs';

export async function runChatTests() {
  const results = [];
  const { browser, page } = await createBrowser();

  try {
    await navigateAndWait(page);

    // TC-008: Chat opens
    let t = Date.now();
    try {
      await openChat(page);
      const exists = await page.$('.chat-window');
      results.push({ id: 'TC-008', scenario: 'SC-003', name: 'Chat opens on button click', expected: '.chat-window visible', actual: exists ? 'Visible' : 'Not found', status: exists ? 'PASS' : 'FAIL', duration: Date.now() - t, notes: '' });
    } catch (e) { results.push({ id: 'TC-008', scenario: 'SC-003', name: 'Chat opens', expected: 'Visible', actual: 'Error', status: 'FAIL', duration: Date.now() - t, notes: e.message }); }

    // TC-009: Send message
    t = Date.now();
    try {
      await sendChatMessage(page, 'jam berapa sekarang');
      const response = await waitForAiResponse(page, 15000);
      results.push({ id: 'TC-009', scenario: 'SC-003', name: 'Send message in chat', expected: 'AI responds with time', actual: response ? response.slice(0, 60) : 'No response', status: response ? 'PASS' : 'FAIL', duration: Date.now() - t, notes: '' });
    } catch (e) { results.push({ id: 'TC-009', scenario: 'SC-003', name: 'Send message', expected: 'Response', actual: 'Error', status: 'FAIL', duration: Date.now() - t, notes: e.message }); }

    // TC-010: Chat no speech
    t = Date.now();
    try {
      const hasActive = await page.evaluate(() => document.querySelector('.orb-equalizer')?.classList.contains('active'));
      results.push({ id: 'TC-010', scenario: 'SC-003', name: 'Chat does NOT trigger speech', expected: 'Orb not active', actual: hasActive ? 'Active (BAD)' : 'Not active', status: !hasActive ? 'PASS' : 'FAIL', duration: Date.now() - t, notes: '' });
    } catch (e) { results.push({ id: 'TC-010', scenario: 'SC-003', name: 'Chat no speech', expected: 'Silent', actual: 'Error', status: 'FAIL', duration: Date.now() - t, notes: e.message }); }

    // TC-011: Close chat
    t = Date.now();
    try {
      await page.click('.chat-window .controls button');
      await page.waitForTimeout(500);
      const gone = !(await page.$('.chat-window'));
      results.push({ id: 'TC-011', scenario: 'SC-003', name: 'Chat close button works', expected: 'Chat removed', actual: gone ? 'Removed' : 'Still visible', status: gone ? 'PASS' : 'FAIL', duration: Date.now() - t, notes: '' });
    } catch (e) { results.push({ id: 'TC-011', scenario: 'SC-003', name: 'Close chat', expected: 'Closed', actual: 'Error', status: 'FAIL', duration: Date.now() - t, notes: e.message }); }

  } finally { await browser.close(); }
  return results;
}

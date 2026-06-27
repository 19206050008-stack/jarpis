import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';

async function waitPort(port) {
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/' }, (res) => resolve());
        req.on('error', reject);
        req.end();
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 250));
    }
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

async function run() {
  console.log('Starting dev server...');
  const dev = spawn('npm', ['run', 'dev'], { cwd: 'frontend', shell: true });
  dev.stdout.on('data', (d) => console.log('DEV:', d.toString().trim()));
  dev.stderr.on('data', (d) => console.error('DEV_ERR:', d.toString().trim()));

  try {
    await waitPort(3000);
    console.log('Dev server ready. Launching Playwright...');

    const browser = await chromium.launch({ headless: true });
    
    // Test 1: Desktop Chat Close Button Alignment
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto('http://localhost:3000');
    
    // Open chat
    await page.click('button[title="AI Chat"]');
    await page.waitForSelector('.chat-window');
    
    // Get close button rect & layout
    const btnInfo = await page.evaluate(() => {
      const btn = document.querySelector('.chat-window .controls button');
      const rect = btn.getBoundingClientRect();
      const svg = btn.querySelector('svg').getBoundingClientRect();
      const style = getComputedStyle(btn);
      return {
        btn: { x: rect.x, y: rect.y, w: rect.width, h: rect.height, padding: style.padding, display: style.display },
        svg: { x: svg.x, y: svg.y, w: svg.width, h: svg.height }
      };
    });
    console.log('Desktop Chat Close Button Info:', btnInfo);
    
    // Calculate off-center delta
    const btnCx = btnInfo.btn.x + btnInfo.btn.w / 2;
    const btnCy = btnInfo.btn.y + btnInfo.btn.h / 2;
    const svgCx = btnInfo.svg.x + btnInfo.svg.w / 2;
    const svgCy = btnInfo.svg.y + btnInfo.svg.h / 2;
    const dx = Math.abs(btnCx - svgCx);
    const dy = Math.abs(btnCy - svgCy);
    console.log(`Alignment offset - X-axis: ${dx.toFixed(2)}px, Y-axis: ${dy.toFixed(2)}px`);
    
    await page.screenshot({ path: 'screenshot-desktop-chat.png' });

    // Test 2: Mobile Voice Action
    const mobile = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await mobile.goto('http://localhost:3000');
    
    // Open chat on mobile
    await mobile.click('.dock button[title="AI Chat"]');
    await mobile.waitForSelector('.chat-window');
    
    // Click voice button inside the chat form on mobile
    console.log('Clicking voice button on mobile...');
    await mobile.click('.form button.voice-btn-mobile');
    
    // Wait for animation
    await new Promise(r => setTimeout(r, 500));
    
    // Check if chat closed and voice is listening
    const mState = await mobile.evaluate(() => {
      const chat = document.querySelector('.chat-window');
      const isListening = document.querySelector('.orb-equalizer').classList.contains('listening');
      return { chatVisible: !!chat, isListening };
    });
    console.log('Mobile state after voice click:', mState);
    await mobile.screenshot({ path: 'screenshot-mobile-voice.png' });
    
    await browser.close();
    
    if (dx > 1 || dy > 1) {
      throw new Error(`Close button icon is off-center by DX=${dx} DY=${dy}`);
    }
    if (mState.chatVisible || !mState.isListening) {
      throw new Error(`Mobile voice did not close chat or start listening: ${JSON.stringify(mState)}`);
    }
    
    console.log('✓ Verification successful!');
  } finally {
    dev.kill();
  }
}

run().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});

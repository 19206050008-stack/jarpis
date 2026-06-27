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
  const dev = spawn('npm', ['run', 'dev'], { cwd: 'frontend', shell: true });
  try {
    await waitPort(3000);
    const browser = await chromium.launch({ headless: true });
    const mobile = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await mobile.goto('http://localhost:3000');
    
    // Open chat on mobile
    await mobile.click('.dock button[title="AI Chat"]');
    await mobile.waitForSelector('.chat-window');
    
    // Take screenshot of mobile chat open
    await mobile.screenshot({ path: 'screenshot-mobile-chat-open.png' });
    
    // Get orb bounding rect
    const rect = await mobile.evaluate(() => {
      const orb = document.querySelector('.orb-equalizer');
      const r = orb.getBoundingClientRect();
      const style = getComputedStyle(orb.parentElement);
      return { x: r.x, y: r.y, w: r.width, h: r.height, parentTop: style.top, parentTransform: style.transform, parentPosition: style.position, parentZIndex: style.zIndex };
    });
    console.log('Orb Rect on Mobile Chat Open:', rect);
    
    await browser.close();
  } finally {
    dev.kill();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

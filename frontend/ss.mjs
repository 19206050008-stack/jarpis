import { chromium } from 'playwright';
const browser = await chromium.launch();

async function ss(command, filename, mobile = false) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true }
    : { viewport: { width: 1440, height: 900 } }
  );
  const page = await ctx.newPage();
  await page.addInitScript((cmd) => {
    class M { lang=''; interimResults=false; continuous=false; onresult=null; onend=null; onerror=null;
      start() { setTimeout(() => { if(this.onresult) this.onresult({results:{length:1,0:{0:{transcript:cmd},isFinal:true}}}); }, 200); setTimeout(() => { if(this.onend) this.onend(); }, 400); }
      stop() { if(this.onend) this.onend(); }
    }
    window.SpeechRecognition = M; window.webkitSpeechRecognition = M;
  }, command);
  await page.goto('http://127.0.0.1:3001', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.click('.shader-frame button', { force: true });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `../${filename}` });
  console.log(`  ${filename}`);
  await ctx.close();
}

// Home
async function ssHome(filename, mobile = false) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true }
    : { viewport: { width: 1440, height: 900 } }
  );
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3001', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `../${filename}` });
  console.log(`  ${filename}`);
  await ctx.close();
}

console.log('Home:');
await ssHome('ss-home-desktop.png');
await ssHome('ss-home-mobile.png', true);

console.log('Desktop panels:');
await ss('buka menu', 'ss-d-menu.png');
await ss('buka spotify', 'ss-d-spotify.png');
await ss('buka youtube', 'ss-d-youtube.png');
await ss('buka google', 'ss-d-google.png');
await ss('buka notepad', 'ss-d-notepad.png');
await ss('buka folder', 'ss-d-folder.png');

console.log('Mobile panels:');
await ss('buka menu', 'ss-m-menu.png', true);
await ss('buka spotify', 'ss-m-spotify.png', true);
await ss('buka youtube', 'ss-m-youtube.png', true);
await ss('buka google', 'ss-m-google.png', true);
await ss('buka notepad', 'ss-m-notepad.png', true);
await ss('buka folder', 'ss-m-folder.png', true);

await browser.close();
console.log('All done. Screenshots in jarpis/ folder.');

import { spawn } from 'child_process';
import http from 'http';
import httpx from 'http'; // we'll use node http natively to test

async function waitPort(port) {
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/health' }, (res) => resolve());
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
  console.log('Starting Python Backend...');
  const backend = spawn('python', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], { cwd: 'backend', shell: true });
  backend.stdout.on('data', (d) => console.log('BACKEND:', d.toString().trim()));
  backend.stderr.on('data', (d) => console.error('BACKEND_ERR:', d.toString().trim()));

  try {
    await waitPort(8000);
    console.log('Backend is alive! Testing /images?q=kucing endpoint...');
    
    const images = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:8000/images?q=kucing', (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    console.log('Image Search Results count:', images.length);
    if (images.length === 0) {
      throw new Error('Image search returned 0 results! Regex or search parser is broken.');
    }
    
    console.log('First image result:', images[0]);
    console.log('✓ Image search verified successfully!');
  } finally {
    backend.kill();
  }
}

run().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});

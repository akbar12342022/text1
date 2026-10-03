// render.mjs — deterministic frame renderer: scene.html seek(t) → PNG → ffmpeg image2pipe → libx264
// usage: node render.mjs [--frames N] [--start S] [--out path] [--stills DIR --times 0,1,2,...]
// Playwright location: override with PLAYWRIGHT_PATH on another machine (default is this host's preinstalled copy)
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FPS = 30, W = 1920, H = 1080, TOTAL = 900;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = parseInt(arg('--frames', String(TOTAL)), 10);
const START = parseInt(arg('--start', '0'), 10);
const OUT = resolve(HERE, arg('--out', 'out/video-only.mp4'));
const STILLS = arg('--stills', null);
const TIMES = (arg('--times', '') || '').split(',').filter(Boolean).map(Number);

mkdirSync(dirname(OUT), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto('file://' + resolve(HERE, 'scene.html'));
await page.evaluate(() => window.ready);

if (STILLS) {
  // preview mode: write one PNG per requested time (default every whole second)
  mkdirSync(STILLS, { recursive: true });
  const times = TIMES.length ? TIMES : Array.from({ length: 30 }, (_, i) => i);
  for (const t of times) {
    await page.evaluate(t => window.seek(t), t);
    const buf = await page.screenshot({ type: 'png' });
    writeFileSync(resolve(STILLS, `t_${t.toFixed(2).replace('.', '_')}.png`), buf);
  }
  await browser.close();
  console.log('stills', times.length, '->', STILLS);
  process.exit(0);
}

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-r', String(FPS), '-movflags', '+faststart', OUT],
  { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let i = START; i < START + N && i < TOTAL; i++) {
  await page.evaluate(t => window.seek(t), i / FPS);
  const buf = await page.screenshot({ type: 'png' });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if ((i - START) % 60 === 0) console.log(`frame ${i}/${TOTAL}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
ff.stdin.end();
const code = await new Promise(r => ff.on('close', r));
await browser.close();
if (code !== 0) { console.error('ffmpeg exit', code); process.exit(1); }
console.log('frames', Math.min(N, TOTAL - START), 'ms/frame', ((Date.now() - t0) / Math.min(N, TOTAL - START)).toFixed(1), '->', OUT);

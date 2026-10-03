# Bir Piyola — 30 s motion-design film

**UZ:** O'zbek choy madaniyati haqida 30 soniyalik kinetik tipografiya videosi (1920×1080, 30 fps, 900 kadr, musiqa bilan).
**EN:** A 30-second kinetic-typography piece about Uzbek tea culture — the piyola from above, rising steam, the half-cup of respect, and the pause tea creates.

## Qayta qurish / Rebuild

```
node build.mjs            # music → 900 frames → mux → review assets
node render.mjs --frames 90 --start 400 --out out/preview.mp4   # partial preview
node render.mjs --stills out/stills --times 0.5,6.5,14,22,26    # PNG stills at given seconds
```

Requires Node 22, Playwright's Chromium and ffmpeg 6 on PATH. No npm install, no network.
Playwright is imported from `/opt/node-tools/node_modules/playwright/index.mjs` by default; on another machine point `PLAYWRIGHT_PATH` at your own copy, e.g. `PLAYWRIGHT_PATH=./node_modules/playwright/index.mjs node build.mjs`.

## Fayllar / Files

| path | what |
|---|---|
| `scene.html` | the whole composition; `window.seek(t)` sets the full visual state as a pure function of t |
| `render.mjs` | Playwright frame renderer → ffmpeg image2pipe → `out/video-only.mp4` (`--frames`, `--start`, `--out`, `--stills`) |
| `music.mjs` | pure-Node synth (120 BPM, D minor, Dm7–Bbmaj7–Gm7–Am7) → `out/music.wav` (un-faded; the 1.5 s fade and two-pass linear loudnorm happen in the mux) |
| `build.mjs` | end-to-end build + mux + `out/contact-sheet.png`, `out/review/f_NN.png`, `out/ffprobe.txt` |
| `fonts/` | Unbounded, Syne, JetBrains Mono (variable TTFs, OFL) |
| `out/motion-30s.mp4` | final film: H.264 yuv420p 1920×1080 30 fps, AAC 48 kHz stereo |

Debug time readout: open `scene.html?debug&t=12.5` in a browser (never rendered into frames).

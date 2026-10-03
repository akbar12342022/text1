// build.mjs — end-to-end: music → frames → mux → review assets
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const sh = (cmd) => { console.log('> ' + cmd); execSync(cmd, { cwd: HERE, stdio: 'inherit' }); };
mkdirSync(resolve(HERE, 'out/review'), { recursive: true });
const skipRender = process.argv.includes('--skip-render');
sh('node music.mjs');
if (!skipRender) sh('node render.mjs --out out/video-only.mp4');

// two-pass loudnorm: measure the WAV first, then apply a LINEAR gain with the measured values (no sample-by-sample gain riding)
const LN = 'I=-14:TP=-1.5:LRA=11'; // spec target (linear two-pass: gain is capped by the TP ceiling)
const probeLn = execSync(`ffmpeg -hide_banner -nostats -i out/music.wav -af "loudnorm=${LN}:print_format=json" -f null - 2>&1`, { cwd: HERE }).toString();
const m = JSON.parse(probeLn.slice(probeLn.lastIndexOf('{')));
console.log('loudnorm pass 1:', `I=${m.input_i} TP=${m.input_tp} LRA=${m.input_lra} thresh=${m.input_thresh} offset=${m.target_offset}`);
const ln2 = `loudnorm=${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
// the one and only 1.5 s fade-out sits after loudnorm (the synth writes an un-faded WAV)
sh('ffmpeg -y -loglevel error -i out/video-only.mp4 -i out/music.wav -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 ' +
   `-af "${ln2},alimiter=limit=0.7943:attack=3:release=60:level=false,afade=t=out:st=28.5:d=1.5" -t 30 -shortest -movflags +faststart out/motion-30s.mp4`);
sh('ffmpeg -y -loglevel error -i out/motion-30s.mp4 -vf "select=not(mod(n\\,30)),scale=320:-1,tile=6x5" -vsync 0 -frames:v 1 out/contact-sheet.png');
sh('ffmpeg -y -loglevel error -i out/motion-30s.mp4 -vf "select=not(mod(n\\,30))" -vsync 0 -start_number 0 out/review/f_%02d.png');
const probe = execSync('ffprobe -v error -show_streams -show_format out/motion-30s.mp4', { cwd: HERE }).toString();
writeFileSync(resolve(HERE, 'out/ffprobe.txt'), probe);
console.log(probe.split('\n').filter(l => /^(codec_name|width|height|r_frame_rate|nb_frames|duration|pix_fmt|sample_rate|channels|size)=/.test(l)).join('\n'));

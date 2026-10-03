// music.mjs — pure-Node synth → out/music.wav (48 kHz, 16-bit stereo, exactly 30.000 s)
// "Bir Piyola": 120 BPM, D minor (Dorian), Dm7–Bbmaj7–Gm7–Am7, lo-fi house, hits at 0.5/6.5/14–15.5/22/26.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SR = 48000, DUR = 30, N = SR * DUR, TAU = Math.PI * 2;
const L = new Float64Array(N), R = new Float64Array(N);
const pad = new Float64Array(N), drums = new Float64Array(N), bass = new Float64Array(N), pluckL = new Float64Array(N), pluckR = new Float64Array(N);
let seed = 20261003; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

// ---- chords (midi): one per bar (2 s), loop of 4
const CH = [[62, 65, 69, 72], [58, 62, 65, 69], [55, 58, 62, 65], [57, 60, 64, 67]]; // Dm7 Bbmaj7 Gm7 Am7
const ROOT = [38, 34, 31, 33]; // D2 Bb1 G1 A1
const chordAt = bar => CH[bar % 4], rootAt = bar => ROOT[bar % 4];

// ---- generators
function saw(buf, f, t0, t1, amp, att = 0.08, rel = 0.15, detune = 0) {
  const s0 = Math.max(0, Math.floor(t0 * SR)), s1 = Math.min(N, Math.floor((t1 + rel) * SR)); let ph = 0; const fr = f * (1 + detune);
  for (let i = s0; i < s1; i++) { const t = i / SR; const e = Math.min(1, (t - t0) / att) * (t < t1 ? 1 : Math.max(0, 1 - (t - t1) / rel)); ph += fr / SR; if (ph > 1) ph -= 1; buf[i] += amp * e * (2 * ph - 1); }
}
function sine(buf, f, t0, dur, amp, tau, { att = 0.002, pitchDip = 0 } = {}) {
  const s0 = Math.floor(t0 * SR), s1 = Math.min(N, Math.floor((t0 + dur) * SR)); let ph = 0;
  for (let i = s0; i < s1; i++) { const dt = (i - s0) / SR; const fr = f * (pitchDip && dt < 0.006 ? 1 - pitchDip * (1 - dt / 0.006) : 1); ph += fr / SR; buf[i] += amp * Math.min(1, dt / att) * Math.exp(-dt / tau) * Math.sin(TAU * ph); }
}
function kick(t0, amp = 1) { // sine, pitch 150→45 Hz over 0.12 s, exp decay τ 0.18
  const s0 = Math.floor(t0 * SR), s1 = Math.min(N, s0 + Math.floor(0.6 * SR)); let ph = 0;
  for (let i = s0; i < s1; i++) { const dt = (i - s0) / SR; const f = 45 + 105 * Math.exp(-dt / 0.04) * (dt < 0.12 ? 1 : Math.exp(-(dt - .12) * 30)); ph += f / SR; drums[i] += amp * Math.exp(-dt / 0.18) * Math.sin(TAU * ph) * Math.min(1, dt / 0.001); }
}
function hat(t0, tau, amp) { const s0 = Math.floor(t0 * SR), s1 = Math.min(N, s0 + Math.floor(tau * 8 * SR)); let prev = 0; for (let i = s0; i < s1; i++) { const dt = (i - s0) / SR; const n = rnd(); const hp = (n - prev) * 2; prev = n; drums[i] += amp * hp * Math.exp(-dt / tau) * 0.5; } }
function clap(t0, amp) { for (let k = 0; k < 3; k++) { const s0 = Math.floor((t0 + 0.01 * k) * SR), s1 = Math.min(N, s0 + Math.floor(0.4 * SR)); let prev = 0; for (let i = s0; i < s1; i++) { const dt = (i - s0) / SR; const n = rnd(); const bp = (n + prev) * 0.5; prev = n; drums[i] += amp * bp * Math.exp(-dt / 0.06) * 0.6; } } }
function pluck(midi, t0, amp = 1, tau = 0.28, pan = 0) { // sine + 2 harmonics, fast decay, 6 ms pitch dip
  const f = mtof(midi), gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  const tmp = new Float64Array(Math.floor(tau * 6 * SR)); const s0 = Math.floor(t0 * SR); let ph = 0;
  for (let i = 0; i < tmp.length && s0 + i < N; i++) { const dt = i / SR; const fr = f * (dt < 0.006 ? 1 - 0.03 * (1 - dt / 0.006) : 1); ph += fr / SR; const e = Math.min(1, dt / 0.0015) * Math.exp(-dt / tau);
    const v = e * (Math.sin(TAU * ph) + 0.5 * Math.sin(TAU * 2 * ph) * Math.exp(-dt / (tau * .5)) + 0.25 * Math.sin(TAU * 3 * ph) * Math.exp(-dt / (tau * .3)));
    pluckL[s0 + i] += amp * gl * v; pluckR[s0 + i] += amp * gr * v; }
}
function noiseBurst(t0, tau, amp) { const s0 = Math.floor(t0 * SR), s1 = Math.min(N, s0 + Math.floor(tau * 6 * SR)); let lp = 0; for (let i = s0; i < s1; i++) { const dt = (i - s0) / SR; lp += 0.15 * (rnd() - lp); drums[i] += amp * lp * Math.exp(-dt / tau); } }
function subDrop(t0) { const s0 = Math.floor(t0 * SR), s1 = Math.min(N, s0 + Math.floor(1.2 * SR)); let ph = 0; for (let i = s0; i < s1; i++) { const dt = (i - s0) / SR; const f = dt < 0.6 ? 80 - 50 * (dt / 0.6) : 30; ph += f / SR; bass[i] += 0.9 * Math.exp(-dt / 0.45) * Math.min(1, dt / 0.004) * Math.sin(TAU * ph); } }

// ---- PAD : two detuned saws per chord note (L/R opposite detune for width via later split)
const padChord = (notes, t0, t1, amp, att = 0.08) => { for (const m of notes) { const f = mtof(m); saw(pad, f, t0, t1, amp, att, 0.18, -0.004); saw(pad, f, t0, t1, amp, att, 0.18, +0.004); } };
for (let bar = 0; bar < 13; bar++) padChord(chordAt(bar), bar * 2, bar * 2 + 2, 0.055);
padChord([62, 65, 69, 72, 76], 26.0, 30.0, 0.075, 0.15); // Dm9 final chord swell

// ---- BASS
for (let bar = 0; bar < 3; bar++) { sine(bass, mtof(rootAt(bar)), bar * 2, 0.9, 0.55, 0.35); sine(bass, mtof(rootAt(bar)), bar * 2 + 1, 0.9, 0.55, 0.35); } // intro pulses beats 1 & 3
sine(bass, mtof(rootAt(3)), 6.0, 0.45, 0.55, 0.3);
for (let t = 6.5; t < 22.0 - 1e-9; t += 0.25) { // drop/peak: 8th pattern root root 5th root
  const bar = Math.floor(t / 2), step = Math.round((t % 1) / 0.25) % 4; const m = rootAt(bar) + (step === 2 ? 7 : 0);
  sine(bass, mtof(m), t, 0.24, 0.5, 0.11, { att: 0.004 });
}
for (let bar = 11; bar < 13; bar++) sine(bass, mtof(rootAt(bar)), bar * 2 + (bar === 11 ? 0.15 : 0), 2 - (bar === 11 ? 0.15 : 0), 0.45, 2.5, { att: 0.05 }); // breakdown sustain

// ---- DRUMS
kick(0.5, 1.0); clap(0.5, 0.5); // hit 0.5
for (let t = 6.5; t < 22.0 - 1e-9; t += 0.5) kick(t, 0.9);
for (let t = 6.5; t < 22.0 - 1e-9; t += 0.25) { const inBar = ((t % 2) + 2) % 2; const open = Math.abs(inBar - 0.75) < 1e-6 || Math.abs(inBar - 1.75) < 1e-6; hat(t, open ? 0.09 : 0.025, open ? 0.55 : 0.5); }
for (let t = 6.5; t < 22.0 - 1e-9; t += 2) { clap(t, 0.5); clap(t + 1.0, 0.5); } // beats 2 & 4 (bar starts at even seconds: 6.5 is beat 2 of bar 3)
noiseBurst(6.5, 0.25, 0.5); // drop splash
for (const t of [14.0, 14.5, 15.0, 15.5]) { kick(t, 1.1); clap(t, 0.65); }
subDrop(22.0); noiseBurst(22.0, 0.5, 0.9); // slam
kick(26.0, 0.7); // final soft kick

// ---- PLUCK lead
pluck(62, 0.5, 0.9, 0.5, 0.0); // ripple pluck D4 at hit 0.5
const mel = [62, 65, 69, 67, 65, 62, 60, 62];
for (let k = 0, t = 6.75; t < 14.0 - 1e-9; t += 0.5, k++) pluck(mel[k % 8], t, 0.55, 0.26, (k % 2 ? 0.5 : -0.5));
[[14.0, 74], [14.5, 77], [15.0, 79], [15.5, 81]].forEach(([t, m]) => pluck(m, t, 1.1, 0.4, 0));
for (let t = 16.0; t < 22.0 - 1e-9; t += 0.125) { const bar = Math.floor(t / 2), ch = chordAt(bar); const idx = Math.round((t - 16) / 0.125) % 8; const m = ch[idx % 4] + (idx >= 4 ? 12 : 0) + 12; pluck(m, t, 0.32, 0.16, Math.sin(idx * 1.3) * 0.7); }
pluck(62, 22.5, 0.7, 0.9, -0.2); pluck(57, 24.5, 0.6, 0.9, 0.2); // breakdown
pluck(74, 26.0, 0.9, 1.2, 0); // final

// ---- PAD filter: one-pole LP with time-varying cutoff
const cutoff = t => t < 6.5 ? 500 + 700 * (t / 6.5) : t < 22 ? 4000 : t < 23 ? 4000 - 3300 * (t - 22) : t < 26 ? 700 : 700 + 1100 * Math.min(1, (t - 26) / 0.4);
let y1 = 0, y2 = 0; for (let i = 0; i < N; i++) { const a = 1 - Math.exp(-TAU * cutoff(i / SR) / SR); y1 += a * (pad[i] - y1); y2 += a * (y1 - y2); pad[i] = y2; }

// ---- stereo delay on pluck bus (ping-pong, dotted 8th 0.375 s)
const D = Math.floor(0.375 * SR), dl = new Float64Array(N), dr = new Float64Array(N);
for (let i = 0; i < N; i++) { const fl = i >= D ? dr[i - D] : 0, fr = i >= D ? dl[i - D] : 0; dl[i] = pluckL[i] + 0.38 * fl; dr[i] = pluckR[i] + 0.38 * fr; }

// ---- mix
for (let i = 0; i < N; i++) {
  const p = pad[i], d = drums[i], b = bass[i];
  L[i] = p * 1.0 + d * 0.9 + b * 0.8 + pluckL[i] * 0.55 + (dl[i] - pluckL[i]) * 0.3;
  R[i] = p * 1.0 + d * 0.9 + b * 0.8 + pluckR[i] * 0.55 + (dr[i] - pluckR[i]) * 0.3;
}
// soft clip + master LP 12 kHz (two one-pole stages) + normalise to -1 dBFS (the single 28.5→30 fade is applied post-loudnorm in build.mjs)
const aM = 1 - Math.exp(-TAU * 12000 / SR); let l1 = 0, l2 = 0, r1 = 0, r2 = 0, peak = 0;
for (let i = 0; i < N; i++) { let l = Math.tanh(L[i] * 0.9), r = Math.tanh(R[i] * 0.9); l1 += aM * (l - l1); l2 += aM * (l1 - l2); r1 += aM * (r - r1); r2 += aM * (r1 - r2); L[i] = l2; R[i] = r2; peak = Math.max(peak, Math.abs(l2), Math.abs(r2)); }
const g = 0.891 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { const q = v => Math.max(-32768, Math.min(32767, Math.round(v * g * 32767))); out.writeInt16LE(q(L[i]), 44 + i * 4); out.writeInt16LE(q(R[i]), 46 + i * 4); }
mkdirSync(resolve(HERE, 'out'), { recursive: true });
writeFileSync(resolve(HERE, 'out/music.wav'), out);
console.log('music.wav written:', N, 'samples/ch, peak before norm', peak.toFixed(3));

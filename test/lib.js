/* Test helpers: build "performances" from real sampled guitar notes (FluidR3 GM, via gleitz/midi-js-soundfonts). */
'use strict';
const fs = require('fs');
const path = require('path');
const SR = 48000;
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DIR = path.join(__dirname, '..', 'samples');
const cache = {};

function sample(inst, midi) {
  const key = inst + ':' + midi;
  if (cache[key]) return cache[key];
  const name = FLAT[midi % 12] + (Math.floor(midi / 12) - 1);
  const file = path.join(DIR, inst, name + '.f32');
  if (!fs.existsSync(file)) throw new Error('no sample for midi ' + midi + ' (' + name + ')');
  const b = fs.readFileSync(file);
  const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  cache[key] = Float32Array.from(f);
  return cache[key];
}

/* events: [{t, midis, dur, gain, strum}] -> Float32Array. Notes are cut (10 ms fade) at t+dur. */
function render(events, opts) {
  opts = opts || {};
  const inst = opts.inst || 'acoustic_guitar_steel';
  let end = 0;
  events.forEach(e => { end = Math.max(end, e.t + (e.dur || 3)); });
  const out = new Float32Array(Math.ceil((end + (opts.tail === undefined ? 0.3 : opts.tail)) * SR));
  events.forEach(e => {
    const strum = e.strum === undefined ? 0.012 : e.strum;
    e.midis.forEach((m, k) => {
      const s = sample(e.inst || inst, m);
      const start = Math.round((e.t + k * strum) * SR);
      const len = Math.min(s.length, Math.round((e.dur || 3) * SR));
      const fade = Math.round(0.012 * SR);
      const g = (e.gain === undefined ? 0.5 : e.gain) * (e.midis.length > 1 ? 0.6 : 1);
      for (let i = 0; i < len && start + i < out.length; i++) {
        let env = 1;
        if (i > len - fade) env = (len - i) / fade;
        out[start + i] += s[i] * g * env;
      }
    });
  });
  return out;
}

/* Rough small-microphone model: 2nd order high-pass, optional noise. */
function phone(x, opts) {
  opts = opts || {};
  const fc = opts.hp === undefined ? 180 : opts.hp;
  const y = new Float32Array(x.length);
  if (fc > 0) {
    const w0 = 2 * Math.PI * fc / SR, cosw = Math.cos(w0), alpha = Math.sin(w0) / (2 * 0.707);
    const b0 = (1 + cosw) / 2, b1 = -(1 + cosw), b2 = (1 + cosw) / 2, a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
  } else y.set(x);
  const noise = opts.noise === undefined ? 0.003 : opts.noise;
  let seed = opts.seed || 12345;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  if (noise > 0) for (let i = 0; i < y.length; i++) y[i] += (rnd() + rnd() + rnd() - 1.5) * noise * 1.63;
  const g = opts.gain === undefined ? 1 : opts.gain;
  if (g !== 1) for (let i = 0; i < y.length; i++) y[i] *= g;
  return y;
}

/* Shift pitch by cents through resampling (also changes speed slightly, fine for tests). */
function detune(x, cents) {
  const r = Math.pow(2, cents / 1200);
  const n = Math.floor(x.length / r);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * r, k = Math.floor(p), fr = p - k;
    y[i] = k + 1 < x.length ? x[k] * (1 - fr) + x[k + 1] * fr : x[k];
  }
  return y;
}

function wav(x, file) {
  const n = x.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

module.exports = { SR, sample, render, phone, detune, wav };

'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'src', 'music.js'));
const PR = require(path.join(__dirname, '..', 'src', 'engine.js'));
const L = require('./lib.js');
const M = PR.music;

/* For each of 45 notes (E2..C6): the note the engine settles on, and how many confident frames disagree. */
function run(inst, opts, label, cents) {
  const an = PR.dsp.createAnalyzer(L.SR);
  let n = 0, ok = 0, worst = 0, sumAbs = 0, bad = [], wrongF = 0, goodF = 0, quiet = 0;
  const errs = [];
  for (let midi = 40; midi <= 84; midi++) {
    let x = L.render([{ t: 0.05, midis: [midi], dur: 2.5 }], { inst, tail: 0 });
    if (cents) x = L.detune(x, cents);
    if (opts) x = L.phone(x, opts);
    const frames = PR.take.extractFrames(x, L.SR, { chroma: false }, an);
    const gate = PR.take.takeGate(frames);
    const good = frames.filter(f => f.t > 0.15 && f.t < 1.6 && f.rms > gate && f.clarity > 0.85);
    const med = PR.dsp.median(good.map(f => f.midi));
    n++;
    const err = (med - midi) * 100 - (cents || 0);
    const wrongFrames = good.filter(f => Math.abs(f.midi - midi) > 0.5);
    wrongF += wrongFrames.length; goodF += good.length;
    if (good.length < 5) { n--; quiet++; }
    else if (Math.abs(err) < 40) { ok++; sumAbs += Math.abs(err); worst = Math.max(worst, Math.abs(err)); errs.push(err); }
    else bad.push(M.midiName(midi) + ':' + (isNaN(med) ? 'none' : med.toFixed(2)) + ' n=' + good.length);
    if (wrongFrames.length > Math.max(1, good.length * 0.08)) bad.push(M.midiName(midi) + ':wrong ' + wrongFrames.length + '/' + good.length + ' e.g. ' + wrongFrames.slice(0, 3).map(f => f.midi.toFixed(1)).join(','));
  }
  console.log(label.padEnd(40), 'notes ok', ok + '/' + n, ' mean|c|', (sumAbs / Math.max(1, ok)).toFixed(1), ' worst', worst.toFixed(1), ' bias', PR.dsp.median(errs).toFixed(1), ' wrong frames', wrongF + '/' + goodF, quiet ? ' (' + quiet + ' too quiet to read)' : '', bad.length ? '\n    ISSUES: ' + bad.join('; ') : '');
  return ok === n;
}
let all = true;
for (const inst of ['acoustic_guitar_steel', 'electric_guitar_clean']) {
  const s = inst.split('_')[0];
  all = run(inst, null, s + ', clean') && all;
  all = run(inst, { hp: 180, noise: 0.0008 }, s + ', phone mic, quiet room') && all;
  all = run(inst, { hp: 180, noise: 0.003 }, s + ', phone mic, some noise') && all;
  all = run(inst, { hp: 300, noise: 0.003 }, s + ', thin mic (hp 300)') && all;
  all = run(inst, { hp: 180, noise: 0.0008, gain: 0.15 }, s + ', phone mic, quiet signal') && all;
  all = run(inst, { hp: 180, noise: 0.0008 }, s + ', 18 cents flat', -18) && all;
  all = run(inst, { hp: 180, noise: 0.0008 }, s + ', 12 cents sharp', 12) && all;
}
const an = PR.dsp.createAnalyzer(L.SR);
const x = L.render([{ t: 0, midis: [40, 47, 52, 56, 59, 64], dur: 2 }], {});
const buf = x.subarray(20000, 20000 + an.needed);
let t0 = process.hrtime.bigint();
for (let i = 0; i < 200; i++) an.analyze(buf, an.needed, true, false);
let t1 = process.hrtime.bigint();
for (let i = 0; i < 200; i++) an.analyze(buf, an.needed, false, true);
let t2 = process.hrtime.bigint();
console.log('needed samples', an.needed, ' pitch ms/frame', (Number(t1 - t0) / 200 / 1e6).toFixed(3), ' chroma ms/frame', (Number(t2 - t1) / 200 / 1e6).toFixed(3));
console.log(all ? 'PITCH: ALL NOTES OK' : 'PITCH: SOME NOTES FAILED');

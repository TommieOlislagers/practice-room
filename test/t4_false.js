'use strict';
/* False-positive checks: wrong playing must not be credited. */
const path = require('path');
require(path.join(__dirname, '..', 'src', 'music.js'));
const PR = require(path.join(__dirname, '..', 'src', 'engine.js'));
const L = require('./lib.js');
const M = PR.music;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
const PHONE = { hp: 180, noise: 0.0008 };
const framesOf = x => PR.take.extractFrames(x, L.SR, { hop: 0.0232, chromaEvery: 2 });
const noteTargets = midis => midis.map((m, i) => ({ index: i, kind: 'note', midis: [m], label: M.midiName(m) }));
function wait(targets, frames) {
  PR.track.prepareTargets(targets);
  const tr = new PR.track.WaitTracker(targets);
  const ev = []; frames.forEach(f => { const e = tr.push(f, f.t); if (e) ev.push(e); });
  return { hits: tr.results.filter(r => r.hit).length, wrong: ev.filter(e => e.type === 'wrong').length, tr };
}
function tempo(targets, frames) {
  PR.track.prepareTargets(targets);
  const tr = new PR.track.TempoTracker(targets, { frameDt: 0.0232, chromaDt: 0.0464 });
  frames.forEach(f => tr.push(f, f.t));
  const last = frames[frames.length - 1].t;
  for (let k = 1; k < 40; k++) tr.push({ rms: 0, hf: 0, midi: NaN, clarity: 0, chroma: null, semi: null }, last + k * 0.05);
  return tr;
}
const mel = [45, 48, 52, 57, 55, 52, 50, 48, 47, 50, 53, 57, 60, 57, 53, 50];

for (const inst of ['acoustic_guitar_steel', 'electric_guitar_clean']) {
  console.log('\n=== ' + inst + ' ===');
  for (const [dur, label] of [[0.45, 'damped'], [0.95, 'ringing']]) {
    for (const [shift, sl] of [[-7, 'a fifth low'], [-19, 'an octave and a fifth low'], [5, 'a fourth high'], [1, 'a semitone high'], [-2, 'a tone low'], [7, 'a fifth high']]) {
      const played = mel.map(m => { let p = m + shift; while (p < 40) p += 12; while (p > 84) p -= 12; return p; });
      const ev = played.map((m, i) => ({ t: 0.3 + i * 0.5, midis: [m], dur }));
      const fr = framesOf(L.phone(L.render(ev, { inst }), PHONE));
      const w = wait(noteTargets(mel), fr);
      /* in wait mode a note is credited whenever it is finally played: count credits given while that note was NOT sounding */
      const falseWait = w.tr.results.filter(r => r.hit && !ev.some(e => e.t <= r.t - 0.03 && e.t + e.dur + 0.15 >= r.t && Math.abs(e.midis[0] - mel[r.index]) % 12 === 0)).length;
      const tg = noteTargets(mel).map((t, i) => Object.assign(t, { start: 0.3 + i * 0.5, end: 0.8 + i * 0.5 }));
      const tt = tempo(tg, fr);
      const th = tt.results.filter(r => r.hit).length;
      const rep = PR.take.scoreTake(fr, noteTargets(mel), {});
      const acc = rep.ok ? rep.accuracy : 0;
      check(label + ', every note ' + sl + ': not credited', falseWait === 0 && th <= 1 && acc <= 0.45, 'wait false credits ' + falseWait + ' (of ' + w.hits + ' coincidental), tempo ' + th + '/16, take ' + (rep.ok ? rep.hits + ' hit ' + rep.wrong + ' wrong ' + rep.missed + ' missed ' + rep.extras + ' extra = ' + Math.round(acc * 100) + '%' : rep.reason));
    }
    /* the right melody, for reference */
    const evOk = mel.map((m, i) => ({ t: 0.3 + i * 0.5, midis: [m], dur }));
    const frOk = framesOf(L.phone(L.render(evOk, { inst }), PHONE));
    const tgOk = noteTargets(mel).map((t, i) => Object.assign(t, { start: 0.3 + i * 0.5, end: 0.8 + i * 0.5 }));
    const wOk = wait(noteTargets(mel), frOk), tOk = tempo(tgOk, frOk), rOk = PR.take.scoreTake(frOk, noteTargets(mel), {});
    check(label + ', the right melody: credited', wOk.hits >= 15 && tOk.results.filter(r => r.hit).length >= 15 && rOk.ok && rOk.accuracy >= 0.9, 'wait ' + wOk.hits + '/16 (' + wOk.wrong + ' wrong flags), tempo ' + tOk.results.filter(r => r.hit).length + '/16 [' + tOk.results.map(r => r.grade[0]).join('') + '], take ' + (rOk.ok ? rOk.hits + '/' + rOk.total + ' extras ' + rOk.extras + ' = ' + Math.round(rOk.accuracy * 100) + '%' : rOk.reason));
  }
  /* chords: the chart says G C D Em, the player strums A E F#m B */
  {
    const song = { sections: [{ name: 'A', type: 'chords', bars: ['G', 'C', 'D', 'Em', 'G', 'C', 'D', 'Em'] }], bpm: 100 };
    const model = M.buildSong(song);
    const wrongNames = ['A', 'E', 'F#m', 'B', 'A', 'E', 'F#m', 'B'];
    const ev = wrongNames.map((n, i) => ({ t: 0.3 + i * 1.5, midis: M.shapeMidi(M.shapeFor(M.parseChord(n)), 'standard', 0), dur: 1.4 }));
    const fr = framesOf(L.phone(L.render(ev, { inst }), PHONE));
    const w = wait(model.targets.map(t => Object.assign({}, t)), fr);
    const tg = model.targets.map((t, i) => Object.assign({}, t, { start: 0.3 + i * 1.5, end: 1.8 + i * 1.5 }));
    const tt = tempo(tg, fr);
    const rep = PR.take.scoreTake(fr, model.targets.map(t => Object.assign({}, t)), {});
    check('chords: four wrong chords in place of G C D Em: not credited', w.hits === 0 && tt.results.filter(r => r.hit).length === 0 && (!rep.ok || rep.accuracy <= 0.2), 'wait ' + w.hits + ', tempo ' + tt.results.filter(r => r.hit).length + ', take ' + (rep.ok ? rep.hits + '/' + rep.total + ' = ' + Math.round(rep.accuracy * 100) + '%' : rep.reason));
    /* near misses: Em for G, Am for C, Dm for D, E for Em */
    const near = ['Em', 'Am', 'Dm', 'E', 'Em', 'Am', 'Dm', 'E'];
    const ev2 = near.map((n, i) => ({ t: 0.3 + i * 1.5, midis: M.shapeMidi(M.shapeFor(M.parseChord(n)), 'standard', 0), dur: 1.4 }));
    const fr2 = framesOf(L.phone(L.render(ev2, { inst }), PHONE));
    const tt2 = tempo(model.targets.map((t, i) => Object.assign({}, t, { start: 0.3 + i * 1.5, end: 1.8 + i * 1.5 })), fr2);
    const h2 = tt2.results.filter(r => r.hit).map(r => model.targets[r.index].label + '<-' + near[r.index]);
    const rep2 = PR.take.scoreTake(fr2, model.targets.map(t => Object.assign({}, t)), {});
    const w2 = wait(model.targets.map(t => Object.assign({}, t)), fr2);
    check('chords: relative minors and parallel chords in place of the right ones: not credited', h2.length === 0 && w2.hits === 0 && (!rep2.ok || rep2.accuracy <= 0.2), 'tempo credited ' + h2.length + ' ' + h2.join(', ') + '; wait ' + w2.hits + ' (wrong flags: ' + w2.tr.results.length + '); take ' + (rep2.ok ? Math.round(rep2.accuracy * 100) + '% ' + rep2.items.map(it => it.status === 'wrong' ? it.label + '<-' + it.heard : it.status[0]).join(' ') : rep2.reason));
  }
  /* claps and taps: bursts of noise */
  {
    const x = new Float32Array(L.SR * 9);
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
    for (let k = 0; k < 16; k++) { const s0 = Math.round((0.3 + k * 0.5) * L.SR); for (let i = 0; i < 2400; i++) x[s0 + i] += rnd() * 0.5 * Math.exp(-i / 500); }
    const fr = framesOf(L.phone(x, PHONE));
    const w = wait(noteTargets(mel), fr);
    const song = { sections: [{ name: 'A', type: 'chords', bars: ['G', 'C', 'D', 'Em'] }] };
    const wc = wait(M.buildSong(song).targets, fr);
    check('taps and claps: not credited as notes or chords', w.hits === 0 && wc.hits === 0, 'notes ' + w.hits + ', chords ' + wc.hits);
  }
}
console.log(failures ? '\nFALSE-POSITIVE CHECKS: ' + failures + ' FAILED' : '\nFALSE-POSITIVE CHECKS: ALL PASSED');
process.exit(failures ? 1 : 0);

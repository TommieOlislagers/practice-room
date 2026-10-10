'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'src', 'music.js'));
const PR = require(path.join(__dirname, '..', 'src', 'engine.js'));
const L = require('./lib.js');
const M = PR.music;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }

const PHONE = { hp: 180, noise: 0.0008 };
function framesOf(x) { return PR.take.extractFrames(x, L.SR, { hop: 0.0232, chromaEvery: 2 }); }
function runWait(targets, frames, opts) {
  PR.track.prepareTargets(targets);
  const tr = new PR.track.WaitTracker(targets, opts);
  const events = [];
  frames.forEach(f => { const ev = tr.push(f, f.t); if (ev) events.push(ev); });
  return { tr, events };
}
function runTempo(targets, frames, opts) {
  PR.track.prepareTargets(targets);
  const tr = new PR.track.TempoTracker(targets, Object.assign({ frameDt: 0.0232, chromaDt: 0.0464 }, opts));
  frames.forEach(f => tr.push(f, f.t));
  /* flush */
  const last = frames[frames.length - 1].t;
  for (let k = 1; k < 40; k++) tr.push({ rms: 0, midi: NaN, clarity: 0, chroma: null }, last + k * 0.05);
  return tr;
}
function noteTargets(midis) { return midis.map((m, i) => ({ index: i, kind: 'note', midis: [m], label: M.midiName(m) })); }
function chordModel(names, shapes, capo, extra) {
  const song = Object.assign({ sections: [{ name: 'A', type: 'chords', bars: names }], shapes: shapes || {}, capo: capo || 0, bpm: 85 }, extra || {});
  return M.buildSong(song);
}

for (const inst of ['acoustic_guitar_steel', 'electric_guitar_clean']) {
  console.log('\n=== ' + inst + ' ===');
  /* 1. wait mode, single notes: E minor pentatonic up and down, with two repeated notes */
  const mel = [40, 43, 45, 47, 50, 52, 55, 57, 59, 62, 64, 64, 62, 59, 57, 55, 52, 50, 47, 45, 43, 40, 40];
  {
    const ev = mel.map((m, i) => ({ t: 0.3 + i * 0.5, midis: [m], dur: 0.48 }));
    const fr = framesOf(L.phone(L.render(ev, { inst }), PHONE));
    const { tr, events } = runWait(noteTargets(mel), fr);
    const hits = tr.results.filter(r => r.hit).length, wrong = events.filter(e => e.type === 'wrong').length;
    check('wait/notes: all ' + mel.length + ' notes heard in order', hits === mel.length && tr.done, hits + ' hits, done=' + tr.done);
    check('wait/notes: no false wrong-note flags', wrong === 0, wrong + ' wrong events');
    const lat = tr.results.map((r, i) => r.t - (0.3 + i * 0.5));
    check('wait/notes: each note confirmed within 0.2 s of being played', Math.max(...lat) < 0.2 && Math.min(...lat) > 0, 'latency ' + Math.min(...lat).toFixed(3) + '..' + Math.max(...lat).toFixed(3) + ' s');
    const cents = tr.results.map(r => Math.abs(r.cents));
    check('wait/notes: tuning offsets small', Math.max(...cents) < 25, 'max |cents| ' + Math.max(...cents).toFixed(1));
  }
  /* 1b. let-ring: notes overlap the next one by a full note length */
  {
    const ev = mel.map((m, i) => ({ t: 0.3 + i * 0.5, midis: [m], dur: 0.95 }));
    const fr = framesOf(L.phone(L.render(ev, { inst }), PHONE));
    const { tr, events } = runWait(noteTargets(mel), fr);
    const hits = tr.results.filter(r => r.hit).length;
    console.log('  info  wait/notes with notes left ringing over each other: ' + hits + '/' + mel.length + ' heard, ' + events.filter(e => e.type === 'wrong').length + ' wrong flags');
  }
  /* 2. wrong notes: play F#3 instead of G3 (index 6) and D#4 instead of D4 (index 9), then correct them */
  {
    const ev = [];
    let t = 0.3;
    mel.slice(0, 12).forEach((m, i) => {
      if (i === 6) { ev.push({ t, midis: [54], dur: 0.48 }); t += 0.6; }
      if (i === 9) { ev.push({ t, midis: [63], dur: 0.48 }); t += 0.6; }
      ev.push({ t, midis: [m], dur: 0.48 }); t += 0.5;
    });
    const fr = framesOf(L.phone(L.render(ev, { inst }), PHONE));
    const { tr, events } = runWait(noteTargets(mel.slice(0, 12)), fr);
    const wrong = events.filter(e => e.type === 'wrong');
    check('wait/notes: both wrong notes flagged, on the right targets', wrong.length === 2 && wrong[0].index === 6 && wrong[1].index === 9, wrong.map(w => 'target ' + w.index + ' heard ' + w.heard).join(', '));
    check('wait/notes: still finishes after corrections', tr.done && tr.results.filter(r => r.hit).length === 12, tr.results.filter(r => r.hit).length + ' hits; clean ' + tr.results.filter(r => r.clean).length);
  }
  /* 3. wait mode, chords: Eyes Without a Face verse loop twice, one strum per bar, then faster */
  const eyes = { Emaj7: 'x79897', B: '799877', 'C#m': 'x46654', 'G#m': '466444' };
  for (const [gap, label] of [[2.82, 'one strum per bar at 85 BPM'], [1.0, 'one strum per second']]) {
    const model = chordModel(['Emaj7', 'C#m', 'G#m', 'B', 'Emaj7', 'C#m', 'G#m', 'B'], eyes);
    const ev = model.targets.map((tg, i) => ({ t: 0.3 + i * gap, midis: tg.midis, dur: gap - 0.05 }));
    const fr = framesOf(L.phone(L.render(ev, { inst }), PHONE));
    const { tr, events } = runWait(model.targets, fr);
    const hits = tr.results.filter(r => r.hit).length, wrong = events.filter(e => e.type === 'wrong');
    check('wait/chords (' + label + '): 8 changes heard', hits === 8 && tr.done, hits + ' hits');
    check('wait/chords (' + label + '): no false wrong-chord flags', wrong.length === 0, wrong.map(w => w.index + ':' + w.heard).join(','));
    const lat = tr.results.map((r, i) => r.t - (0.3 + i * gap));
    console.log('  info  chord confirm latency ' + Math.min(...lat).toFixed(2) + '..' + Math.max(...lat).toFixed(2) + ' s (median ' + PR.dsp.median(lat).toFixed(2) + ')');
  }
  /* 4. wrong chord: A instead of G#m on the third bar, held, then corrected */
  {
    const model = chordModel(['Emaj7', 'C#m', 'G#m', 'B'], eyes);
    const A = M.shapeMidi(M.parseShape('x02220'), 'standard', 0);
    const full = chordModel(['Emaj7', 'C#m', 'G#m', 'B', 'A'], eyes);
    const tg = full.targets.slice(0, 4);
    const ev = [{ t: 0.3, midis: tg[0].midis, dur: 1.4 }, { t: 1.8, midis: tg[1].midis, dur: 1.4 }, { t: 3.3, midis: A, dur: 1.4 }, { t: 4.8, midis: tg[2].midis, dur: 1.4 }, { t: 6.3, midis: tg[3].midis, dur: 1.4 }];
    const fr = framesOf(L.phone(L.render(ev, { inst }), PHONE));
    PR.track.prepareTargets(full.targets);
    const tr = new PR.track.WaitTracker(tg);
    const events = []; fr.forEach(f => { const e = tr.push(f, f.t); if (e) events.push(e); });
    const wrong = events.filter(e => e.type === 'wrong');
    check('wait/chords: wrong chord flagged as A on the G#m bar', wrong.length === 1 && wrong[0].index === 2 && wrong[0].heard === 'A', wrong.map(w => w.index + ':' + w.heard).join(',') || 'none');
    check('wait/chords: finishes after the correction', tr.done && tr.results.length === 4, tr.results.length + ' results');
  }
  /* 5. tempo mode, chords: on the beat, then two late changes and one skipped bar */
  {
    const bar = 60 / 85 * 4;
    const model = chordModel(['Emaj7', 'C#m', 'G#m', 'B', 'Emaj7', 'C#m', 'G#m', 'B'], eyes);
    const tg = model.targets.map((t, i) => Object.assign({}, t, { start: 1 + i * bar, end: 1 + (i + 1) * bar }));
    const onBeat = tg.map(t => ({ t: t.start, midis: t.midis, dur: bar - 0.05 }));
    let tr = runTempo(tg, framesOf(L.phone(L.render(onBeat, { inst }), PHONE)));
    const offs = tr.results.filter(r => r.hit).map(r => r.offset);
    check('tempo/chords on the beat: 8 of 8 on time', tr.results.filter(r => r.grade === 'on').length === 8, tr.results.map(r => r.grade).join(' '));
    console.log('  info  measured timing offset ' + Math.min(...offs).toFixed(2) + '..' + Math.max(...offs).toFixed(2) + ' s (median ' + PR.dsp.median(offs).toFixed(2) + ')');
    const sloppy = tg.map((t, i) => ({ t: t.start + (i === 2 || i === 5 ? 1.3 : 0), midis: t.midis, dur: bar - 0.05 - (i === 2 || i === 5 ? 1.3 : 0) })).filter((e, i) => i !== 6);
    sloppy[1].dur = bar + 1.25; sloppy[4].dur = bar + 1.25;
    tr = runTempo(tg, framesOf(L.phone(L.render(sloppy, { inst }), PHONE)));
    const grades = tr.results.map(r => r.grade);
    check('tempo/chords sloppy: late changes graded late, skipped bar graded miss', grades[2] === 'late' && grades[5] === 'late' && grades[6] === 'miss' && grades.filter(g => g === 'on').length === 5, grades.join(' '));
  }
  /* 6. tempo mode, notes: eighth notes at 90 BPM, one wrong note */
  {
    const step = 60 / 90 / 2;
    const seq = [45, 48, 52, 57, 52, 48, 45, 48, 52, 57, 60, 57, 52, 48, 45, 45];
    const tg = noteTargets(seq).map((t, i) => Object.assign(t, { start: 1 + i * step, end: 1 + (i + 1) * step }));
    const perf = seq.map((m, i) => ({ t: 1 + i * step, midis: [i === 9 ? 55 : m], dur: step - 0.02 }));
    const tr = runTempo(tg, framesOf(L.phone(L.render(perf, { inst }), PHONE)));
    const grades = tr.results.map(r => r.grade);
    check('tempo/notes eighths at 90 BPM: 15 on time, the wrong one missed', grades.filter(g => g === 'on').length === 15 && grades[9] === 'miss', grades.join(' ') + ' | wrong heard: ' + tr.results[9].wrong);
    const offs = tr.results.filter(r => r.hit).map(r => r.offset);
    console.log('  info  note timing offset ' + Math.min(...offs).toFixed(3) + '..' + Math.max(...offs).toFixed(3) + ' s (median ' + PR.dsp.median(offs).toFixed(3) + ')');
  }
  /* 7. take scoring: chords, free tempo (about 70 BPM), one wrong chord, starts on bar 3 of the chart */
  {
    const names = ['Emaj7', 'C#m', 'G#m', 'B', 'Emaj7', 'C#m', 'G#m', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'F#m', 'G#m'];
    const sh = Object.assign({ A: 'x02220', 'F#m': '244222' }, eyes);
    const model = chordModel(names, sh);
    const bar = 60 / 70 * 4;
    const perfFull = model.targets.map((t, i) => ({ t: 0.5 + i * bar, midis: t.midis, dur: bar - 0.25 }));
    let rep = PR.take.scoreTake(framesOf(L.phone(L.render(perfFull, { inst }), PHONE)), model.targets, {});
    check('take/chords clean: every change found', rep.ok && rep.hits === rep.total && rep.total === 16, rep.ok ? rep.hits + '/' + rep.total + ' wrong ' + rep.wrong + ' missed ' + rep.missed + ' extras ' + rep.extras : rep.reason);
    check('take/chords clean: tempo estimate near 70 BPM', rep.ok && Math.abs(rep.bpm - 70) < 3, rep.ok ? 'bpm ' + rep.bpm.toFixed(1) + ' steadiness ' + (rep.steadiness === null ? '-' : rep.steadiness.toFixed(2)) : '');
    const Dm = M.shapeMidi(M.parseShape('xx0231'), 'standard', 0);
    const perfBad = model.targets.map((t, i) => ({ t: 0.5 + i * bar, midis: i === 6 ? model.targets[8].midis : t.midis, dur: bar - 0.25 })).slice(2);
    perfBad.forEach(e => { e.t -= 2 * bar; });
    rep = PR.take.scoreTake(framesOf(L.phone(L.render(perfBad, { inst }), PHONE)), model.targets, {});
    const w = rep.ok ? rep.items.filter(it => it.status === 'wrong') : [];
    check('take/chords: started on bar 3, one wrong chord named', rep.ok && rep.coverage.first === 2 && rep.total === 14 && rep.hits === 13 && w.length === 1 && w[0].label === 'G#m' && w[0].heard === 'A', rep.ok ? 'first ' + rep.coverage.first + ' total ' + rep.total + ' hits ' + rep.hits + ' wrong: ' + w.map(x => x.label + ' heard ' + x.heard).join(',') : rep.reason);
  }
  /* 8. take scoring: single notes, one wrong, one skipped */
  {
    const seq = mel.slice(0, 16);
    const tg = noteTargets(seq);
    const perf = [];
    let t = 0.4;
    seq.forEach((m, i) => { if (i === 7) return; perf.push({ t, midis: [i === 3 ? 48 : m], dur: 0.4 }); t += 0.45; });
    const rep = PR.take.scoreTake(framesOf(L.phone(L.render(perf, { inst }), PHONE)), tg, {});
    const st = rep.ok ? rep.items.map(it => it.status[0]).join('') : rep.reason;
    check('take/notes: 14 hits, one wrong (index 3), one missed (index 7)', rep.ok && rep.hits === 14 && rep.items[3].status === 'wrong' && rep.items[7].status === 'missed', st + (rep.ok ? ' extras ' + rep.extras + ' cents ' + (rep.cents === null ? '-' : rep.cents.toFixed(1)) : ''));
  }
  /* 9. looped take: the four-chord loop three times round */
  {
    const model = chordModel(['Emaj7', 'C#m', 'G#m', 'B'], eyes);
    const perf = [];
    for (let k = 0; k < 12; k++) perf.push({ t: 0.5 + k * 2.4, midis: model.targets[k % 4].midis, dur: 2.2 });
    const rep = PR.take.scoreTake(framesOf(L.phone(L.render(perf, { inst }), PHONE)), model.targets, { loop: true });
    check('take/loop: three rounds of the loop, 12 changes', rep.ok && rep.hits === 12 && rep.total === 12 && rep.coverage.loops === 3, rep.ok ? rep.hits + '/' + rep.total + ' loops ' + rep.coverage.loops + ' bpm ' + (rep.bpm ? rep.bpm.toFixed(0) : '-') : rep.reason);
  }
  /* 10. tuner clip: low E string 14 cents flat */
  {
    const x = L.phone(L.detune(L.render([{ t: 0.1, midis: [40], dur: 2.5 }], { inst, tail: 0 }), -14), PHONE);
    const cp = PR.take.clipPitch(PR.take.extractFrames(x, L.SR, { chroma: false }));
    check('tuner clip: E2 read as E2, about 14 cents flat', cp && cp.note === 40 && Math.abs(cp.cents + 14) < 4, cp ? M.midiName(cp.note) + ' ' + cp.cents.toFixed(1) + ' cents' : 'none');
  }
  /* 11. silence and noise must not score */
  {
    const quiet = L.phone(new Float32Array(L.SR * 4), { hp: 0, noise: 0.002 });
    const model = chordModel(['Emaj7', 'C#m', 'G#m', 'B'], eyes);
    const rep = PR.take.scoreTake(framesOf(quiet), model.targets, {});
    check('take: room noise only gives no score', !rep.ok || rep.hits === 0, rep.ok ? 'hits ' + rep.hits : rep.reason);
    const { tr } = runWait(model.targets.map(t => Object.assign({}, t)), framesOf(quiet));
    check('wait: room noise only gives no hits', tr.results.length === 0, tr.results.length + ' results');
  }
}
console.log(failures ? '\nTRACKING: ' + failures + ' CHECK(S) FAILED' : '\nTRACKING: ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

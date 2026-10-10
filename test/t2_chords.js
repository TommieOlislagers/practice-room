'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'src', 'music.js'));
const PR = require(path.join(__dirname, '..', 'src', 'engine.js'));
const L = require('./lib.js');
const M = PR.music;
const mode = process.argv[2] || 'all';

function chromaAt(x, an, t) {
  const pos = Math.round(t * L.SR);
  const buf = new Float32Array(an.needed);
  const from = pos - an.needed;
  if (from < 0) buf.set(x.subarray(0, pos), -from); else buf.set(x.subarray(from, pos));
  const f = an.analyze(buf, an.needed, false, true);
  return Float32Array.from(f.chroma);
}

/* (a) single-note profile: where does the energy of one note land, by interval above it */
if (mode === 'all' || mode === 'profile') {
  for (const inst of ['acoustic_guitar_steel', 'electric_guitar_clean']) {
    for (const ph of [null, { hp: 180, noise: 0.0008 }]) {
      const an = PR.dsp.createAnalyzer(L.SR);
      const groups = { 'E2-B2': [40, 47], 'C3-B3': [48, 59], 'C4-B4': [60, 71], 'C5-C6': [72, 84] };
      for (const g of Object.keys(groups)) {
        const acc = new Float64Array(12); let n = 0, cosSum = 0;
        for (let midi = groups[g][0]; midi <= groups[g][1]; midi++) {
          let x = L.render([{ t: 0.05, midis: [midi], dur: 2.5 }], { inst, tail: 0 });
          if (ph) x = L.phone(x, ph);
          for (const t of [0.45, 0.8]) {
            const c = chromaAt(x, an, t);
            for (let k = 0; k < 12; k++) acc[k] += c[(midi + k) % 12];
            cosSum += PR.dsp.cosine(c, PR.dsp.templateFromMidi([midi])); n++;
          }
        }
        console.log(inst.slice(0, 8), ph ? 'phone' : 'clean', g.padEnd(6), 'by interval 0..11:', Array.from(acc).map(v => (v / n).toFixed(2)).join(' '), ' cos(own template)', (cosSum / n).toFixed(3));
      }
    }
  }
}

const CHORDS = ['C', 'D', 'E', 'G', 'A', 'Am', 'Em', 'Dm', 'F', 'Bm', 'B', 'F#m', 'C#m', 'G#m', 'Bb', 'Gm', 'Cm', 'Fm', 'Eb', 'Ab',
  'B7', 'E7', 'A7', 'D7', 'G7', 'C7', 'Cmaj7', 'Fmaj7', 'Amaj7', 'Dmaj7', 'Gmaj7', 'Am7', 'Em7', 'Dm7', 'Bm7', 'F#m7',
  'Dsus4', 'Dsus2', 'Asus2', 'Asus4', 'Esus4', 'Cadd9', 'E5', 'A5', 'D5', 'G5'];

function voicing(name, shapes) {
  const ch = M.parseChord(name);
  const sh = M.shapeFor(ch, shapes);
  if (!sh) throw new Error('no shape for ' + name);
  return { name, chord: ch, shape: sh, midis: M.shapeMidi(sh, 'standard', 0) };
}

/* (b) identify each chord among all the others */
if (mode === 'all' || mode === 'ident') {
  const vs = CHORDS.map(n => voicing(n));
  vs.push(Object.assign(voicing('Emaj7', { Emaj7: 'x79897' }), { name: 'Emaj7@7' }));
  const targets = vs.map((v, i) => ({ index: i, kind: 'chord', midis: v.midis, label: v.name, chordName: v.name }));
  PR.track.prepareTargets(targets);
  for (const inst of ['acoustic_guitar_steel', 'electric_guitar_clean']) {
    for (const [phLabel, ph] of [['clean', null], ['phone', { hp: 180, noise: 0.0008 }], ['thin+noise', { hp: 300, noise: 0.003 }]]) {
      const an = PR.dsp.createAnalyzer(L.SR);
      let top1 = 0, pass = 0, n = 0, minOwn = 1, sumOwn = 0; const fails = [];
      targets.forEach(t => {
        let x = L.render([{ t: 0.05, midis: t.midis, dur: 2.5 }], { inst, tail: 0 });
        if (ph) x = L.phone(x, ph);
        for (const at of [0.45, 0.7, 1.1]) {
          const c = chromaAt(x, an, at);
          const sc = PR.track.chordScore(c, t);
          n++; sumOwn += sc.s; minOwn = Math.min(minOwn, sc.s);
          if (sc.s >= sc.rival) top1++;
          if (PR.track.chordOk(sc, 0)) pass++;
          else fails.push(t.label + '@' + at + ' own ' + sc.s.toFixed(2) + ' vs ' + sc.rivalName + ' ' + sc.rival.toFixed(2));
        }
      });
      console.log(inst.slice(0, 8), phLabel.padEnd(10), 'top-1 among ' + targets.length + ' chords:', top1 + '/' + n, ' passes tracker rule:', pass + '/' + n, ' mean own', (sumOwn / n).toFixed(3), ' min own', minOwn.toFixed(2));
      if (fails.length) console.log('    fails: ' + fails.slice(0, 14).join('; ') + (fails.length > 14 ? ' …+' + (fails.length - 14) : ''));
    }
  }
}

/* (c) within one song: each chord of the chart against the chart's other chords */
if (mode === 'all' || mode === 'song') {
  const songs = {
    'Eyes (original)': { names: ['Emaj7', 'C#m', 'G#m', 'B', 'A', 'F#m', 'E5', 'D'], shapes: { Emaj7: 'x79897', B: '799877', 'C#m': 'x46654', 'G#m': '466444', A: 'x02220', 'F#m': '244222' } },
    'Eyes (capo 4 shapes)': { names: ['C', 'Am', 'Em', 'G', 'F', 'Dm'], capo: 4 },
    'G C D Em Am': { names: ['G', 'C', 'D', 'Em', 'Am', 'D7', 'Cadd9', 'Dsus4'] },
    'A D E + 7ths': { names: ['A', 'D', 'E', 'A7', 'D7', 'E7', 'Bm', 'F#m'] }
  };
  for (const title of Object.keys(songs)) {
    const sg = songs[title];
    const vs = sg.names.map(n => { const v = voicing(n, sg.shapes); v.midis = M.shapeMidi(v.shape, 'standard', sg.capo || 0); return v; });
    const targets = vs.map((v, i) => ({ index: i, kind: 'chord', midis: v.midis, label: v.name, chordName: v.name }));
    PR.track.prepareTargets(targets);
    for (const inst of ['acoustic_guitar_steel', 'electric_guitar_clean']) {
      const an = PR.dsp.createAnalyzer(L.SR);
      let pass = 0, n = 0; const rows = [];
      targets.forEach(t => {
        const x = L.phone(L.render([{ t: 0.05, midis: t.midis, dur: 2.5 }], { inst, tail: 0 }), { hp: 180, noise: 0.0008 });
        let worstMargin = 9, own = 0;
        for (const at of [0.45, 0.7, 1.1, 1.6]) {
          const sc = PR.track.chordScore(chromaAt(x, an, at), t);
          n++; if (PR.track.chordOk(sc, 0)) pass++;
          if (sc.s - sc.rival < worstMargin) { worstMargin = sc.s - sc.rival; own = sc.s; rows[t.index] = t.label + ' ' + sc.s.toFixed(2) + ' (next ' + sc.rivalName + ' ' + sc.rival.toFixed(2) + ')'; }
        }
      });
      console.log(title.padEnd(22), inst.slice(0, 8), 'pass', pass + '/' + n, '|', rows.join(' | '));
    }
  }
}

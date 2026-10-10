'use strict';
/* Renders test performances from sampled guitar notes, through the phone-microphone model. */
const path = require('path');
const PR = require(path.join(__dirname, '..', 'src', 'music.js'));
const L = require('./lib.js');
const M = PR.music;
const out = path.join(__dirname, '..', 'wav');
const PHONE = { hp: 180, noise: 0.0008 };
const inst = 'acoustic_guitar_steel';
function shape(name, shapes) { return M.shapeMidi(M.shapeFor(M.parseChord(name), shapes), 'standard', 0); }
// 1. tuner: low E, 14 cents flat
L.wav(L.phone(L.detune(L.render([{ t: 0.3, midis: [40], dur: 3 }, { t: 3.6, midis: [40], dur: 3 }], { inst, tail: 0.2 }), -14), PHONE), path.join(out, 'tuner_E2_flat14.wav'));
// 2. E minor pentatonic drill, as written in the page (d-empent)
const pent = [[6,0],[6,3],[5,0],[5,2],[4,0],[4,2],[3,0],[3,2],[2,0],[2,3],[1,0],[1,3],[1,0],[2,3],[2,0],[3,2],[3,0],[4,2],[4,0],[5,2],[5,0],[6,3],[6,0]];
const tun = [40, 45, 50, 55, 59, 64];
const pm = pent.map(p => tun[6 - p[0]] + p[1]);
L.wav(L.phone(L.render(pm.map((m, i) => ({ t: 1.0 + i * 0.55, midis: [m], dur: 0.5 })), { inst, tail: 0.5 }), PHONE), path.join(out, 'pent_wait.wav'));
// the same drill with one wrong note (G#2 instead of G2 as the second note), then corrected
const ev = []; let t = 1.0;
pm.forEach((m, i) => { if (i === 1) { ev.push({ t, midis: [44], dur: 0.5 }); t += 0.7; } ev.push({ t, midis: [m], dur: 0.5 }); t += 0.55; });
L.wav(L.phone(L.render(ev, { inst, tail: 0.5 }), PHONE), path.join(out, 'pent_wrong.wav'));
// 3. first changes drill in time: Em G D C x4 at 60 BPM, 4 beats each, starting at t = 0 (played against the click)
const names = ['Em', 'G', 'D', 'C'];
const bars = []; for (let r = 0; r < 4; r++) names.forEach(n => bars.push(n));
// bar 6 is late by 1.5 s, bar 11 is the wrong chord (Am for D)
L.wav(L.phone(L.render(bars.map((n, i) => ({ t: i * 4 + (i === 5 ? 1.5 : 0), midis: shape(i === 10 ? 'Am' : n), dur: 3.8 - (i === 5 ? 1.5 : 0) })), { inst, tail: 0.5 }), PHONE), path.join(out, 'first_tempo.wav'));
// 4. a take of Eyes Without a Face, verse then chorus, free tempo (about 72 BPM), one wrong chord (A for G#m in the second verse line)
const eyes = { Emaj7: 'x79897', 'C#m': 'x46654', 'G#m': '466444', B: '799877', A: 'x02220', 'F#m': '244222' };
const seq = ['Emaj7', 'C#m', 'G#m', 'B', 'Emaj7', 'C#m', 'G#m', 'B', 'Emaj7', 'C#m', 'G#m', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'F#m', 'G#m'];
const bar = 60 / 72 * 4;
L.wav(L.phone(L.render(seq.map((n, i) => ({ t: 0.8 + i * bar, midis: shape(i === 6 ? 'A' : n, eyes), dur: bar - 0.3 })), { inst: 'electric_guitar_clean', tail: 0.6 }), PHONE), path.join(out, 'eyes_take.wav'));
// 5. one-minute changes: Em and G, a change every 1.5 s for 20 s
const omc = []; for (let i = 0; i < 14; i++) omc.push({ t: 0.5 + i * 1.5, midis: shape(i % 2 ? 'G' : 'Em'), dur: 1.3 });
L.wav(L.phone(L.render(omc, { inst, tail: 0.5 }), PHONE), path.join(out, 'omc.wav'));
console.log('wav files written');

'use strict';
/* The path to a song: which steps a song gets, what counts as passing one, and that skills carry from song to song.
   Also: every built-in song and every exercise the paths can ask for is playable. */
const path = require('path'), fs = require('fs'), R = path.join(__dirname, '..');
globalThis.PR = require(path.join(R, 'src', 'music.js'));
const cat = {};
fs.readdirSync(path.join(R, 'seed', 'lib')).filter(f => /\.json$/.test(f)).forEach(f => { const s = JSON.parse(fs.readFileSync(path.join(R, 'seed', 'lib', f), 'utf8')); cat[s.id] = s; });
globalThis.PR.catalog = cat;
require(path.join(R, 'src', 'app-core.js')); require(path.join(R, 'src', 'app-ways.js')); require(path.join(R, 'src', 'app-path.js'));
const App = globalThis.PR.app, S = App.S, P = App.path, M = globalThis.PR.music;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
const now = Date.now(); let n = 0;
const sess = o => Object.assign({ id: 'p' + (++n), at: now - 1000 * (1000 - n), kind: 'tempo', secs: 60, pct: 100, section: 'Whole song' }, o);
const fresh = list => { S.sessions = list; P.reset(); };
const songA = { id: 'a', title: 'Song A', artist: 'Band', level: 1, bpm: 100, updatedAt: 1, needs: ['strum-eighths'], scale: { root: 'G', type: 'penta-major' },
  sections: [{ name: 'Verse 1', type: 'chords', bars: ['G', 'C', 'G', 'D'] }, { name: 'Chorus', type: 'chords', bars: ['Em', 'C', 'G', 'D'] }, { name: 'Verse 2', type: 'chords', bars: ['G', 'C', 'G', 'D'] }] };
const songB = { id: 'b', title: 'Song B', artist: 'Band', level: 2, bpm: 90, updatedAt: 1, sections: [{ name: 'Round', type: 'chords', bars: ['G', 'D', 'F', 'C G'] }] };
S.songs = { a: songA, b: songB };

fresh([]);
let p = P.of(songA);
const ids = k => p.steps.filter(s => s.kind === k).map(s => s.title).join(', ');
check('shapes: one step for each chord, in the order they first appear', ids('shape') === 'G, C, D, Em', ids('shape'));
check('changes: the pairs that come up, most frequent first', p.steps.filter(s => s.kind === 'change').length === 4 && /^(G → C|C → G)$/.test(p.steps.filter(s => s.kind === 'change')[0].title), ids('change'));
check('technique: steady strumming first, then what the song asks for, then its scale', ids('tech') === 'Steady strums on the beat, Down-up eighths' && ids('scale') === 'G major pentatonic', ids('tech') + ' / ' + ids('scale'));
check('parts: the two verses are one step, the chorus another', ids('part') === 'Verse, Chorus', ids('part'));
check('the song: one strum a chord first, then with its strumming pattern, and full speed last finishes it', ids('song') === 'The whole song, one strum a chord, The whole song with its strumming pattern, slowed down, The whole song with its strumming pattern' && p.steps[p.steps.length - 1].final === true && p.steps[p.steps.length - 1].way === 'strum', ids('song'));
check('nothing done yet: the first step is next', p.done === 0 && !p.mastered && p.next === p.steps[0] && p.pct === 0 && p.total === p.steps.length, p.total + ' steps');
check('one song with one part gets no separate part step', P.of(songB).steps.filter(s => s.kind === 'part').length === 0);
check('a barre chord and two chords in a bar bring their own drills', /The E-shape barre/.test(P.of(songB).steps.map(s => s.title).join()) && /Two chords in a bar/.test(P.of(songB).steps.map(s => s.title).join()));

/* passing */
const gShape = p.steps[0].id;
fresh([sess({ song: gShape, acc: 0.79, kind: 'wait' })]);
check('79% on an exercise does not pass it, and the best so far is kept', !P.of(songA).steps[0].done && P.of(songA).steps[0].best === 0.79);
fresh([sess({ song: gShape, acc: 0.79, kind: 'wait' }), sess({ song: gShape, acc: 0.95, kind: 'self', self: true })]);
p = P.of(songA);
check('80% or better passes it (a play-along rated clean counts)', p.steps[0].done && p.done === 1 && p.next.title === 'C');
check('the same shape is already done in the other song', P.of(songB).steps[0].title === 'G' && P.of(songB).steps[0].done && P.of(songB).done === 1);
fresh([{ id: 'o1', at: now, kind: 'omc', song: 'a', pair: ['C', 'G'], count: 29, secs: 60 }]);
check('29 changes in a minute is not enough', !P.of(songA).steps.find(s => s.kind === 'change' && /G/.test(s.title) && /C/.test(s.title)).done && P.of(songA).steps.find(s => s.kind === 'change').count === 29);
fresh([{ id: 'o1', at: now, kind: 'omc', song: 'a', pair: ['C', 'G'], count: 31, secs: 60 }]);
check('30 or more is, whichever way round the pair was drilled, and for both songs', P.of(songA).steps.find(s => s.id === 'chg:C|G').done && P.of(songB).steps.find(s => s.id === 'chg:C|G').done);
fresh([sess({ song: 'a', section: 'Verse 2', acc: 0.9, pct: 60 }), sess({ song: 'a', section: 'Chorus', acc: 0.9, pct: 70, kind: 'wait' })]);
check('a part too slow, or without keeping time, does not count', P.of(songA).steps.filter(s => s.kind === 'part' && s.done).length === 0);
fresh([sess({ song: 'a', section: 'Verse 2', acc: 0.9, pct: 70 }), sess({ song: 'a', section: 'Chorus', acc: 0.85, kind: 'take', pct: 40 })]);
check('a part in time at 70% counts (either verse), and so does a recorded take', P.of(songA).steps.filter(s => s.kind === 'part' && s.done).length === 2);
fresh([sess({ song: 'a', acc: 0.9, pct: 80 })]);
p = P.of(songA);
check('the whole song at 80% speed ticks the slow step, not the last one', p.steps.find(s => s.id === 'song:slow').done && !p.steps.find(s => s.id === 'song:full').done && !p.mastered);
fresh([sess({ song: 'a', acc: 0.95, pct: 100 })]);
p = P.of(songA);
check('one strum a chord at full speed does not finish the song', !p.mastered && p.steps.find(s => s.id === 'song:slow').done && !p.steps.find(s => s.id === 'song:way').done);
fresh([sess({ song: 'a', acc: 0.9, pct: 80, way: 'strum' })]);
p = P.of(songA);
check('with the strumming pattern at 80% speed: the slow steps, not the last', p.steps.find(s => s.id === 'song:way').done && p.steps.find(s => s.id === 'song:slow').done && !p.mastered);
fresh([sess({ song: 'a', acc: 0.9, pct: 100, way: 'lead' })]);
check('the lead line does not stand in for the rhythm part', !P.of(songA).mastered && P.of(songA).bonus.find(b => b.id === 'way:lead').done);
fresh([sess({ song: 'a', acc: 0.9, pct: 100, way: 'strum' })]);
p = P.of(songA);
check('the whole song with its pattern at full speed finishes the song, whatever else is open', p.mastered && p.pct === 100 && p.done === p.total && p.next === null);
check('...and the summary counts it', P.summary().mastered === 1 && P.summary().days[App.dayKey(S.sessions[0].at)] === 1);
fresh([sess({ song: gShape, acc: 0.9 }), sess({ song: 'x:tech:strum-quarters', acc: 0.9 }), { id: 'o1', at: now, kind: 'omc', song: 'a', pair: ['C', 'G'], count: 40, secs: 60 }]);
check('skills are counted once however many songs use them', P.summary().skills === 3 && P.summary().skillsOf > 10, P.summary().skills + ' of ' + P.summary().skillsOf);
const before = P.snap('a');
S.sessions = S.sessions.concat([sess({ song: 'x:shape:C~x32010', acc: 1 })]);
const d = P.diff(before);
check('what one run changed: the step that was ticked, and the song is not finished', d.steps.length === 1 && d.steps[0].title === 'C' && !d.mastered && d.path.done === 4);

/* ways to play, and the part from a pasted tab */
const W = App.ways;
check('a chord song can be played seven other ways; a waltz or a ballad gets the ones that fit', W.list(songA).map(w => w.id).join() === 'chords,strum,bass,arp,thumb,lead' && W.main(songA) === 'strum' && W.main(Object.assign({}, songA, { needs: ['travis'] })) === 'thumb', W.list(songA).map(w => w.id).join());
const lens = W.list(songA).map(w => App.modelOf(W.song(songA, w.id))).map(m => m.totalBeats + ':' + m.targets.length);
check('every way lasts exactly as long as the chord chart, with more to play', lens.every(x => x.split(':')[0] === '48') && lens.slice(1).every(x => +x.split(':')[1] > 12), lens.join(' '));
const sm = App.modelOf(W.song(Object.assign({}, songA, { strum: 'D DU UDU' }), 'strum'));
check('strumming: six strokes a bar, upstrokes on three strings, the chart still one cell a bar', sm.targets.slice(0, 6).map(t => t.stroke + t.midis.length).join() === 'D6,D6,U3,U3,D6,U3' && sm.view[0].cells.length === 4 && sm.targets[0].beat === 0 && sm.targets[1].beat === 1 && sm.targets[2].beat === 1.5);
const bm = App.modelOf(W.song(songA, 'bass'));
check('bass and strum: a single bass note, the chord, the other bass note, the chord', bm.targets.slice(0, 4).map(t => t.kind + (t.chordName || '')).join() === 'note,chordG,note,chordG' && bm.targets[0].midis[0] === 43 && bm.targets[2].midis[0] === 50);
const lm = App.modelOf(W.song(songA, 'lead'));
check('the lead line: single notes, the root of each chord first, inside one hand position', lm.targets.every(t => t.kind === 'note') && lm.targets[0].midis[0] % 12 === 7 && lm.targets[4].midis[0] % 12 === 0 && Math.max(...lm.targets.map(t => t.pos[0].f)) - Math.min(...lm.targets.map(t => t.pos[0].f)) <= 4);
const withTab = Object.assign({}, songA, { lead: { at: 5, capo: 0, tuning: 'standard', sections: [{ name: 'Riff', type: 'tab', systems: [{ lines: ['e|-0-2-3-|', 'B|-------|', 'G|-------|', 'D|-------|', 'A|-------|', 'E|-------|'] }] }] } });
fresh([]);
check('before a tab is pasted the riff step asks for one; after, it is a way to play the song', P.of(songA).bonus.find(b => b.id === 'tab').missing === true && W.list(withTab).some(w => w.id === 'tab') && App.modelOf(W.song(withTab, 'tab')).targets.length === 3 && P.of(withTab).bonus.find(b => b.id === 'tab').missing === false);
check('go-further steps are not needed to finish the song', P.of(songA).total === P.of(songA).steps.length && P.of(songA).bonus.length >= 4 && P.of(songA).bonus.every(b => !b.done));
fresh([sess({ song: gShape, acc: 0.9 }), sess({ song: 'x:tech:strum-quarters', acc: 0.9 }), { id: 'o1', at: now, kind: 'omc', song: 'a', pair: ['C', 'G'], count: 40, secs: 60 }, sess({ song: 'x:shape:C~x32010', acc: 1 })]);

/* the game layer picks it up */
const g = App.computeGame();
check('the game layer shows the skills and gives the step quest its due', g.path.skills === 4 && App.computeGame().badges.find(b => b.id === 'song1').got === false);
fresh([sess({ song: 'x:shape:G~320003', acc: 1, at: now })]);
check('an exercise earns points but no song stars', App.computeGame().xp > 0 && App.computeGame().starsTotal === 0);

/* everything a path can ask for is playable */
fresh([]); S.songs = {};
const all = App.allSongs();
let bad = [], exN = 0, steps = 0, arr = 0;
all.forEach(song => { const base = App.modelOf(song); W.list(song).forEach(w => { if (w.id === 'chords') return; arr++; const m = App.modelOf(W.song(song, w.id)); if (m.broken || !m.targets.length || Math.abs(m.totalBeats - base.totalBeats) > 0.01 || m.targets.some(t => !t.midis.length || (t.pos || []).some(x => x.f > 17))) bad.push(song.id + ' as ' + w.id); }); });
check('every built-in song can be played every way offered for it, bar for bar', arr > 200 && bad.length === 0, arr + ' arrangements' + (bad.length ? '; BAD ' + bad.slice(0, 5).join('; ') : ''));
bad = [];
all.forEach(song => {
  const pp = P.of(song);
  if (!pp || pp.total < 5) { bad.push(song.id + ': no path'); return; }
  steps += pp.total;
  pp.steps.forEach(st => {
    if (!st.ex) return;
    const ex = App.findSong(st.ex), m = ex && App.modelOf(ex);
    exN++;
    if (!ex || m.broken || m.targets.length < 4 || m.targets.some(t => !t.midis || !t.midis.length)) bad.push(song.id + ': ' + st.ex);
  });
});
check('every built-in song has a path and every exercise on it can be played', all.length >= 9 && bad.length === 0, all.length + ' songs, ' + steps + ' steps, ' + exN + ' exercises' + (bad.length ? '; BAD ' + bad.slice(0, 5).join('; ') : ''));
bad = [];
Object.keys(P.TECH).forEach(k => { const m = App.modelOf(App.findSong('x:tech:' + k)); if (m.broken || m.targets.length < 8) bad.push(k); });
Object.keys(P.SCALES).forEach(t => ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].forEach(r => {
  const ex = App.findSong('x:scale:' + t + ':' + r), m = ex && App.modelOf(ex);
  if (!ex || m.targets.length < 9) { bad.push(t + ' ' + r); return; }
  const pcs = P.SCALES[t].iv.map(i => (M.pcOf(r) + i) % 12), frets = m.targets.map(x => x.pos[0].f), fr = frets.filter(f => f > 0);
  if (m.targets.some(x => pcs.indexOf(x.midis[0] % 12) < 0) || m.targets[0].midis[0] % 12 !== M.pcOf(r) || (fr.length && Math.max(...fr) - Math.min(...fr) > 4)) bad.push(t + ' ' + r + ' (notes or stretch)');
  for (let i = 1; i < m.targets.length / 2; i++) if (m.targets[i].midis[0] <= m.targets[i - 1].midis[0]) { bad.push(t + ' ' + r + ' (not rising)'); break; }
}));
check('all ' + Object.keys(P.TECH).length + ' technique drills build, and every scale in every key stays in the scale and within a hand span', bad.length === 0, bad.slice(0, 6).join('; '));
check('an unknown exercise is nothing, not an error', App.findSong('x:tech:nope') === null && App.findSong('x:shape:H~123') === null && App.findSong('x:scale:major:Q') === null);

/* a player's own copy against the built-in song */
const cid = Object.keys(cat)[0];
S.songs = {}; S.songs[cid] = Object.assign({}, cat[cid], { id: cid, title: 'My edit', updatedAt: (cat[cid].updatedAt || 0) + 5 });
check('an edited copy replaces the built-in song', App.findSong(cid).title === 'My edit' && App.allSongs().filter(x => x.id === cid).length === 1);
S.songs[cid].updatedAt = (cat[cid].updatedAt || 1) - 1;
check('...until the built-in song is corrected later', App.findSong(cid).title === cat[cid].title);
S.songs = {}; App.Store.gone[cid] = (cat[cid].updatedAt || 0) + 5;
check('a built-in song the player removed stays out of the library', App.findSong(cid) === null && App.allSongs().every(x => x.id !== cid));
delete App.Store.gone[cid];

console.log(failures ? '\nPATH: ' + failures + ' CHECK(S) FAILED' : '\nPATH: ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

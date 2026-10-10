'use strict';
/* The rules for joining what a device holds with what the GitHub account holds, and the files that come out. */
const path = require('path');
globalThis.PR = require(path.join(__dirname, '..', 'src', 'music.js'));
require(path.join(__dirname, '..', 'src', 'app-core.js'));
require(path.join(__dirname, '..', 'src', 'app-account.js'));
const A = globalThis.PR.app.acct;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
const song = (title, at) => ({ title, level: 1, sections: [{ name: 'A', type: 'chords', bars: ['Em'] }], updatedAt: at, createdAt: 1 });
const sess = (id, at, extra) => Object.assign({ id, at, song: 's1', title: 'Song', kind: 'tempo', secs: 60 }, extra);
const side = o => Object.assign({ songs: {}, gone: {}, sessions: [], settings: { goal: 10 }, settingsAt: 0 }, o);

check('the same data gives the same text whatever order it was built in', A.canon({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }) === A.canon({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }) && A.canon({ a: undefined, b: 1 }) === '{"b":1}');

let m = A.mergeData(side({ sessions: [sess('p2', 2000), sess('p1', 1000)] }), side({ sessions: [sess('p3', 3000), sess('p1', 1000)] }));
check('sessions: every session from both sides, once, newest first', m.sessions.map(x => x.id).join() === 'p3,p2,p1');

m = A.mergeData(side({ songs: { a: song('Mine newer', 50), b: song('Mine older', 10), c: song('Only here', 5) } }), side({ songs: { a: song('Theirs older', 40), b: song('Theirs newer', 20), d: song('Only there', 5) } }));
check('songs: the newer edit wins, and a song on one side only is kept', m.songs.a.title === 'Mine newer' && m.songs.b.title === 'Theirs newer' && m.songs.c && m.songs.d && Object.keys(m.songs).length === 4);

m = A.mergeData(side({ songs: { a: song('Edited after the delete', 90), b: song('Deleted elsewhere later', 10) }, gone: { c: 70 } }), side({ songs: { c: song('Deleted here later', 60) }, gone: { a: 80, b: 30 } }));
check('a delete beats an older edit, and a newer edit brings the song back', m.songs.a && !m.gone.a && !m.songs.b && m.gone.b === 30 && !m.songs.c && m.gone.c === 70, JSON.stringify([Object.keys(m.songs), m.gone]));
m = A.mergeData(side({ songs: { s: { title: 'Starter', sections: [] } } }), side({ gone: { s: 5 } }));
check('a starter song deleted on one device goes on the other', !m.songs.s && m.gone.s === 5);

m = A.mergeData(side({ settings: { goal: 10 }, settingsAt: 0 }), side({ settings: { goal: 25 }, settingsAt: 9 }));
const m2 = A.mergeData(side({ settings: { goal: 15 }, settingsAt: 12 }), side({ settings: { goal: 25 }, settingsAt: 9 }));
const m3 = A.mergeData(side({ settings: { goal: 15 }, settingsAt: 9 }), side({ settings: null, settingsAt: 0 }));
check('settings go to whichever side changed them last', m.settings.goal === 25 && m.settingsAt === 9 && m2.settings.goal === 15 && m2.settingsAt === 12 && m3.settings.goal === 15);

/* files */
const utc = (y, mo, d, h) => Date.UTC(y, mo - 1, d, h || 12);
const data = side({ songs: { a: Object.assign({ id: 'a', drill: false }, song('One', 5)) }, gone: { z: 3 }, settings: { goal: 20, a4: 442 }, settingsAt: 7,
  sessions: [sess('p3', utc(2026, 11, 1, 0)), sess('p2', utc(2026, 10, 31, 23)), sess('p1', utc(2026, 10, 3))] });
const files = A.filesOf(data);
check('one file for songs and settings, one per month of sessions', Object.keys(files).sort().join() === 'practice-room.json,sessions-2026-10.json,sessions-2026-11.json', Object.keys(files).join());
const oct = JSON.parse(files['sessions-2026-10.json']);
check('a month file lists its sessions oldest first, one per line', oct.sessions.map(x => x.id).join() === 'p1,p2' && files['sessions-2026-10.json'].split('\n').length === 4);
const main = JSON.parse(files['practice-room.json']);
check('the song is stored under its id without page-only fields', main.songs.a.title === 'One' && !('id' in main.songs.a) && !('drill' in main.songs.a) && main.gone.z === 3 && main.settings.goal === 20 && main.settingsAt === 7);
const back = A.readFiles(files);
check('reading the files back gives the same data', back.songs.a.id === 'a' && back.sessions.length === 3 && back.gone.z === 3 && back.settings.a4 === 442 && back.settingsAt === 7 && !back.bad.length);
check('...and writing that again gives the same text, so nothing is sent twice', JSON.stringify(A.filesOf(A.mergeData(side({ settings: null }), back))) === JSON.stringify(files));
const other = A.filesOf(side({ songs: data.songs, gone: data.gone, settings: { a4: 442, goal: 20 }, settingsAt: 7, sessions: data.sessions.slice().reverse() }));
check('...whichever order the device holds it in', Object.keys(files).every(n => other[n] === files[n]) && Object.keys(other).length === Object.keys(files).length);

const odd = A.readFiles({ 'practice-room.json': '{"songs":{"x":{"title":"no sections"},"w":{"title":"text for a level","sections":[],"level":"<i>"},"y":{"title":"ok","sections":[],"level":2,"bpm":null}},"settings":{"goal":999,"a4":"loud","click":false,"evil":"<img>"},"settingsAt":4}', 'sessions-2026-10.json': 'not json', 'sessions-2026-09.json': '{"sessions":[{"id":"p9","at":5,"bpm":null},{"id":"p9","at":5},{"at":6},"x",null,{"id":"p8","at":7,"count":"<b>9</b>"}]}', 'notes.txt': 'hello' });
check('anything that is not the app\'s own data is left out', Object.keys(odd.songs).join() === 'y' && odd.sessions.length === 1 && odd.bad.join() === 'sessions-2026-10.json' && JSON.stringify(odd.settings) === '{"click":false}', JSON.stringify(odd.settings));
check('months are counted in one time zone on every device', A.monthOf(utc(2026, 10, 31, 23)) === '2026-10' && A.monthOf(utc(2026, 11, 1, 0)) === '2026-11' && A.monthOf('x') === '1970-01' && A.monthOf(1e20) === '1970-01');
check('the link to GitHub asks for gists only and nothing that runs out', /personal-access-tokens\/new\?name=Practice%20Room%20/.test(A.keyUrl()) && /&gists=write$/.test(A.keyUrl()) && /expires_in=none/.test(A.keyUrl()) && !/contents|repo/.test(A.keyUrl().replace(/description=[^&]*/, '')) && /tokens\/new\?scopes=gist&/.test(A.keyUrl(true)) && decodeURIComponent(A.keyUrl().match(/name=([^&]*)/)[1]).length <= 40);

console.log(failures ? '\nACCOUNT RULES: ' + failures + ' CHECK(S) FAILED' : '\nACCOUNT RULES: ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

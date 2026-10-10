'use strict';
/* The game layer is worked out from the session log alone: points, levels, stars, quests, streaks, badges. */
const path = require('path');
globalThis.PR = require(path.join(__dirname, '..', 'src', 'music.js'));
require(path.join(__dirname, '..', 'src', 'app-core.js'));
const App = globalThis.PR.app, S = App.S;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
const day = 86400000, now = Date.now();
const sess = (d, o) => Object.assign({ at: now - d * day, song: 's1', title: 'Song', kind: 'tempo', secs: 300, pct: 100 }, o);

S.sessions = [];
let g = App.computeGame();
check('nothing played: level 1, no points, no stars, no badges', g.level === 1 && g.xp === 0 && g.starsTotal === 0 && g.streak === 0 && g.badges.every(b => !b.got) && g.today.done === 0, g.title);

check('stars: 60, 80, 95 percent; the third needs full tempo; a self-rated run stops at two',
  App.starsFor(0.59) === 0 && App.starsFor(0.6) === 1 && App.starsFor(0.8) === 2 && App.starsFor(0.95, 100) === 3 && App.starsFor(0.95, 80) === 2 && App.starsFor(0.95, 100, true) === 2 && App.starsFor(null) === 0);

const items = n => Array.from({ length: n }, () => ({ status: 'hit' }));
const sc = App.scoreItems(items(8).concat([{ status: 'missed' }], items(2), [{ status: 'late' }]));
check('score: 100 a hit, doubled from the 8th in a row, back to single after a miss, 50 for a late one', sc.score === 7 * 100 + 200 + 2 * 100 + 50 && sc.combo === 8, JSON.stringify(sc));
check('multiplier steps at 8, 16, 24 and stops at 4', [0, 7, 8, 16, 24, 80].map(App.multOf).join() === '1,1,2,3,4,4');

S.sessions = [sess(0, { acc: 0.9, hits: 18, total: 20, score: 2600, combo: 12 })];
g = App.computeGame();
const xp1 = Math.round(300 / 6) + 36 + 35;
check('one good run today: session points plus the "80%" quest', g.xp === xp1 + 40 && g.songs.s1.stars === 2 && g.songs.s1.score === 2600 && g.today.quests[1].done && !g.today.quests[0].done && g.streak === 1, g.xp + ' XP');
check('badges: first session and first star, nothing else', g.badges.filter(b => b.got).map(b => b.id).join() === 'first,star1');

S.settings.goal = 5;
g = App.computeGame();
check('a lower daily goal completes the time quest', g.today.quests[0].done && g.today.done === 2 && g.xp === xp1 + 80);
S.settings.goal = 10;

/* a week of play, a perfect run, a long streak, an hour in */
S.sessions = [];
for (let d = 0; d < 7; d++) S.sessions.push(sess(d, { acc: 1, hits: 16, total: 16, secs: 620, combo: 30, score: 5000 }));
S.sessions.push({ at: now - 20 * day, kind: 'omc', song: '', title: 'Em → G', secs: 60, count: 34, pair: ['Em', 'G'] });
g = App.computeGame();
const ids = g.badges.filter(b => b.got).map(b => b.id);
check('a week running: streak 7, three stars, flawless, on a roll, an hour in, quick change', g.streak === 7 && g.bestStreak === 7 && g.songs.s1.stars === 3 && ['streak3', 'streak7', 'star3', 'perfect', 'combo25', 'hour1', 'omc30'].every(x => ids.includes(x)) && !ids.includes('streak30') && !ids.includes('omc60'), ids.join(' '));
check('levels: 250 points for the first, 250 more for each after', g.level === 4 && g.into < g.need && g.need === 250 * g.level, 'level ' + g.level + ', ' + g.into + '/' + g.need + ', ' + g.xp + ' XP');
check('the week strip marks the days played and today', g.week.length === 7 && g.week.filter(d => d.today).length === 1 && g.week.find(d => d.today).done);
/* a gap breaks the current streak but not the best one */
S.sessions = S.sessions.filter(x => now - x.at > 1.5 * day);
g = App.computeGame();
check('two days missed: current streak 0, best streak kept', g.streak === 0 && g.bestStreak === 5, g.streak + ' / ' + g.bestStreak);
check('long sessions are capped so leaving the page open earns nothing extra', App.xpOfSession({ secs: 7200 }) === 300);
console.log(failures ? failures + ' FAILED' : 'GAME: ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

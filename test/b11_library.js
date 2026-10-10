'use strict';
/* The library, the path to a song, the goal on Today and the metronome, in a phone-sized browser. */
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
const PORT = 8777, BASE = 'http://127.0.0.1:' + PORT;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
(async () => {
  const srv = await serve(PORT);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [], outside = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.toString()), r => { outside.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE + '/dist/local.html'); await page.waitForTimeout(500);
  const main = async () => (await page.evaluate(() => document.querySelector('#main').innerText)).replace(/\s+/g, ' ');
  const sheet = async () => (await page.evaluate(() => document.querySelector('#sheetBody').innerText)).replace(/\s+/g, ' ');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const shot = async n => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'library-' + n + '.png'), fullPage: true }); };
  const ev = f => page.evaluate(f);
  const SONG = 'ccr-bad-moon-rising';

  console.log('1. the library');
  await page.click('#tabs [data-to="songs"]');
  let t = await main();
  const count = await ev(() => window.PR.app.allSongs().length);
  check('the built-in songs are there without anything saved, grouped by artist', count >= 11 && /Artists/.test(t) && /Creedence Clearwater Revival/.test(t) && /Bad Moon Rising/.test(t) && (await ev(() => Object.keys(window.PR.app.S.songs).length)) === 0, count + ' songs');
  check('every song row shows how far along its path is', /Bad Moon Rising Level 1 · 0 of \d+ steps/.test(t), (t.match(/Bad Moon Rising[^·]*·[^·]*steps/) || [''])[0]);
  check('no words of any song in the page: a chart is section names and chords only', await ev(() => window.PR.app.allSongs().every(s => s.sections.every(sec => sec.type !== 'chords' || sec.bars.every(b => b.split(/\s+/).every(tok => /^(N\.C\.|-)$/.test(tok) || !!window.PR.music.parseChord(tok)))))));
  await page.click('.artist-card[data-name="Creedence Clearwater Revival"]');
  t = await main();
  check('an artist page lists only that artist, with a way back', /All artists/.test(t) && /Bad Moon Rising/.test(t) && !/Billy Idol/.test(t) && !/Warm-up drills/.test(t));
  check('the artist page fits the phone', (await overflow()) <= 0);
  await shot('1-artist');
  await page.click('[data-act="artist"][data-name=""]');
  await page.click('[data-act="genre"][data-name="New wave"]');
  t = await main();
  check('a genre filter narrows the list', /Eyes Without a Face/.test(t) && !/Bad Moon Rising/.test(t));
  await page.click('[data-act="genre"][data-name=""]');
  await page.fill('#q', 'bayou'); await page.waitForTimeout(100);
  check('search finds a song by title', /Born on the Bayou/.test(await main()) && !/Lodi/.test(await main()));
  await page.fill('#q', ''); await page.waitForTimeout(100);

  console.log('2. the path on a song page');
  await page.click('[data-act="open"][data-id="' + SONG + '"]');
  t = await main();
  const total = await ev(() => window.PR.app.path.of(window.PR.app.findSong('ccr-bad-moon-rising')).total);
  check('the song page shows the path, the next step and free play below it', /Path to this song/i.test(t) && new RegExp('0 of ' + total + ' steps').test(t) && /Next step D Every string rings/.test(t) && /Free play/.test(t) && /Listen/.test(t), 'total ' + total);
  await page.click('[data-act="path-toggle"]');
  t = await main();
  check('all steps open out in stages', /Shapes 0 of 3/.test(t) && /Changes 0 of/.test(t) && /Technique 0 of/.test(t) && /Parts 0 of/.test(t) && /The song 0 of 2/.test(t));
  check('the page with every step shown fits the phone', (await overflow()) <= 0);
  await shot('2-path');
  await page.click('[data-act="goal-set"]');
  check('the song can be made the goal', (await ev(() => window.PR.app.S.settings.focus)) === SONG && /Your goal/i.test(await main()) && /your goal now/.test(await page.textContent('#toast')));

  console.log('3. a step: an exercise');
  await page.click('.step.is-next');
  t = await main();
  check('the step opens its exercise, says what passes it and where it leads', /D chord/.test(t) && /Pass this at 80% to tick the step/.test(t) && /a step toward Bad Moon Rising/.test(t) && /String by string/.test(t) && (await ev(() => window.PR.app.practice.st.id)) === 'x:shape:D~xx0232');
  await page.click('[data-act="p-mode"][data-mode="along"]');
  await page.click('[data-act="p-start"]'); await page.waitForTimeout(1500);
  check('it runs on the stage like a song', await ev(() => !document.querySelector('#stage').hidden && !!window.PR.app.practice.st.run));
  await page.click('[data-act="p-stop"]'); await page.waitForTimeout(250);
  await ev(() => { window.PR.app.practice.st.report.secs = 45; });
  await page.click('[data-act="p-rate"][data-v="0.75"]'); await page.waitForTimeout(200);
  check('"a few slips" logs the run but does not tick the step', /Rate it clean to tick the step/.test(await page.textContent('#toast')) && (await ev(() => window.PR.app.path.of(window.PR.app.findSong('ccr-bad-moon-rising')).done)) === 0);
  await page.click('[data-act="p-start"]'); await page.waitForTimeout(800); await page.click('[data-act="p-stop"]'); await page.waitForTimeout(250);
  await ev(() => { window.PR.app.practice.st.report.secs = 45; });
  await page.click('[data-act="p-rate"][data-v="0.95"]'); await page.waitForTimeout(300);
  t = await sheet();
  check('a clean run ticks it and says how far along the song is now', /Step done/.test(t) && /Step done: D/.test(t) && new RegExp('Bad Moon Rising 1 of ' + total + ' steps').test(t) && /Next step: A/.test(t), t.slice(0, 160));
  await shot('3-step-done');
  await page.click('#sheetBody [data-act="path-next"]'); await page.waitForTimeout(300);
  check('"Next step" goes straight to the next exercise', (await ev(() => window.PR.app.practice.st.id)) === 'x:shape:A~x02220' && (await ev(() => window.PR.app.practice.st.from)) === SONG);
  await page.click('.back'); await page.waitForTimeout(200);
  check('back returns to the song, where the step is ticked', (await ev(() => window.PR.app.practice.st.id)) === SONG && new RegExp('1 of ' + total + ' steps').test(await main()));

  console.log('4. skills carry over');
  check('the D shape is already done in another song that uses it', await ev(() => { const P = window.PR.app.path, s = window.PR.app.findSong('ccr-fortunate-son'); return P.of(s).steps.some(x => x.title === 'D' && x.done) && P.of(s).done === 1; }));

  console.log('5. a change, a part and the whole song');
  await ev(() => window.PR.app.pathRun('ccr-bad-moon-rising', window.PR.app.path.of(window.PR.app.findSong('ccr-bad-moon-rising')).steps.find(s => s.kind === 'change').id));
  await page.waitForTimeout(200);
  check('a change step opens the one-minute drill for that pair', /One-minute changes/i.test(await sheet()) && /Start the minute/.test(await sheet()));
  await ev(() => { const A = window.PR.app, o = A.omc.st; o.on = true; o.live = false; o.count = 33; o.t0 = A.audio.now() - 60; A.omc.finish(); });
  await page.waitForTimeout(200);
  t = await sheet();
  check('33 changes in the minute tick it', /Step done: /.test(t) && new RegExp('2 of ' + total + ' steps').test(t), t.slice(-200));
  await page.click('[data-act="sheet-close"]');
  await ev(() => window.PR.app.pathRun('ccr-bad-moon-rising', window.PR.app.path.of(window.PR.app.findSong('ccr-bad-moon-rising')).steps.find(s => s.kind === 'part').id));
  await page.waitForTimeout(300);
  const ps = await ev(() => { const st = window.PR.app.practice.st; return { section: st.section, pct: st.pct, mode: st.mode, run: !!st.run }; });
  check('a part step sets the part and starts (here the microphone is refused, so it falls back)', ps.section >= 0 && ps.pct >= 70, JSON.stringify(ps));
  await ev(() => { const A = window.PR.app; A.practice.stopAll(true); A.sheet.close(); A.Store.addSession({ song: 'ccr-bad-moon-rising', title: 'Bad Moon Rising', kind: 'tempo', secs: 135, pct: 100, section: 'Whole song', acc: 0.92, hits: 92, total: 100, score: 20000, combo: 40, stars: 2 }); A.go({ name: 'practice', id: 'ccr-bad-moon-rising' }); });
  t = await main();
  check('playing the whole song at full speed finishes it', /You can play this song/.test(t) && /Finished/.test(t) && new RegExp(total + ' of ' + total + ' steps, finished').test(t));
  await shot('4-finished');

  console.log('6. Today and Progress');
  await ev(() => window.PR.app.go({ name: 'today' }));
  t = await main();
  check('Today shows the goal as reached and offers the next song', /Goal reached/i.test(t) && /Pick the next song/.test(t));
  await ev(() => { const A = window.PR.app; A.S.settings.focus = 'ccr-fortunate-son'; A.render(true); });
  t = await main();
  check('with a goal under way Today shows the next step and a way to continue', /Your goal/i.test(t) && /Fortunate Son/.test(t) && /Next step/.test(t) && /Continue/.test(t));
  await shot('5-today');
  await page.click('[data-act="path-next"]'); await page.waitForTimeout(250);
  check('"Continue" starts that step', /^x:shape:/.test(await ev(() => window.PR.app.practice.st.id)) && (await ev(() => window.PR.app.practice.st.from)) === 'ccr-fortunate-son');
  await ev(() => window.PR.app.go({ name: 'me' }));
  t = await main();
  check('Progress counts finished songs and learned skills, and gives the first-song badge', /Songs finished 1 ?of/i.test(t) && /Skills learned 2/.test(t) && (await ev(() => window.PR.app.computeGame().badges.find(b => b.id === 'song1').got)));

  console.log('7. the metronome');
  await page.click('#tabs [data-to="tuner"]');
  await page.click('[data-act="tool"][data-tool="metro"]');
  t = await main();
  check('the metronome is the second tool on the tab', /Metronome/.test(t) && /90/.test(await page.textContent('#mBpm')) && /Beats in a bar/i.test(t));
  await page.click('[data-act="met-step"][data-d="1"]'); await page.click('[data-act="met-per"][data-v="3"]');
  await page.evaluate(() => { const r = document.querySelector('#mRange'); r.value = '132'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  check('tempo and beats can be set, and are remembered', (await page.textContent('#mBpm')) === '132' && (await page.locator('#mDots i').count()) === 3 && /"bpm":132,"per":3/.test(await ev(() => localStorage.getItem('pr.metro.v1'))));
  await page.click('[data-act="met-toggle"]'); await page.waitForTimeout(1300);
  const on = await ev(() => ({ on: window.PR.app.met.on, n: window.PR.app.met.n, lit: document.querySelectorAll('#mDots i.is-on').length, stop: /Stop/.test(document.querySelector('[data-act="met-toggle"]').textContent) }));
  check('it clicks and shows the beat', on.on && on.n >= 2 && on.lit === 1 && on.stop, JSON.stringify(on));
  await shot('6-metronome');
  await ev(() => { window.PR.app.met.began = Date.now() - 125000; });
  await page.click('[data-act="met-toggle"]'); await page.waitForTimeout(150);
  const last = await ev(() => window.PR.app.S.sessions[0]);
  check('stopping after two minutes logs them as practice', last.kind === 'metro' && last.secs >= 120 && last.bpm === 132 && /Logged 2 min/.test(await page.textContent('#toast')) && !(await ev(() => window.PR.app.met.on)));
  for (let i = 0; i < 4; i++) { await page.click('[data-act="met-tap"]'); await page.waitForTimeout(500); }
  const tapped = parseInt(await page.textContent('#mBpm'), 10);
  check('tapping sets the tempo', tapped >= 105 && tapped <= 125, String(tapped));
  await page.click('[data-act="met-toggle"]'); await page.click('#tabs [data-to="today"]'); await page.waitForTimeout(100);
  check('leaving the tab stops it', !(await ev(() => window.PR.app.met.on)));

  console.log('8. the tune of a game piece is the player\'s to add');
  const game = await ev(() => { const s = window.PR.app.allSongs().find(x => x.melody); return s ? s.id : ''; });
  if (game) {
    await page.evaluate(id => window.PR.app.go({ name: 'practice', id }), game);
    check('a game piece says it is the chord backing and offers to take a pasted melody tab', /This is the chord backing/.test(await main()));
    await page.click('[data-act="melody-add"]');
    check('...with title and artist filled in', /\(melody\)$/.test(await page.inputValue('#dTitle')) && /Zelda/.test(await page.inputValue('#dArtist')));
    await page.click('[data-act="sheet-close"]');
  } else console.log('  (no game music in the library yet)');
  await ev(() => { const A = window.PR.app; const id = A.Store.saveSong({ title: 'Pasted tune', artist: 'The Legend of Zelda', genre: 'Game music', level: 1, origin: 'paste', checked: true, sections: [{ name: 'Phrase', type: 'tab', systems: [{ lines: ['e|-0-2-3-2-0-----|', 'B|-----------3-1-|', 'G|---------------|', 'D|---------------|', 'A|---------------|', 'E|---------------|'] }] }] }); A.go({ name: 'practice', id }); });
  t = await main();
  check('a pasted tab gets a path of its own', /Path to this song/i.test(t) && /0 of \d+ steps/.test(t) && /The whole song/.test(t));

  check('pictures are only ever asked for from Wikimedia Commons', outside.every(u => /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//.test(u)), outside.slice(0, 3).join(' '));
  await browser.close(); srv.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures += errors.length; }
  console.log(failures ? '\nLIBRARY: ' + failures + ' CHECK(S) FAILED' : '\nLIBRARY: ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });

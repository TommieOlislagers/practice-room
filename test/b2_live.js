'use strict';
/* End-to-end checks in a real browser. The microphone is replaced by a stream that plays rendered guitar audio. */
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
const BASE = 'http://127.0.0.1:8766';
const WAV = n => path.join(__dirname, '..', 'wav', n);
const SHOT = n => path.join(__dirname, '..', 'shots', n + '.png');
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
const eyes = {
  title: 'Eyes Without a Face', artist: 'Billy Idol', level: 3, bpm: 85, capo: 0, tuning: 'standard', key: 'E', origin: 'claude', checked: true,
  shapes: [{ n: 'Emaj7', s: 'x79897' }, { n: 'C#m', s: 'x46654' }, { n: 'G#m', s: '466444' }, { n: 'B', s: '799877' }],
  sections: [{ name: 'Verse', type: 'chords', bars: ['Emaj7', 'C#m', 'G#m', 'B'], repeat: 3 }, { name: 'Chorus', type: 'chords', bars: ['A', 'B', 'A', 'B', 'A', 'B', 'F#m', 'G#m'] }]
};
function fakeMic() {
  window.__fake = { ctx: null, dest: null, buf: null };
  function ensure() { const f = window.__fake; if (!f.ctx) { f.ctx = new AudioContext(); f.dest = f.ctx.createMediaStreamDestination(); } return f; }
  navigator.mediaDevices.getUserMedia = async () => { const f = ensure(); await f.ctx.resume(); return f.dest.stream; };
  window.__loadWav = async (url) => { const f = ensure(); const ab = await (await fetch(url)).arrayBuffer(); f.buf = await f.ctx.decodeAudioData(ab); return f.buf.duration; };
  window.__playWav = (delay) => { const f = ensure(); const s = f.ctx.createBufferSource(); s.buffer = f.buf; s.connect(f.dest); s.start(f.ctx.currentTime + (delay || 0)); f.src = s; return true; };
}
(async () => {
  const srv = await serve(8766);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  async function fresh(opts) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: (opts && opts.dark) ? 'dark' : 'light', deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.addInitScript(song => { localStorage.setItem('pr.songs.v1', JSON.stringify({ s1: Object.assign({ id: 's1' }, song) })); }, eyes);
    if (!opts || opts.mic !== false) await page.addInitScript(fakeMic);
    if (opts && opts.init) await page.addInitScript(opts.init);
    await page.goto(BASE + '/dist/local.html');
    await page.waitForTimeout(500);
    return { ctx, page };
  }
  const openSong = async (page, id) => { await page.click('#tabs [data-to="songs"]'); await page.click('[data-act="open"][data-id="' + id + '"]'); await page.waitForTimeout(200); };
  const sheetText = async page => (await page.textContent('#sheetBody')).replace(/\s+/g, ' ').trim();

  /* A. tuner, live */
  {
    console.log('A. tuner, live microphone');
    const { ctx, page } = await fresh();
    await page.click('#tabs [data-to="tuner"]');
    await page.click('[data-act="tuner-start"]');
    await page.waitForTimeout(400);
    await page.evaluate(u => window.__loadWav(u), BASE + '/wav/tuner_E2_flat14.wav');
    await page.evaluate(() => window.__playWav(0.1));
    await page.waitForTimeout(2300);
    const note = await page.textContent('#tNote'), sub = await page.textContent('#tSub'), verdict = (await page.textContent('#tVerdict')).trim();
    const cents = parseFloat((sub.match(/([+−])(\d+) cents/) || [])[2]) * (sub.indexOf('−') === 0 ? -1 : 1);
    check('reads the low E string and shows it flat', note === 'E' && cents <= -9 && cents >= -19 && /Too low/.test(verdict), note + ' | ' + sub + ' | ' + verdict);
    await page.screenshot({ path: SHOT('live-tuner') });
    await page.click('[data-act="tuner-stop"]');
    await ctx.close();
  }
  /* B, C. wait mode on the pentatonic drill */
  for (const [label, file, expectHits, expectSecond] of [['B. wait mode, played right', 'pent_wait.wav', 23, 0], ['C. wait mode, one wrong note then corrected', 'pent_wrong.wav', 22, 1]]) {
    console.log(label);
    const { ctx, page } = await fresh({ dark: label[0] === 'B' });
    await openSong(page, 'd-empent');
    await page.click('[data-act="p-start"]');
    await page.waitForTimeout(400);
    const dur = await page.evaluate(u => window.__loadWav(u), BASE + '/wav/' + file);
    await page.evaluate(() => window.__playWav(0.1));
    await page.waitForTimeout(5000);
    if (label[0] === 'B') await page.screenshot({ path: SHOT('live-wait-running') });
    await page.waitForSelector('#sheet:not([hidden])', { timeout: (dur + 6) * 1000 });
    const txt = await sheetText(page);
    const m = txt.match(/(\d+) %? ?(\d+) of (\d+) right first time/) || txt.match(/(\d+)%\s*(\d+) of (\d+) right first time/);
    const second = (txt.match(/Second try\s*(\d+)/) || [])[1];
    check('all 23 notes followed, ' + expectHits + ' right first time, ' + expectSecond + ' on a second try', !!m && +m[2] === expectHits && +m[3] === 23 && +second === expectSecond, txt.slice(0, 170));
    if (label[0] === 'B') await page.screenshot({ path: SHOT('live-wait-result') });
    const logged = await page.evaluate(() => JSON.parse(localStorage.getItem('pr.sessions.v1') || '[]'));
    check('session logged', logged.length === 1 && logged[0].kind === 'wait' && logged[0].song === 'd-empent' && logged[0].total === 23, JSON.stringify(logged[0] || {}).slice(0, 160));
    await ctx.close();
  }
  /* D. tempo mode on the first-changes drill: one late change, one wrong chord */
  {
    console.log('D. keep-time mode, 16 bars at 60 BPM, one late change and one wrong chord');
    const { ctx, page } = await fresh();
    await openSong(page, 'd-first');
    await page.click('[data-act="p-live"][data-live="tempo"]');
    await page.evaluate(u => window.__loadWav(u), BASE + '/wav/first_tempo.wav');
    await page.click('[data-act="p-start"]');
    await page.waitForFunction(() => window.PR.app.practice.st.run && window.PR.app.practice.st.run.t0, null, { timeout: 5000 });
    await page.evaluate(() => { const A = window.PR.app.audio, run = window.PR.app.practice.st.run; window.__playWav(Math.max(0, run.t0 - A.ctx.currentTime)); });
    await page.waitForTimeout(14000);
    await page.screenshot({ path: SHOT('live-tempo-running') });
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 75000 });
    const txt = await sheetText(page);
    const m = txt.match(/(\d+)%\s*(\d+) of (\d+) right in their slot/);
    const late = (txt.match(/Late or early\s*(\d+)/) || [])[1], missed = (txt.match(/Missed\s*(\d+)/) || [])[1];
    check('15 of 16 in their slot, 1 late, 1 missed, wrong chord named', !!m && +m[2] === 15 && +m[3] === 16 && +late === 1 && +missed === 1 && /Am for D/.test(txt), txt.slice(0, 330));
    await page.screenshot({ path: SHOT('live-tempo-result') });
    await ctx.close();
  }
  /* E. a recorded take of the lesson song */
  {
    console.log('E. recorded take of Eyes Without a Face (file input), one wrong chord');
    const { ctx, page } = await fresh({ dark: true });
    await openSong(page, 's1');
    await page.click('[data-act="p-mode"][data-mode="take"]');
    await page.setInputFiles('input[data-file="take"]:not([capture])', WAV('eyes_take.wav'));
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 60000 });
    const txt = await sheetText(page);
    const m = txt.match(/(\d+)%\s*(\d+) of (\d+) right/);
    check('19 of 20 right, the wrong chord named, tempo near 72 BPM', !!m && +m[2] === 19 && +m[3] === 20 && /A for G#m/.test(txt) && /about 7[0-4] BPM/.test(txt), txt.slice(0, 330));
    await page.screenshot({ path: SHOT('take-result') });
    await page.click('[data-act="sheet-close"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT('take-chart-marked'), fullPage: true });
    const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('pr.sessions.v1') || '[]')[0]);
    check('take logged with its chord changes', sess && sess.kind === 'take' && sess.changes && sess.changes.length >= 15, JSON.stringify(sess).slice(0, 200));
    await page.click('[data-act="go"][data-to="songs"]'); await page.click('#tabs [data-to="today"]'); await page.waitForTimeout(200);
    await page.screenshot({ path: SHOT('today-after-take'), fullPage: true });
    await ctx.close();
  }
  /* F. tuner from a clip */
  {
    console.log('F. tuner from a recorded clip');
    const { ctx, page } = await fresh();
    await page.click('#tabs [data-to="tuner"]');
    await page.click('[data-act="tuner-mode"][data-mode="clip"]');
    await page.setInputFiles('input[data-file="tuner"]:not([capture])', WAV('tuner_E2_flat14.wav'));
    await page.waitForFunction(() => document.querySelector('#tNote') && document.querySelector('#tNote').textContent === 'E', null, { timeout: 20000 });
    const sub = await page.textContent('#tSub');
    check('clip read as E, about 14 cents flat', /−1[0-8] cents/.test(sub), sub);
    await page.screenshot({ path: SHOT('tuner-clip') });
    await ctx.close();
  }
  /* G. add a song by pasting */
  {
    console.log('G. add a song by pasting a sheet');
    const { ctx, page } = await fresh();
    await page.click('#tabs [data-to="songs"]');
    await page.click('[data-act="add"]');
    await page.fill('#dTitle', 'Test Tune'); await page.fill('#dArtist', 'Nobody');
    const links = await page.$$eval('#findBox a', as => as.map(a => a.href));
    check('search links for the tab sites appear', links.length === 3 && links[0].indexOf('songsterr.com') > 0 && links[1].indexOf('ultimate-guitar.com') > 0, links.join(' | ').slice(0, 200));
    await page.fill('#dText', 'Capo: 2\n\n[Intro]\nG  D  Em  C  x2\n\n[Verse]\nG            D\nsome words here\nEm           C\nmore words\n\n[Riff]\ne|-----------------|\nB|-----------------|\nG|-----------------|\nD|-----2--2--------|\nA|-0-3-------3-0---|\nE|-----------------|\n');
    await page.click('[data-act="draft-read"]');
    await page.waitForSelector('[data-act="draft-save"]');
    await page.screenshot({ path: SHOT('add-preview'), fullPage: false });
    const prev = await sheetText(page);
    check('preview shows the sections and a suggested level', /Intro/.test(prev) && /Riff/.test(prev) && /Suggested level 1/.test(prev) && (await page.inputValue('#dCapo')) === '2', prev.slice(prev.indexOf('What was read'), prev.indexOf('What was read') + 200));
    await page.click('[data-act="draft-save"]');
    await page.waitForTimeout(400);
    const title = await page.textContent('.title');
    const songs = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('pr.songs.v1'))).map(s => s.title + ':' + s.level + ':' + s.capo));
    check('saved and opened', title === 'Test Tune' && songs.length === 2 && songs.indexOf('Test Tune:1:2') >= 0, title + ' | ' + songs.join(', '));
    await page.screenshot({ path: SHOT('pasted-song'), fullPage: true });
    await ctx.close();
  }
  /* H. one-minute changes with the microphone */
  {
    console.log('H. one-minute change drill, heard through the microphone');
    const { ctx, page } = await fresh();
    await openSong(page, 'd-first');
    await page.click('[data-act="omc-pick"]');
    await page.selectOption('#omcA', 'Em'); await page.selectOption('#omcB', 'G');
    await page.click('[data-act="omc-go"]');
    await page.evaluate(u => window.__loadWav(u), BASE + '/wav/omc.wav');
    await page.click('[data-act="omc-start"]');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__playWav(0.1));
    await page.waitForTimeout(22500);
    const count = await page.textContent('#omcCount');
    check('13 changes counted from 14 strums', count === '13', 'count ' + count);
    await page.screenshot({ path: SHOT('omc-running') });
    await page.click('[data-act="omc-stop"]');
    await ctx.close();
  }
  /* I. microphone refused: the page falls back by itself */
  {
    console.log('I. microphone refused by the frame');
    const { ctx, page } = await fresh({ mic: false, init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('blocked', 'NotAllowedError')); } });
    await openSong(page, 'd-empent');
    await page.click('[data-act="p-start"]');
    await page.waitForTimeout(500);
    const take = await page.getAttribute('[data-act="p-mode"][data-mode="take"]', 'aria-pressed');
    const toast = await page.textContent('#toast');
    check('practice switches to "Check a take" and says why', take === 'true' && /Your browser refused the microphone/.test(toast) && /Record a take instead/.test(toast), toast);
    await page.screenshot({ path: SHOT('blocked-practice'), fullPage: true });
    await page.click('[data-act="go"][data-to="songs"]'); await page.click('#tabs [data-to="tuner"]');
    const mode = await page.getAttribute('[data-act="tuner-mode"][data-mode="live"]', 'aria-pressed');
    await page.click('[data-act="tuner-mode"][data-mode="live"]');
    const notice = await page.textContent('#main');
    check('tuner says the browser has it blocked and offers to ask again', /Your browser has the microphone set to blocked for this page/.test(notice) && /Ask again/.test(notice), 'live pressed before: ' + mode);
    await page.click('[data-act="string"][data-i="0"]');
    await page.waitForTimeout(300);
    const voices = await page.evaluate(() => window.PR.app.audio.voices.length);
    check('tapping a string plays its reference tone', voices === 1, voices + ' voice');
    await page.screenshot({ path: SHOT('blocked-tuner'), fullPage: true });
    await ctx.close();
  }
  /* J. a file the browser cannot decode directly is played through and captured instead */
  {
    console.log('J. fallback: decode refused, the take is played through and captured');
    const { ctx, page } = await fresh({ init: () => { const AC = window.AudioContext; const orig = AC.prototype.decodeAudioData; AC.prototype.decodeAudioData = function () { if (window.__allowDecode) return orig.apply(this, arguments); return Promise.reject(new Error('refused for the test')); }; } });
    await openSong(page, 'd-empent');
    await page.click('[data-act="p-mode"][data-mode="take"]');
    await page.setInputFiles('input[data-file="take"]:not([capture])', WAV('pent_wait.wav'));
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 40000 });
    const txt = await sheetText(page);
    const m = txt.match(/(\d+)%\s*(\d+) of (\d+) right/);
    check('23 of 23 notes found through the fallback', !!m && +m[2] === 23 && +m[3] === 23, txt.slice(0, 200));
    await ctx.close();
  }
  /* K. play along without a microphone, then rate yourself */
  {
    console.log('K. play along with the click, self-rated');
    const { ctx, page } = await fresh({ mic: false });
    await openSong(page, 'd-first');
    await page.click('[data-act="p-mode"][data-mode="along"]');
    await page.click('[data-act="p-tempo"][data-d="5"]'); await page.click('[data-act="p-tempo"][data-d="5"]');
    const bpm = await page.textContent('#oTempo');
    await page.click('[data-act="p-start"]');
    await page.waitForTimeout(9000);
    const now = await page.textContent('#hudNow'), bar = await page.textContent('#hudAcc');
    await page.screenshot({ path: SHOT('along-running') });
    await page.waitForTimeout(11000);
    await page.click('[data-act="p-stop"]');
    await page.waitForSelector('[data-act="p-rate"]');
    await page.screenshot({ path: SHOT('along-rate') });
    await page.click('[data-act="p-rate"][data-v="0.75"]');
    await page.waitForTimeout(200);
    const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('pr.sessions.v1') || '[]')[0]);
    check('tempo raised to 66 BPM, the chart moved on, and the self-rating is logged', bpm === '66 BPM' && now === 'G' && bar === '2' && sess && sess.kind === 'self' && sess.self === true && sess.acc === 0.75 && sess.bpm === 66, bpm + ' | now ' + now + ' bar ' + bar + ' | ' + JSON.stringify(sess).slice(0, 180));
    await ctx.close();
  }
  /* L. loop a part in wait mode: the chart starts over and keeps counting */
  {
    console.log('L. wait mode with Loop on, twice round the drill');
    const { ctx, page } = await fresh();
    await openSong(page, 'd-empent');
    await page.check('input[data-in="p-loop"]');
    await page.click('[data-act="p-start"]');
    await page.waitForTimeout(400);
    const dur = await page.evaluate(u => window.__loadWav(u), BASE + '/wav/pent_wait.wav');
    await page.evaluate(d => { window.__playWav(0.1); setTimeout(() => window.__playWav(0), (d + 0.3) * 1000); }, dur);
    await page.waitForTimeout((2 * dur + 1.5) * 1000);
    const hits = await page.textContent('#hudHits');
    await page.click('[data-act="p-stop"]');
    await page.waitForSelector('#sheet:not([hidden])');
    const txt = await sheetText(page);
    check('46 notes over two rounds, all right first time', hits === '46' && /46 of 46 right first time/.test(txt), 'hits ' + hits + ' | ' + txt.slice(0, 120));
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures += errors.length; }
  console.log(failures ? '\nBROWSER: ' + failures + ' CHECK(S) FAILED' : '\nBROWSER: ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });

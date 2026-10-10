'use strict';
/* Asking for the microphone: the page must make a real request, report what happened, and never decide by itself. */
const path = require('path'), fs = require('fs');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
const PORT = 8771, BASE = 'http://127.0.0.1:' + PORT;
const SHOT = n => path.join(__dirname, '..', 'shots', n + '.png');
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
function fakeMic() {
  window.__fake = { ctx: null, dest: null, calls: 0 };
  navigator.mediaDevices.getUserMedia = async () => { const f = window.__fake; f.calls++; if (!f.ctx) { f.ctx = new AudioContext(); f.dest = f.ctx.createMediaStreamDestination(); } await f.ctx.resume(); return f.dest.stream; };
}
(async () => {
  const srv = await serve(PORT);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  async function fresh(inits, dark) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    for (const i of inits || []) await page.addInitScript(i);
    await page.goto(BASE + '/dist/local.html');
    await page.waitForTimeout(500);
    return { ctx, page };
  }
  const state = page => page.evaluate(() => ({ mic: Object.assign({}, window.PR.app.S.mic), log: window.PR.app.diag.lines(8), last: JSON.parse(localStorage.getItem('pr.mic.last') || 'null'), toast: document.querySelector('#toast').textContent, calls: window.__fake ? window.__fake.calls : -1 }));

  /* M. a page on its own, nothing asked yet: Today offers the microphone, one tap asks, the answer is kept */
  {
    console.log('M. own page: nothing is assumed, one tap asks');
    const { ctx, page } = await fresh([fakeMic]);
    const main = (await page.textContent('#main')).replace(/\s+/g, ' ');
    let s = await state(page);
    check('before asking: no verdict, an "Allow the microphone" button on Today', /Live listening needs the microphone/.test(main) && /Allow the microphone/.test(main) && s.mic.pre !== 'blocked' && s.calls === 0, JSON.stringify(s.mic));
    check('the page opening is logged', s.log.some(l => /open: own page at http:\/\/127\.0\.0\.1:\d+, origin own, data local, microphone (unknown|ok).*storage new/.test(l)), s.log.join(' | '));
    await page.screenshot({ path: SHOT('ask-today-before') });
    await page.click('#main [data-act="mic-ask"]');
    await page.waitForTimeout(500);
    s = await state(page);
    const after = (await page.textContent('#main')).replace(/\s+/g, ' ');
    check('after one tap the microphone is granted and the notice is gone', s.calls === 1 && /The microphone is on/.test(s.toast) && !/Live listening needs the microphone/.test(after) && s.last && s.last.ok === true && s.mic.pre === 'ok' && s.log.some(l => /mic: live after \d+ ms/.test(l)), s.toast + ' | ' + s.log[0]);
    await page.click('#tabs [data-to="songs"]');
    await page.click('[data-act="open"][data-id="d-empent"]');
    check('practice opens on "Listen live"', (await page.getAttribute('[data-act="p-mode"][data-mode="live"]', 'aria-pressed')) === 'true');
    await ctx.close();
  }
  /* N. inside Claude's view: the view is asked through its own permission interface, and its answer is logged */
  {
    console.log('N. the Claude view is asked too');
    const host = () => {
      window.__host = { requests: [], states: 0 };
      const perms = { request: async names => { window.__host.requests.push(names); const r = {}; (names || []).forEach(n => { r[n] = 'unavailable'; }); return r; }, state: async () => { window.__host.states++; return { db: 'granted', sample: 'prompt' }; }, manage: async () => {} };
      window.claude = { use: name => new Promise(res => setTimeout(() => res(name === 'permissions' ? perms : null), 30)) };
    };
    const refuse = () => { window.__fake = { calls: 0 }; navigator.mediaDevices.getUserMedia = () => { window.__fake.calls++; return Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); }; };
    const { ctx, page } = await fresh([host, refuse]);
    await page.click('#main [data-act="mic-ask"]');
    await page.waitForTimeout(700);
    const s = await state(page);
    const h = await page.evaluate(() => window.__host);
    check('the view was asked for "microphone" once and its answer is in the log', h.requests.length === 1 && h.requests[0][0] === 'microphone' && s.log.some(l => /host: microphone unavailable; view offers db=granted, sample=prompt/.test(l)), JSON.stringify(h) + ' | ' + s.log.join(' | '));
    check('the browser was asked as well, and its refusal is reported as the browser\'s', s.calls === 1 && s.mic.why === 'denied' && /Your browser refused the microphone/.test(s.toast) && s.log.some(l => /mic: NotAllowedError after \d+ ms \(denied\), own page/.test(l)), s.toast);
    const main = (await page.textContent('#main')).replace(/\s+/g, ' ');
    check('Today now shows the refusal with "Ask again"', /Your browser has the microphone set to blocked for this page/.test(main) && /Ask again/.test(main));
    await page.screenshot({ path: SHOT('ask-today-denied') });
    await page.click('#main [data-act="mic-ask"]');
    await page.waitForTimeout(500);
    const h2 = await page.evaluate(() => window.__host), s2 = await state(page);
    check('asking again asks the browser again, the view only once', h2.requests.length === 1 && s2.calls === 2);
    /* the refusal is remembered: the next visit opens on recordings but can still ask */
    await page.reload(); await page.waitForTimeout(500);
    await page.click('#tabs [data-to="songs"]');
    await page.click('[data-act="open"][data-id="d-empent"]');
    const take = await page.getAttribute('[data-act="p-mode"][data-mode="take"]', 'aria-pressed');
    await page.click('#main [data-act="go"][data-to="songs"]');
    await page.click('#tabs [data-to="today"]');
    const again = (await page.textContent('#main')).replace(/\s+/g, ' ');
    check('next visit: recordings by default, the refusal shown, "Ask anyway" offered', take === 'true' && /The microphone was refused|set to blocked/.test(again) && /Ask anyway/.test(again), again.slice(0, 0));
    await ctx.close();
  }
  /* O. the view grants the microphone itself: the page tries the browser again */
  {
    console.log('O. the view grants it');
    const host = () => {
      const perms = { request: async () => { await new Promise(r => setTimeout(r, 150)); window.__granted = true; return { microphone: 'granted' }; }, state: async () => ({ microphone: 'granted' }), manage: async () => {} };
      window.claude = { use: name => Promise.resolve(name === 'permissions' ? perms : null) };
      window.__fake = { calls: 0, ctx: null, dest: null };
      navigator.mediaDevices.getUserMedia = async () => { const f = window.__fake; f.calls++; if (!window.__granted) throw new DOMException('Permission denied', 'NotAllowedError'); if (!f.ctx) { f.ctx = new AudioContext(); f.dest = f.ctx.createMediaStreamDestination(); } await f.ctx.resume(); return f.dest.stream; };
    };
    const { ctx, page } = await fresh([host]);
    await page.click('#main [data-act="mic-ask"]');
    await page.waitForTimeout(900);
    const s = await state(page);
    check('refused first, granted by the view, then live on the second request', s.calls === 2 && /The microphone is on/.test(s.toast) && s.mic.pre === 'ok' && s.mic.why === '', s.toast + ' | ' + s.log.slice(0, 3).join(' | '));
    await ctx.close();
  }
  /* P. no database in this view: the page starts with its two starter songs, and a deleted one stays deleted */
  {
    console.log('P. starter songs without a database');
    const { ctx, page } = await fresh([fakeMic], true);
    await page.click('#tabs [data-to="songs"]');
    let txt = (await page.textContent('#main')).replace(/\s+/g, ' ');
    check('both versions of the song are in the library', /Billy Idol/.test(txt) && /Eyes Without a Face\s*Level 3/.test(txt) && /Eyes Without a Face \(capo 4, open shapes\)/.test(txt), txt.slice(0, 0));
    await page.screenshot({ path: SHOT('ask-songs-starters'), fullPage: true });
    await page.click('[data-act="open"][data-id="eyes-original"]');
    await page.waitForTimeout(200);
    const song = (await page.textContent('#main')).replace(/\s+/g, ' ');
    check('the song page shows the whole chart', /Hold before the riff/.test(song) && /Verse 3/.test(song) && /Outro/.test(song) && /86 BPM/.test(song), song.slice(0, 160));
    await page.screenshot({ path: SHOT('ask-song-page'), fullPage: true });
    await page.click('[data-act="edit"]');
    await page.click('[data-act="del-ask"]');
    await page.click('[data-act="del-yes"]');
    await page.waitForTimeout(200);
    await page.reload(); await page.waitForTimeout(500);
    await page.click('#tabs [data-to="songs"]');
    txt = (await page.textContent('#main')).replace(/\s+/g, ' ');
    check('a deleted starter stays deleted after a reload', !/Eyes Without a Face\s*Level 3/.test(txt) && /capo 4, open shapes/.test(txt));
    await ctx.close();
  }
  /* Q. settings: the listening panel and the technical log */
  {
    console.log('Q. settings');
    const { ctx, page } = await fresh([fakeMic]);
    await page.click('[data-act="settings"]');
    let txt = (await page.textContent('#sheetBody')).replace(/\s+/g, ' ');
    check('settings shows "Not asked yet" and the log of this visit', /Live microphone\s*Not asked yet\./.test(txt) && /Technical log/.test(txt) && /open: own page/.test(txt), txt.slice(0, 200));
    await page.click('#sheetBody [data-act="mic-ask"]');
    await page.waitForTimeout(500);
    txt = (await page.textContent('#sheetBody')).replace(/\s+/g, ' ');
    check('asking from settings updates the panel and the log', /mic: live after/.test(txt) && /Live microphone\s*Allowed\. Live listening works in this view\./.test(txt) && /Test it again/.test(txt), txt.slice(0, 120));
    await page.screenshot({ path: SHOT('ask-settings'), fullPage: false });
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures += errors.length; }
  console.log(failures ? '\nASKING: ' + failures + ' CHECK(S) FAILED' : '\nASKING: ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });

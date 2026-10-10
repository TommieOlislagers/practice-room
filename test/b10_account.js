'use strict';
/* Signing in with GitHub and keeping progress in the account. GitHub is a stand-in here: the same addresses and
   answers, held in memory, shared by two "devices" (two separate browser profiles). */
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
const PORT = 8776, BASE = 'http://127.0.0.1:' + PORT;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
const KEY1 = 'github_pat_11AAAAAAA0phone000000001_abcdefghijklmnopqrstuvwxyz', KEY2 = 'github_pat_11AAAAAAA0laptop00000002_abcdefghijklmnopqrstuvwxyz';
const KEY3 = 'github_pat_11AAAAAAA0nogists0000003_abcdefghijklmnopqrstuvwxyz', KEY4 = 'ghp_classic0000000000000000000000000004';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function fakeGitHub() {
  const gh = { keys: {}, gists: {}, seq: 0, log: [], down: false, hideFromList: false, truncate: '', slow: 0 };
  gh.keys[KEY1] = { login: 'tommie', gists: true }; gh.keys[KEY2] = { login: 'tommie', gists: true }; gh.keys[KEY3] = { login: 'tommie', gists: false }; gh.keys[KEY4] = { login: 'tommie', gists: true };
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-RateLimit-Remaining, Retry-After', 'cache-control': 'private, max-age=60' };
  const send = (route, status, body, extra) => route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors, extra || {}), body: body === undefined ? '' : JSON.stringify(body) });
  gh.newGist = (owner, files, at) => { const id = ('0000000000000000000000000000000' + (++gh.seq).toString(16)).slice(-32); gh.gists[id] = { id, owner, created_at: at || new Date(Date.UTC(2026, 9, 10, 12, 0, gh.seq)).toISOString(), public: false, description: '', files: Object.assign({}, files) }; return gh.gists[id]; };
  gh.handle = async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE', 'access-control-allow-headers': 'Authorization, Content-Type, Accept', 'access-control-max-age': '86400' }, cors) });
    if (gh.down) { gh.log.push('unreachable ' + method + ' ' + url.pathname); return route.abort('internetdisconnected'); }
    if (gh.slow) await new Promise(r => setTimeout(r, gh.slow));
    if (url.hostname === 'gist.githubusercontent.com') {
      const m = url.pathname.match(/^\/raw\/([0-9a-f]+)\/(.+)$/), g = m && gh.gists[m[1]];
      gh.log.push('RAW ' + (m ? m[2] : url.pathname) + (req.headers().authorization ? ' WITH KEY' : ''));
      return g && g.files[m[2]] !== undefined ? route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/plain; charset=utf-8' }, cors), body: g.files[m[2]] }) : route.fulfill({ status: 404, headers: cors, body: 'no' });
    }
    const auth = (req.headers().authorization || '').replace(/^Bearer /, ''), key = gh.keys[auth];
    let body = null; try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (e) { body = null; }
    const names = body && body.files ? ' [' + Object.keys(body.files).sort().join(' ') + ']' : '';
    gh.log.push(method + ' ' + url.pathname.replace(/[0-9a-f]{32}/, ':id') + names + (key ? '' : ' (bad key)'));
    if (gh.limited) return send(route, 403, { message: 'You have exceeded a secondary rate limit.' }, { 'retry-after': '60' });
    if (!key) return send(route, 401, { message: 'Bad credentials' });
    const view = (g, full) => ({ id: g.id, html_url: 'https://gist.github.com/' + g.owner + '/' + g.id, created_at: g.created_at, public: g.public, description: g.description,
      files: Object.fromEntries(Object.keys(g.files).map(n => { const cut = full && gh.truncate === n; return [n, Object.assign({ filename: n, raw_url: 'https://gist.githubusercontent.com/raw/' + g.id + '/' + n, size: g.files[n].length }, full ? { content: cut ? g.files[n].slice(0, 20) : g.files[n], truncated: cut } : {})]; })) });
    if (method === 'GET' && url.pathname === '/user') return send(route, 200, { login: key.login, name: 'Tommie Olislagers', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4', html_url: 'https://github.com/' + key.login, email: 'private@example.com' });
    if (method === 'GET' && url.pathname === '/gists') return send(route, 200, gh.hideFromList ? [] : Object.values(gh.gists).filter(g => g.owner === key.login).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map(g => view(g, false)));
    if (method === 'POST' && url.pathname === '/gists') {
      if (!key.gists) return send(route, 403, { message: 'Resource not accessible by personal access token' });
      const g = gh.newGist(key.login, Object.fromEntries(Object.keys(body.files).map(n => [n, body.files[n].content])));
      g.public = body.public; g.description = body.description;
      return send(route, 201, view(g, true));
    }
    const m = url.pathname.match(/^\/gists\/([0-9a-f]+)$/), g = m && gh.gists[m[1]];
    if (m && !g) return send(route, 404, { message: 'Not Found' });
    if (m && method === 'GET') return send(route, 200, view(g, true));
    if (m && method === 'PATCH') {
      if (!key.gists) return send(route, 404, { message: 'Not Found' });
      Object.keys(body.files || {}).forEach(n => { if (body.files[n] === null) delete g.files[n]; else g.files[n] = body.files[n].content; });
      return send(route, 200, view(g, true));
    }
    return send(route, 404, { message: 'Not Found' });
  };
  return gh;
}
const chart = (title, bars) => ({ title, artist: 'Test', level: 1, bpm: 90, capo: 0, origin: 'paste', checked: true, sections: [{ name: 'A', type: 'chords', bars }] });

(async () => {
  const srv = await serve(PORT);
  const browser = await chromium.launch();
  const errors = [], gh = fakeGitHub();
  async function device() {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    await ctx.route('https://api.github.com/**', gh.handle);
    await ctx.route('https://gist.githubusercontent.com/**', gh.handle);
    await ctx.route('https://avatars.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    ctx.open = async init => {
      const page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
      page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
      if (init) await page.addInitScript(init);
      await page.goto(BASE + '/dist/local.html');
      await page.waitForTimeout(500);
      return page;
    };
    return ctx;
  }
  const st = page => page.evaluate(() => { const A = window.PR.app, a = A.acct; return { state: a.state, offered: a.offered, user: a.user && a.user.login, gist: a.gist, blind: a.blind, err: a.err, songs: Object.keys(A.S.songs).sort(), sessions: A.S.sessions.map(s => s.title), xp: A.computeGame().xp, goal: A.S.settings.goal, pill: document.querySelector('#sync').textContent.trim(), toast: document.querySelector('#toast').textContent, saved: JSON.parse(localStorage.getItem('pr.account.v1') || 'null'), main: document.querySelector('#main').textContent, sheet: document.querySelector('#sheetBody').textContent.replace(/\s+/g, ' ').trim(), diag: A.diag.lines(8) }; });
  const settle = (page, ms) => page.waitForTimeout(ms || 2300);
  const signIn = async (page, key) => { if (!(await page.locator('#ghKey').count())) await page.click('#sync'); await page.fill('#ghKey', key); await page.click('[data-act="acct-in"]'); await page.waitForTimeout(500); };
  const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const shot = async (page, name) => { await page.waitForTimeout(450); return page.screenshot({ path: path.join(__dirname, '..', 'shots', 'account-' + name + '.png') }); };
  const theGist = () => Object.values(gh.gists)[0];

  /* 1. signed out */
  console.log('1. signed out');
  const phone = await device();
  let page = await phone.open();
  let s = await st(page);
  check('the page offers the account and says where the data is now', s.offered && s.state === 'out' && s.pill === 'This device only' && /Keep your progress/.test(s.main) && /Sign in with GitHub/.test(s.main));
  check('nothing was sent to GitHub before signing in', gh.log.length === 0, gh.log.join(', '));
  await shot(page, '1-today');
  await page.click('.acct-card [data-act="account"]');
  s = await st(page);
  const href = await page.getAttribute('[data-act="acct-key"]', 'href');
  check('the sheet has the two steps and a link that fills in GitHub\'s form', /Make a key on GitHub/.test(s.sheet) && /Paste it here/.test(s.sheet) && /^https:\/\/github\.com\/settings\/personal-access-tokens\/new\?name=Practice%20Room%20iPhone/.test(href) && /gists=write/.test(href) && /expires_in=none/.test(href), href);
  check('the sheet fits the phone', (await noOverflow(page)) <= 0);
  await shot(page, '2-sign-in');

  /* 2. keys that do not work */
  console.log('2. keys that do not work');
  await page.fill('#ghKey', 'hello there'); await page.click('[data-act="acct-in"]'); await page.waitForTimeout(150);
  s = await st(page);
  check('something that is not a key is not sent anywhere', /not a GitHub key/.test(s.sheet) && gh.log.length === 0 && s.state === 'out');
  await signIn(page, 'github_pat_11AAAAAAA0wrong00000000000_abcdefghijklmnopqrstuvwxyz');
  s = await st(page);
  check('a key GitHub refuses: said plainly, nothing kept', /did not accept that key/.test(s.sheet) && s.state === 'out' && s.saved === null && !s.user, s.sheet.slice(-160));
  await signIn(page, KEY3);
  s = await st(page);
  check('a key without the gist permission: said plainly, nothing kept', /not allowed to save gists/.test(s.sheet) && s.state === 'out' && s.saved === null && Object.keys(gh.gists).length === 0, gh.log.slice(-3).join(', '));
  await shot(page, '3-refused');
  gh.down = true;
  await signIn(page, KEY1);
  s = await st(page);
  check('GitHub out of reach: said plainly, nothing kept', /could not be reached/.test(s.sheet) && s.state === 'out' && s.saved === null);
  gh.down = false; gh.log.length = 0;

  /* 3. signing in */
  console.log('3. signing in on the phone');
  await page.evaluate(() => window.PR.app.Store.addSession({ song: 'eyes-original', title: 'Before signing in', kind: 'tempo', secs: 300, pct: 100, acc: 0.9, hits: 18, total: 20, score: 2600, combo: 12 }));
  await signIn(page, '  ' + KEY1 + '\n');
  s = await st(page);
  const g1 = theGist();
  check('signed in: the name is shown and the page says where the data is', s.state === 'in' && s.user === 'tommie' && s.pill === 'Saved to GitHub' && /Tommie Olislagers/.test(s.sheet) && /@tommie/.test(s.sheet) && /Signed in as Tommie Olislagers/.test(s.toast), s.pill + ' / ' + s.toast);
  check('one secret gist was made, holding the songs and the session played before', Object.keys(gh.gists).length === 1 && g1.public === false && Object.keys(g1.files).sort().join() === 'practice-room.json,' + Object.keys(g1.files).filter(n => /^sessions/.test(n))[0] && /Before signing in/.test(Object.values(g1.files).join('')) && Object.keys(JSON.parse(g1.files['practice-room.json']).songs).length === 0, Object.keys(g1.files).join());
  check('the key is kept in this browser only, never in the saved file', s.saved && s.saved.token === KEY1 && s.saved.gist === g1.id && JSON.stringify(gh.gists).indexOf('github_pat_') < 0 && JSON.stringify(gh.gists).indexOf('private@example.com') < 0 && JSON.stringify(s.saved).indexOf('private@example.com') < 0);
  check('the invitation on Today is gone', !/Keep your progress/.test(s.main));
  check('the calls: who am I, look for a saved file, make one', gh.log.join(' | ') === 'GET /user | GET /gists | POST /gists [practice-room.json ' + Object.keys(g1.files).filter(n => /^sessions/.test(n))[0] + ']', gh.log.join(' | '));
  await shot(page, '4-account');
  await page.click('[data-act="sheet-close"]');

  /* 4. playing saves */
  console.log('4. what is played is saved');
  gh.log.length = 0;
  await page.evaluate(() => { const A = window.PR.app; A.Store.addSession({ song: 'eyes-original', title: 'After signing in', kind: 'tempo', secs: 200, pct: 100, acc: 0.85, hits: 17, total: 20 }); A.Store.addSession({ song: 'eyes-original', title: 'And another', kind: 'self', secs: 100, acc: 0.6, self: true }); });
  await settle(page);
  s = await st(page);
  const month = Object.keys(g1.files).filter(n => /^sessions/.test(n))[0];
  check('two sessions go up in one write, and only the month file is sent', gh.log.filter(l => /^PATCH/.test(l)).join() === 'PATCH /gists/:id [' + month + ']' && JSON.parse(g1.files[month]).sessions.length === 3 && s.pill === 'Saved to GitHub', gh.log.join(' | '));
  gh.log.length = 0;
  await page.evaluate(() => window.PR.app.acct.sync('test'));
  await settle(page, 400);
  check('saving again with nothing new writes nothing', gh.log.join(' | ') === 'GET /gists/:id', gh.log.join(' | '));
  gh.log.length = 0;
  await page.click('[data-act="settings"]');
  check('Settings shows the account at the top', /Tommie Olislagers/.test(await page.textContent('#sheetBody .group')) && /saved on this device and in your GitHub account/.test(await page.textContent('#sheetBody')));
  await page.click('[data-act="set-step"][data-key="goal"][data-d="5"]');
  await page.click('[data-act="sheet-close"]');
  await settle(page);
  check('a changed setting is saved too', JSON.parse(g1.files['practice-room.json']).settings.goal === 15 && gh.log.filter(l => /^PATCH/.test(l)).join() === 'PATCH /gists/:id [practice-room.json]', gh.log.join(' | '));

  /* 5. a second device */
  console.log('5. a second device');
  const laptop = await device();
  let page2 = await laptop.open();
  await page2.evaluate(c => { const A = window.PR.app; A.Store.addSession({ song: 'eyes-capo4', title: 'On the laptop, signed out', kind: 'tempo', secs: 120, pct: 100, acc: 0.7, hits: 14, total: 20 }); A.Store.saveSong(Object.assign({ id: 'lap1' }, c)); }, chart('Made On The Laptop', ['Am', 'G']));
  gh.log.length = 0;
  await signIn(page2, KEY2);
  let s2 = await st(page2);
  check('it finds the same saved file and makes no second one', Object.keys(gh.gists).length === 1 && s2.gist === g1.id && !gh.log.some(l => /^POST/.test(l)), gh.log.join(' | '));
  check('the phone\'s sessions and settings arrive, and the laptop\'s own work is kept', s2.sessions.length === 4 && s2.sessions.indexOf('Before signing in') >= 0 && s2.sessions.indexOf('On the laptop, signed out') >= 0 && s2.songs.join() === 'lap1' && s2.goal === 15 && /from the account is on this device now/.test(s2.toast), s2.sessions.join(', ') + ' / goal ' + s2.goal);
  check('...and the laptop\'s work went up to the account', JSON.parse(g1.files[month]).sessions.length === 4 && !!JSON.parse(g1.files['practice-room.json']).songs.lap1);
  await page.evaluate(() => window.PR.app.acct.sync('test'));
  await settle(page, 400);
  s = await st(page);
  check('back on the phone: the same sessions, songs, level and points on both', s.sessions.length === 4 && s.songs.join() === s2.songs.join() && s.xp === s2.xp && s.xp > 0 && /Made On The Laptop/.test(await page.evaluate(() => window.PR.app.S.songs.lap1.title)), 'XP ' + s.xp + ' and ' + s2.xp);

  /* 6. edits and deletes travel */
  console.log('6. edits and deletes');
  await page.evaluate(() => window.PR.app.Store.deleteSong('eyes-capo4'));
  await page2.evaluate(() => { const A = window.PR.app; A.Store.saveSong(Object.assign({}, A.S.songs.lap1, { title: 'Renamed On The Laptop' })); });
  await settle(page); await settle(page2, 400);
  await page.evaluate(() => window.PR.app.acct.sync('test')); await page2.evaluate(() => window.PR.app.acct.sync('test'));
  await settle(page, 500);
  s = await st(page); s2 = await st(page2);
  const gone = p => p.evaluate(() => window.PR.app.findSong('eyes-capo4') === null && !!window.PR.app.findSong('eyes-original'));
  check('a built-in song removed on the phone goes from the laptop; a rename on the laptop reaches the phone', (await gone(page)) && (await gone(page2)) && s2.songs.join() === 'lap1' && s.songs.join() === 'lap1' && (await page.evaluate(() => window.PR.app.S.songs.lap1.title)) === 'Renamed On The Laptop', s.songs.join() + ' / ' + s2.songs.join());
  check('the songs list on the phone shows it without a reload', await page.evaluate(() => { window.PR.app.go({ name: 'songs' }); return /Renamed On The Laptop/.test(document.querySelector('#main').textContent); }));
  await page.evaluate(() => window.PR.app.go({ name: 'today' }));

  /* 7. no connection */
  console.log('7. no connection');
  gh.down = true; gh.log.length = 0;
  await page.evaluate(() => window.PR.app.Store.addSession({ song: 'eyes-original', title: 'Played offline', kind: 'tempo', secs: 90, pct: 100, acc: 0.8, hits: 16, total: 20 }));
  await settle(page);
  s = await st(page);
  check('the session is kept on the phone and the page says GitHub comes later', s.state === 'offline' && s.pill === 'Saved here, GitHub later' && s.sessions[0] === 'Played offline' && JSON.parse(g1.files[month]).sessions.length === 4 && s.saved.token === KEY1, s.pill);
  gh.down = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await settle(page, 600);
  s = await st(page);
  check('when the connection is back it is sent without being asked', s.state === 'in' && s.pill === 'Saved to GitHub' && JSON.parse(g1.files[month]).sessions.length === 5, s.pill);
  gh.limited = true;
  await page.evaluate(() => window.PR.app.acct.sync('test')); await settle(page, 400);
  s = await st(page);
  check('GitHub asking for a pause is treated as "later", not as a broken key', s.state === 'offline' && s.saved.token === KEY1);
  gh.limited = false;
  await page.evaluate(() => window.PR.app.acct.sync('test')); await settle(page, 400);

  /* 8. the next visit */
  console.log('8. the next visit');
  await page.close(); gh.log.length = 0;
  await page2.evaluate(() => window.PR.app.Store.addSession({ song: 'lap1', title: 'Laptop while the phone was closed', kind: 'tempo', secs: 60, pct: 100, acc: 0.9, hits: 9, total: 10 }));
  await settle(page2);
  gh.log.length = 0;
  page = await phone.open();
  await settle(page, 400);
  s = await st(page);
  check('still signed in, and what the laptop played is there on opening', s.state === 'in' && s.user === 'tommie' && s.sessions[0] === 'Laptop while the phone was closed' && s.sessions.length === 6 && /Laptop while the phone was closed/.test(s.main), s.sessions[0]);
  check('opening looks for the saved file once and reads it, nothing more', gh.log.join(' | ') === 'GET /gists | GET /gists/:id', gh.log.join(' | '));

  /* 9. a big file comes back cut short */
  console.log('9. a file over GitHub\'s size limit');
  gh.truncate = month; gh.log.length = 0;
  await page.evaluate(() => window.PR.app.acct.sync('test')); await settle(page, 500);
  s = await st(page);
  check('the whole file is fetched from its own address, without the key, and nothing is lost', s.state === 'in' && gh.log.indexOf('RAW ' + month) >= 0 && !gh.log.some(l => /WITH KEY/.test(l)) && JSON.parse(g1.files[month]).sessions.length === 6 && !gh.log.some(l => /^PATCH/.test(l)), gh.log.join(' | '));
  gh.truncate = '';

  /* 10. the key stops working */
  console.log('10. the key runs out');
  delete gh.keys[KEY1];
  await page.evaluate(() => window.PR.app.Store.addSession({ song: 'eyes-original', title: 'Played with a dead key', kind: 'tempo', secs: 60, pct: 100, acc: 0.9, hits: 9, total: 10 }));
  await settle(page);
  s = await st(page);
  check('the page asks to sign in again and keeps everything', s.state === 'expired' && s.pill === 'Sign in again' && /Sign in again to keep saving to GitHub/.test(s.main) && s.sessions[0] === 'Played with a dead key' && s.sessions.length === 7, s.pill);
  gh.log.length = 0;
  await page.evaluate(() => window.PR.app.Store.addSession({ song: 'eyes-original', title: 'And once more', kind: 'tempo', secs: 60, pct: 100, acc: 0.9, hits: 9, total: 10 }));
  await settle(page);
  check('...without knocking on GitHub\'s door with a key it refused', gh.log.length === 0, gh.log.join(' | '));
  await page.click('#sync');
  s = await st(page);
  check('the account sheet explains it and offers the two steps again', /no longer accepts the key/.test(s.sheet) && /Make a key on GitHub/.test(s.sheet) && (await page.locator('#ghKey').count()) === 1);
  await shot(page, '5-expired');
  await signIn(page, KEY4);
  await settle(page, 300);
  s = await st(page);
  check('a new key (a classic one works too) carries on in the same file with nothing lost', s.state === 'in' && s.gist === g1.id && Object.keys(gh.gists).length === 1 && JSON.parse(g1.files[month]).sessions.length === 8 && s.saved.token === KEY4, gh.log.join(' | '));
  await page.click('[data-act="sheet-close"]');

  /* 11. signing out */
  console.log('11. signing out');
  await page.click('#sync');
  await page.click('[data-act="acct-out"]');
  s = await st(page);
  check('signed out: the key is gone from the browser, the progress stays on the device', s.state === 'out' && s.saved === null && s.sessions.length === 8 && s.pill === 'This device only' && /Sign in with GitHub/.test(s.sheet) && /stays on this device/.test(s.toast) && (await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)).indexOf('ghp_'))) < 0);
  gh.log.length = 0;
  await page.click('[data-act="sheet-close"]');
  await page.evaluate(() => window.PR.app.Store.addSession({ song: 'eyes-original', title: 'Signed out', kind: 'tempo', secs: 60, pct: 100, acc: 0.9, hits: 9, total: 10 }));
  await settle(page);
  check('...and nothing more is sent', gh.log.length === 0 && Object.keys(gh.gists).length === 1);
  await page.close(); await page2.close();

  /* 12. two saved files (two devices signing in at the same moment) */
  console.log('12. two saved files');
  const A1 = { 'practice-room.json': JSON.stringify({ app: 'practice-room', v: 1, songs: { old1: Object.assign(chart('In The Older File', ['C']), { updatedAt: 5 }) }, gone: {}, settings: {}, settingsAt: 0 }), 'sessions-2026-09.json': JSON.stringify({ v: 1, sessions: [{ id: 'pold', at: Date.UTC(2026, 8, 5), song: 'old1', title: 'Older file session', kind: 'self', secs: 30 }] }) };
  const A2 = { 'practice-room.json': JSON.stringify({ app: 'practice-room', v: 1, songs: { new1: Object.assign(chart('In The Newer File', ['G']), { updatedAt: 6 }) }, gone: {}, settings: {}, settingsAt: 0 }), 'sessions-2026-09.json': JSON.stringify({ v: 1, sessions: [{ id: 'pnew', at: Date.UTC(2026, 8, 6), song: 'new1', title: 'Newer file session', kind: 'self', secs: 30 }] }) };
  gh.gists = {};
  const older = gh.newGist('tommie', A1, '2026-09-01T10:00:00Z'), newer = gh.newGist('tommie', A2, '2026-09-02T10:00:00Z');
  gh.newGist('tommie', { 'shopping.txt': 'strings, picks' }, '2026-08-01T10:00:00Z');
  const third = await device();
  page = await third.open();
  await signIn(page, KEY2); await settle(page, 300);
  s = await st(page);
  check('both are read, the older one becomes the one in use, and the other gist is left alone', s.gist === older.id && s.sessions.indexOf('Older file session') >= 0 && s.sessions.indexOf('Newer file session') >= 0 && s.songs.indexOf('old1') >= 0 && s.songs.indexOf('new1') >= 0 && /Newer file session/.test(older.files['sessions-2026-09.json']) && newer.files['practice-room.json'] === A2['practice-room.json'] && Object.keys(gh.gists).length === 3, s.songs.join());

  /* 13. GitHub does not list the file for this kind of key */
  console.log('13. a key that cannot see its own file in the list');
  gh.gists = {}; gh.hideFromList = true;
  await page.close();
  const fourth = await device();
  page = await fourth.open();
  await signIn(page, KEY2); await settle(page, 300);
  await page.close();
  page = await fourth.open(); await settle(page, 400);
  await page.click('#sync');
  s = await st(page);
  check('on the next visit the page keeps using its file and warns that other devices may not find it', s.state === 'in' && s.blind === true && Object.keys(gh.gists).length === 1 && /Other devices may not find this progress/.test(s.sheet));
  gh.hideFromList = false;
  await page.close();

  /* 14. the saved file was deleted on GitHub */
  console.log('14. the saved file was deleted on GitHub');
  gh.gists = {}; gh.log.length = 0;
  page = await fourth.open(); await settle(page, 500);
  s = await st(page);
  check('a new one is started from what the device holds', s.state === 'in' && Object.keys(gh.gists).length === 1 && s.gist === theGist().id && theGist().files['practice-room.json'].indexOf('practice-room') > 0, gh.log.join(' | '));
  await page.close();

  /* 15. inside Claude the page has its own database: no GitHub account is offered and GitHub is never called */
  console.log('15. inside Claude');
  gh.log.length = 0;
  const fifth = await device();
  page = await fifth.open(() => { localStorage.setItem('pr.account.v1', JSON.stringify({ token: 'github_pat_left_over_from_somewhere_else_000000', user: { login: 'tommie', name: 'T' }, gist: 'abc' })); const ref = () => ({ set: async () => {}, delete: async () => {}, get: async () => ({ exists: false, data: () => undefined }), onSnapshot: n => { setTimeout(() => n({ exists: false, data: () => undefined }), 5); return () => {}; } }); const api = { where: () => api, orderBy: () => api, limit: () => api, doc: ref, onSnapshot: n => { setTimeout(() => n({ docs: [], size: 0, empty: true }), 5); return () => {}; } }; window.claude = { use: async name => (name === 'db' ? { doc: ref, collection: () => api } : name === 'user' ? { can: async () => true } : null) }; });
  await settle(page, 400);
  s = await st(page);
  check('not offered, not called, and the pill opens Settings', s.offered === false && s.pill === 'Synced' && !/Keep your progress/.test(s.main) && gh.log.length === 0);
  await page.click('#sync');
  check('Settings has no account row there', /Settings/.test(await page.textContent('#sheetBody .title')) && !/Sign in with GitHub/.test(await page.textContent('#sheetBody')));

  /* 16. dark mode, and the invitation can be put away */
  console.log('16. looks');
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await dark.route('https://api.github.com/**', gh.handle); await dark.route('https://avatars.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  page = await dark.newPage(); await page.goto(BASE + '/dist/local.html'); await page.waitForTimeout(400);
  await shot(page, '6-today-dark');
  await page.click('[data-act="acct-hide"]');
  check('"Not now" puts the invitation away for good', !/Keep your progress/.test(await page.textContent('#main')) && (await page.evaluate(() => localStorage.getItem('pr.account.hide.v1'))) === '1');
  await page.click('#sync'); await shot(page, '7-sign-in-dark');
  check('the sheet fits in dark mode too', (await noOverflow(page)) <= 0);

  await browser.close(); srv.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures += errors.length; }
  console.log(failures ? '\nACCOUNT: ' + failures + ' CHECK(S) FAILED' : '\nACCOUNT: ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });

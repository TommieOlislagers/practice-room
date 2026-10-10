'use strict';
/* What is saved while the database cannot be reached must survive and be sent later. */
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
const PORT = 8774, BASE = 'http://127.0.0.1:' + PORT;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
/* An in-memory stand-in for the artifact database with the same call shapes. opts.docs: what it holds at the start;
   opts.failSet: a code every set() is refused with; opts.failSnap: snapshots error out after that many ms. */
function mock(opts) {
  const store = window.__db = { docs: JSON.parse(JSON.stringify(opts.docs || {})), subs: [], errs: [], log: [], failSet: opts.failSet || '' };
  const emit = () => store.subs.slice().forEach(f => f());
  window.__emit = emit;
  const depth = p => p.split('/').length;
  const snap = p => { const d = store.docs[p]; return { id: p.split('/').pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) }; };
  function docRef(p) {
    return {
      id: p.split('/').pop(), path: p,
      set: async data => { if (store.failSet) { store.log.push('refused ' + p); throw { code: store.failSet, message: store.failSet }; } store.docs[p] = JSON.parse(JSON.stringify(data)); store.log.push('set ' + p); setTimeout(emit, 5); },
      update: async data => { Object.assign(store.docs[p], JSON.parse(JSON.stringify(data))); setTimeout(emit, 5); },
      delete: async () => { if (store.failSet) throw { code: store.failSet }; delete store.docs[p]; store.log.push('delete ' + p); setTimeout(emit, 5); },
      get: async () => snap(p),
      onSnapshot: (next, err) => { const f = () => next(snap(p)); store.subs.push(f); if (err) store.errs.push(err); setTimeout(f, 10); return () => {}; }
    };
  }
  function coll(p) {
    const q = { order: null, lim: 1000 };
    const api = {
      path: p, where: () => api,
      orderBy: (f, dir) => { q.order = [f, dir || 'asc']; return api; },
      limit: n => { q.lim = n; return api; },
      doc: id => docRef(p + '/' + id),
      onSnapshot: (next, err) => {
        const f = () => {
          let docs = Object.keys(store.docs).filter(k => k.indexOf(p + '/') === 0 && depth(k) === depth(p) + 1).map(snap);
          if (q.order) docs.sort((a, b) => ((a.data()[q.order[0]] || 0) - (b.data()[q.order[0]] || 0)) * (q.order[1] === 'desc' ? -1 : 1));
          next({ docs: docs.slice(0, q.lim), size: docs.length, empty: !docs.length });
        };
        store.subs.push(f); if (err) store.errs.push(err); setTimeout(f, 10); return () => {};
      }
    };
    return api;
  }
  window.__dropLink = () => { store.subs = []; store.errs.forEach(e => e({ code: 'unavailable' })); };
  window.claude = { use: name => new Promise(res => setTimeout(() => res(name === 'db' ? { doc: docRef, collection: coll } : name === 'user' ? { can: async () => true } : null), 40)) };
}
const chart = (title, bars) => ({ title, artist: 'Test', level: 1, bpm: 90, capo: 0, origin: 'paste', checked: true, sections: [{ name: 'A', type: 'chords', bars }] });
(async () => {
  const srv = await serve(PORT);
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let mode = { kind: 'none' };
  await ctx.addInitScript(() => { /* placeholder so every page has an init hook */ });
  async function open(kind, opts) {
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    if (kind === 'db') await page.addInitScript(mock, opts || {});
    await page.goto(BASE + '/dist/local.html');
    await page.waitForTimeout(500);
    return page;
  }
  const st = page => page.evaluate(() => ({ songs: Object.keys(window.PR.app.S.songs).sort(), sessions: window.PR.app.S.sessions.map(s => s.title), store: window.PR.app.S.store, pending: JSON.parse(localStorage.getItem('pr.pending.v1') || 'null'), db: window.__db ? Object.keys(window.__db.docs).sort() : null, log: window.__db ? window.__db.log.slice() : null, diag: window.PR.app.diag.lines(6), sync: document.querySelector('#sync').textContent.trim(), toast: document.querySelector('#toast').textContent }));

  /* 1. a visit with no database: a song and a session are saved in this browser */
  console.log('1. saved without a database');
  let page = await open('none');
  await page.evaluate(c => { const A = window.PR.app; A.Store.saveSong(Object.assign({ id: 'mine1' }, c)); A.Store.addSession({ song: 'mine1', title: 'Offline session', kind: 'self', secs: 40, acc: 0.8 }); A.Store.deleteSong('eyes-capo4'); }, chart('Made Offline', ['Am', 'G']));
  let s = await st(page);
  check('the page works from this browser and remembers what to send', s.store === 'local' && s.songs.join() === 'eyes-original,mine1' && s.sessions.join() === 'Offline session' && s.pending && Object.keys(s.pending.songs).join() === 'mine1' && s.pending.sessions.length === 1 && s.pending.gone['eyes-capo4'] === 1, JSON.stringify(s.pending).slice(0, 120));
  await page.close();

  /* 2. the next visit has a database holding other things: both sides are kept, and the offline work is sent */
  console.log('2. the database answers on the next visit');
  page = await open('db', { docs: { 'songs/cloud1': Object.assign(chart('In The Cloud', ['C', 'G']), { updatedAt: 5, createdAt: 5 }), 'songs/eyes-capo4': Object.assign(chart('Capo Version', ['C', 'Am']), { updatedAt: 6, createdAt: 6 }), 'sessions/old1': { at: 1000, song: 'cloud1', title: 'Cloud session', kind: 'self', secs: 30, acc: 0.5 } } });
  await page.waitForTimeout(600);
  s = await st(page);
  check('the offline song and session were written to the database', s.db.indexOf('songs/mine1') >= 0 && s.db.filter(k => /^sessions\/p/.test(k)).length === 1 && s.log.filter(l => /^set (songs\/mine1|sessions\/p)/.test(l)).length === 2, s.log.join(', '));
  check('the song deleted offline is deleted there too', s.db.indexOf('songs/eyes-capo4') < 0 && s.log.indexOf('delete songs/eyes-capo4') >= 0);
  check('the page shows the database plus the offline work, and nothing twice', s.songs.join() === 'cloud1,mine1' && s.sessions.slice().sort().join() === 'Cloud session,Offline session' && s.sync === 'Synced', JSON.stringify([s.songs, s.sessions]));
  check('nothing is left waiting, and the log says what was sent', Object.keys(s.pending.songs).length === 0 && s.pending.sessions.length === 0 && Object.keys(s.pending.gone).length === 0 && s.diag.some(l => /sync: 3 saved while offline, sent now/.test(l)), s.diag.join(' | '));
  const sessDoc = await page.evaluate(() => { const k = Object.keys(window.__db.docs).find(x => /^sessions\/p/.test(x)); return window.__db.docs[k]; });
  check('the session document has no stray fields', sessDoc && sessDoc.title === 'Offline session' && !('id' in sessDoc) && typeof sessDoc.at === 'number', JSON.stringify(sessDoc));

  /* 3. the link drops in the middle of a visit: later work is kept, not lost */
  console.log('3. the link drops during a visit');
  await page.evaluate(() => window.__dropLink());
  await page.waitForTimeout(100);
  await page.evaluate(() => window.PR.app.Store.addSession({ song: 'mine1', title: 'After the drop', kind: 'self', secs: 50, acc: 0.9 }));
  s = await st(page);
  check('the page says so and keeps working from this browser', s.store === 'local' && /Lost the link/.test(s.toast) && s.sessions[0] === 'After the drop' && s.pending.sessions.length === 1 && s.sync === 'This device only');
  const kept = await page.evaluate(() => window.__db.docs);
  await page.close();
  page = await open('db', { docs: kept });
  await page.waitForTimeout(600);
  s = await st(page);
  check('next visit: the session reaches the database and is listed once', s.db.filter(k => /^sessions\/p/.test(k)).length === 2 && s.sessions.filter(t => t === 'After the drop').length === 1 && s.sessions.length === 3 && s.pending.sessions.length === 0, s.sessions.join(', '));

  /* 4. a write the database refuses for a passing reason is kept; one it refuses for good is not retried */
  console.log('4. refused writes');
  await page.evaluate(() => { window.__db.failSet = 'unavailable'; window.PR.app.Store.addSession({ song: 'mine1', title: 'Refused for now', kind: 'self', secs: 33, acc: 0.7 }); });
  await page.waitForTimeout(150);
  s = await st(page);
  check('a passing refusal: kept for later, and the player is told', s.pending.sessions.length === 1 && /Saved on this device/.test(s.toast) && s.sessions[0] === 'Refused for now' && s.diag.some(l => /save: refused: unavailable/.test(l)), s.toast);
  const kept2 = await page.evaluate(() => window.__db.docs);
  await page.close();
  page = await open('db', { docs: kept2 });
  await page.waitForTimeout(600);
  s = await st(page);
  check('...and sent on the next visit', s.db.filter(k => /^sessions\/p/.test(k)).length === 3 && s.pending.sessions.length === 0 && s.sessions.indexOf('Refused for now') >= 0);
  await page.evaluate(() => { window.__db.failSet = 'invalid_argument'; window.PR.app.Store.addSession({ song: 'mine1', title: 'Never allowed', kind: 'self', secs: 33, acc: 0.7 }); });
  await page.waitForTimeout(150);
  s = await st(page);
  check('a refusal for good: not queued, the view is marked read-only', s.pending.sessions.length === 0 && /cannot save changes/.test(s.toast) && (await page.evaluate(() => window.PR.app.S.canWrite)) === false, s.toast);

  /* 5. an edit made offline does not overwrite a newer copy in the database */
  console.log('5. an older offline edit loses to a newer saved copy');
  await page.close();
  page = await open('none');
  await page.evaluate(c => { window.PR.app.Store.saveSong(Object.assign({ id: 'mine1' }, c)); }, chart('Edited Offline', ['Am', 'G']));
  await page.close();
  const future = Date.now() + 60000;
  page = await open('db', { docs: Object.assign({}, kept2, { 'songs/mine1': Object.assign(chart('Edited Elsewhere Later', ['Dm']), { updatedAt: future, createdAt: 1 }) }) });
  await page.waitForTimeout(600);
  s = await st(page);
  const title = await page.evaluate(() => window.PR.app.S.songs.mine1.title);
  check('the newer copy stays, and the stale edit is dropped', title === 'Edited Elsewhere Later' && Object.keys(s.pending.songs).length === 0 && s.log.indexOf('set songs/mine1') < 0, title);

  await browser.close(); srv.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures += errors.length; }
  console.log(failures ? '\nSYNC: ' + failures + ' CHECK(S) FAILED' : '\nSYNC: ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });

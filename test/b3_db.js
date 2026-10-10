'use strict';
/* The page against a stand-in for the artifact database and for Claude drafting: same call shapes, in memory. */
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
const BASE = 'http://127.0.0.1:8767';
const WAV = n => path.join(__dirname, '..', 'wav', n);
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
const eyes = {
  title: 'Eyes Without a Face', artist: 'Billy Idol', level: 3, bpm: 85, capo: 0, tuning: 'standard', key: 'E', origin: 'claude', checked: true,
  shapes: [{ n: 'Emaj7', s: 'x79897' }, { n: 'C#m', s: 'x46654' }, { n: 'G#m', s: '466444' }, { n: 'B', s: '799877' }],
  sections: [{ name: 'Verse', type: 'chords', bars: ['Emaj7', 'C#m', 'G#m', 'B'], repeat: 3 }, { name: 'Chorus', type: 'chords', bars: ['A', 'B', 'A', 'B', 'A', 'B', 'F#m', 'G#m'] }],
  createdAt: 1, updatedAt: 1
};
function mock(seed) {
  const store = window.__db = { docs: { 'songs/seed1': seed }, subs: [], log: [] };
  const emit = () => store.subs.slice().forEach(f => f());
  window.__emit = emit;
  const depth = p => p.split('/').length;
  const snap = p => { const d = store.docs[p]; return { id: p.split('/').pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }; };
  function docRef(p) {
    if (depth(p) % 2) throw new TypeError('document path needs an even number of segments: ' + p);
    return {
      id: p.split('/').pop(), path: p,
      set: async data => { if (!data || typeof data !== 'object' || Array.isArray(data)) throw { code: 'invalid_argument' }; store.docs[p] = JSON.parse(JSON.stringify(data)); store.log.push('set ' + p); setTimeout(emit, 5); },
      update: async data => { if (!store.docs[p]) throw { code: 'invalid_argument' }; Object.assign(store.docs[p], JSON.parse(JSON.stringify(data))); store.log.push('update ' + p); setTimeout(emit, 5); },
      delete: async () => { delete store.docs[p]; store.log.push('delete ' + p); setTimeout(emit, 5); },
      get: async () => snap(p),
      onSnapshot: next => { const f = () => next(snap(p)); store.subs.push(f); setTimeout(f, 10); return () => {}; }
    };
  }
  function coll(p) {
    if (!(depth(p) % 2)) throw new TypeError('collection path needs an odd number of segments: ' + p);
    const q = { order: null, lim: 1000 };
    const api = {
      path: p,
      where: () => api,
      orderBy: (f, dir) => { q.order = [f, dir || 'asc']; return api; },
      limit: n => { q.lim = n; return api; },
      doc: id => docRef(p + '/' + (id || Math.random().toString(36).slice(2))),
      onSnapshot: next => {
        const f = () => {
          let docs = Object.keys(store.docs).filter(k => k.indexOf(p + '/') === 0 && depth(k) === depth(p) + 1).map(snap);
          if (q.order) docs.sort((a, b) => ((a.data()[q.order[0]] || 0) - (b.data()[q.order[0]] || 0)) * (q.order[1] === 'desc' ? -1 : 1));
          docs = docs.slice(0, q.lim);
          next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
        };
        store.subs.push(f); setTimeout(f, 10); return () => {};
      }
    };
    return api;
  }
  const sample = Object.assign(async () => ({ text: '', truncated: false }), {
    json: async (prompt) => {
      store.log.push('sample ' + (/Never include lyrics/.test(prompt) ? 'no-lyrics-rule' : 'MISSING-RULE'));
      await new Promise(r => setTimeout(r, 300));
      if (/Unknown Song/.test(prompt)) return { found: false };
      return { found: true, title: 'Three Chord Tune', artist: 'Nobody', key: 'G', bpm: 96, capo: 2, level: 1, confidence: 'medium', note: 'Keep the strumming hand moving.',
        sections: [{ name: 'Verse', bars: ['G', 'C', 'G', 'D'], repeat: 2 }, { name: 'Chorus', bars: ['C', 'D', 'G Em', 'C D', 'not a chord'] }], shapes: { G: '320003' } };
    }
  });
  window.claude = { use: name => new Promise(res => setTimeout(() => res(name === 'db' ? { doc: docRef, collection: coll } : name === 'user' ? { can: async () => true, isOwner: async () => true } : name === 'sample' ? sample : null), 60)) };
}
(async () => {
  const srv = await serve(8767);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.addInitScript(mock, eyes);
  await page.goto(BASE + '/dist/local.html');
  await page.waitForTimeout(600);
  const docs = () => page.evaluate(() => Object.keys(window.__db.docs));
  const log = () => page.evaluate(() => window.__db.log.slice());

  check('shows "Synced" once the database answers', (await page.textContent('#sync')).trim() === 'Synced');
  await page.click('#tabs [data-to="songs"]');
  check('a song written to the database from outside is in the library', (await page.textContent('#main')).indexOf('Eyes Without a Face') > 0);

  /* a second song arrives while the page is open, the way Claude adds one from the chat */
  await page.evaluate(() => { window.__db.docs['songs/fromchat'] = { title: 'Loaded From Chat', artist: 'Someone', level: 2, bpm: 100, capo: 0, origin: 'claude', checked: true, sections: [{ name: 'A', type: 'chords', bars: ['Am', 'F', 'C', 'G'] }], createdAt: 2, updatedAt: 2 }; window.__emit(); });
  await page.waitForTimeout(200);
  check('a song added from outside appears without a reload', (await page.textContent('#main')).indexOf('Loaded From Chat') > 0);

  /* paste */
  await page.click('[data-act="add"]');
  await page.fill('#dTitle', 'Pasted One');
  await page.fill('#dText', '[Verse]\n| Am | G | F | E7 |\n');
  await page.click('[data-act="draft-read"]');
  await page.click('[data-act="draft-save"]');
  await page.waitForTimeout(300);
  let d = await docs();
  const pasted = d.filter(k => /^songs\/s/.test(k) && k !== 'songs/seed1');
  const pdoc = await page.evaluate(k => window.__db.docs[k], pasted[0]);
  check('a pasted song is written as one document', pasted.length === 1 && pdoc.title === 'Pasted One' && pdoc.origin === 'paste' && pdoc.level === 2 && pdoc.levelAuto === 2 && !('id' in pdoc) && pdoc.sections[0].bars.join(' ') === 'Am G F E7', JSON.stringify(pdoc).slice(0, 220));

  /* drafting through Claude */
  await page.click('[data-act="go"][data-to="songs"]');
  await page.click('[data-act="add"]');
  await page.click('[data-act="draft-mode"][data-mode="ask"]');
  await page.fill('#dTitle', 'Unknown Song');
  await page.click('[data-act="draft-ask"]');
  await page.waitForSelector('.notice-bad', { timeout: 5000 });
  check('an unknown song is refused instead of invented', /does not know this song well enough/.test(await page.textContent('#sheetBody')));
  await page.fill('#dTitle', 'Three Chord Tune');
  await page.click('[data-act="draft-ask"]');
  await page.waitForSelector('[data-act="draft-save"]', { timeout: 5000 });
  const prev = (await page.textContent('#sheetBody')).replace(/\s+/g, ' ');
  check('the draft is previewed with its warning, bad bars dropped', /Drafted from memory, not checked/.test(prev) && /G \| C \| G \| D/.test(prev) && /C \| D \| G Em \| C D/.test(prev) && !/not a chord/.test(prev) && (await page.inputValue('#dCapo')) === '2' && (await page.inputValue('#dBpm')) === '96', prev.slice(prev.indexOf('What was read'), prev.indexOf('What was read') + 160));
  await page.click('[data-act="draft-save"]');
  await page.waitForTimeout(300);
  d = await docs();
  const drafted = d.filter(k => /^songs\/s/.test(k) && k !== 'songs/seed1' && k !== pasted[0]);
  const ddoc = await page.evaluate(k => window.__db.docs[k], drafted[0]);
  check('the draft is saved as unchecked, with the page asking Claude for no lyrics', drafted.length === 1 && ddoc.origin === 'draft' && ddoc.checked === false && ddoc.capo === 2 && (await log()).indexOf('sample no-lyrics-rule') >= 0, JSON.stringify(ddoc).slice(0, 200));
  check('the song page marks it as a draft', /Draft, not checked/.test(await page.textContent('#main')));

  /* a take is logged as a session document */
  await page.click('[data-act="go"][data-to="songs"]');
  await page.click('[data-act="open"][data-id="seed1"]');
  await page.click('[data-act="p-mode"][data-mode="take"]');
  await page.setInputFiles('input[data-file="take"]:not([capture])', WAV('eyes_take.wav'));
  await page.waitForSelector('#sheet:not([hidden])', { timeout: 60000 });
  await page.waitForTimeout(200);
  d = await docs();
  const sess = d.filter(k => /^sessions\//.test(k));
  const sdoc = await page.evaluate(k => window.__db.docs[k], sess[0]);
  check('the take is logged as a session document', sess.length === 1 && sdoc.song === 'seed1' && sdoc.kind === 'take' && sdoc.hits === 19 && sdoc.total === 20 && Math.abs(sdoc.acc - 0.95) < 0.001 && typeof sdoc.at === 'number', JSON.stringify(sdoc).slice(0, 260));
  await page.click('[data-act="sheet-close"]');

  /* edit, settings, delete */
  await page.click('[data-act="edit"]');
  await page.selectOption('#eLevel', '4'); await page.fill('#eBpm', '90');
  await page.click('[data-act="edit-save"]');
  await page.waitForTimeout(200);
  const edited = await page.evaluate(() => window.__db.docs['songs/seed1']);
  check('edits are written back', edited.level === 4 && edited.bpm === 90 && edited.title === 'Eyes Without a Face' && edited.sections.length === 2);
  await page.click('[data-act="settings"]');
  await page.click('[data-act="set-step"][data-key="a4"][data-d="1"]');
  await page.waitForTimeout(100);
  check('settings are written to meta/settings', (await page.evaluate(() => (window.__db.docs['meta/settings'] || {}).a4)) === 441);
  await page.click('[data-act="sheet-close"]');
  await page.click('[data-act="edit"]');
  await page.click('[data-act="del-ask"]'); await page.click('[data-act="del-yes"]');
  await page.waitForTimeout(200);
  check('deleting removes the document and returns to the list', !(await docs()).includes('songs/seed1') && (await page.textContent('.large-title')) === 'Songs' && !(await page.evaluate(() => 'seed1' in window.PR.app.S.songs)));
  await page.click('#tabs [data-to="today"]'); await page.waitForTimeout(200);
  const today = (await page.textContent('#main')).replace(/\s+/g, ' ');
  check('Today shows the logged session', /Recent sessions.*Eyes Without a Face.*95%/.test(today), today.slice(today.indexOf('Recent sessions'), today.indexOf('Recent sessions') + 90));
  console.log('  database calls: ' + (await log()).map(l => l.replace(/\/[a-z0-9]{6,}$/, '/…')).join(', '));
  await browser.close(); srv.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures += errors.length; }
  console.log(failures ? '\nSTORAGE: ' + failures + ' CHECK(S) FAILED' : '\nSTORAGE: ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });

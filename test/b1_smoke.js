'use strict';
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
const eyes = {
  title: 'Eyes Without a Face', artist: 'Billy Idol', level: 3, bpm: 85, capo: 0, tuning: 'standard', key: 'E', origin: 'claude', checked: true,
  note: 'One strum per bar first. The index finger only ever sits on fret 7 or fret 4.',
  source: { label: 'Tab source', url: 'https://www.cifraclub.com/billy-idol/eyes-without-face/kgghjs.html' },
  shapes: [{ n: 'Emaj7', s: 'x79897' }, { n: 'C#m', s: 'x46654' }, { n: 'G#m', s: '466444' }, { n: 'B', s: '799877' }],
  sections: [{ name: 'Verse', type: 'chords', bars: ['Emaj7', 'C#m', 'G#m', 'B'], repeat: 3 }, { name: 'Chorus', type: 'chords', bars: ['A', 'B', 'A', 'B', 'A', 'B', 'F#m', 'G#m'] }],
  createdAt: Date.now() - 86400000 * 3, updatedAt: Date.now() - 86400000 * 3
};
function sessions() {
  const out = [], day = 86400000, now = Date.now();
  const mk = (d, secs, acc, kind, extra) => out.push(Object.assign({ id: 'p' + out.length, at: now - d * day - 3600000, song: 's1', title: 'Eyes Without a Face', kind, secs, acc, hits: Math.round(acc * 20), total: 20, pct: 100, level: 3 }, extra || {}));
  mk(0, 540, 0.85, 'take', { changes: [{ f: 'C#m', t: 'G#m', s: 1.4 }, { f: 'G#m', t: 'B', s: 0.9 }, { f: 'Emaj7', t: 'C#m', s: 0.6 }] });
  mk(1, 720, 0.7, 'take', { changes: [{ f: 'C#m', t: 'G#m', s: 1.8 }, { f: 'G#m', t: 'B', s: 1.1 }, { f: 'Emaj7', t: 'C#m', s: 0.8 }] });
  mk(2, 300, 0.6, 'wait', {}); mk(4, 900, 0.55, 'take', {}); mk(5, 420, 0.5, 'self', { self: true });
  out.push({ id: 'pd', at: now - 2 * day, song: 'd-first', title: 'First changes: Em, G, D, C', kind: 'tempo', secs: 260, acc: 0.94, hits: 15, total: 16, pct: 100, level: 1 });
  out.push({ id: 'pe', at: now - 1 * day - 7200000, song: 'd-first', title: 'First changes: Em, G, D, C', kind: 'tempo', secs: 200, acc: 1, hits: 16, total: 16, pct: 100, level: 1 });
  out.sort((a, b) => b.at - a.at);
  return out;
}
(async () => {
  const srv = await serve(8765);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  for (const [name, w, h, scheme, seed] of [['phone-light', 390, 844, 'light', true], ['phone-dark', 390, 844, 'dark', true], ['phone-empty', 390, 844, 'light', false], ['desk-dark', 1100, 800, 'dark', true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(name + ' PAGEERROR: ' + e.message));
    if (seed) await page.addInitScript(([song, sess]) => { localStorage.setItem('pr.songs.v1', JSON.stringify({ s1: Object.assign({ id: 's1' }, song) })); localStorage.setItem('pr.sessions.v1', JSON.stringify(sess)); }, [eyes, sessions()]);
    await page.goto('http://127.0.0.1:8765/dist/local.html');
    await page.waitForTimeout(900);
    const shot = async (n) => { await page.screenshot({ path: path.join(__dirname, '..', 'shots', name + '-' + n + '.png'), fullPage: true }); const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (ov > 0) errors.push(name + ' ' + n + ': horizontal overflow ' + ov + 'px'); };
    await shot('today');
    await page.click('#tabs [data-to="songs"]'); await page.waitForTimeout(200); await shot('songs');
    await page.click('#tabs [data-to="tuner"]'); await page.waitForTimeout(200); await shot('tuner');
    await page.click('#tabs [data-to="songs"]'); await page.waitForTimeout(100);
    if (seed) { await page.click('[data-act="open"][data-id="s1"]'); await page.waitForTimeout(300); await shot('practice-song'); await page.click('[data-act="p-mode"][data-mode="take"]'); await page.waitForTimeout(150); await shot('practice-take'); await page.click('[data-act="go"][data-to="songs"]'); }
    await page.click('[data-act="open"][data-id="d-empent"]'); await page.waitForTimeout(300); await shot('practice-drill');
    await page.click('[data-act="go"][data-to="songs"]'); await page.click('[data-act="add"]'); await page.waitForTimeout(200); await shot('add');
    await page.click('[data-act="sheet-close"]'); await page.click('[data-act="settings"]'); await page.waitForTimeout(200); await shot('settings');
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors, no horizontal overflow');
})().catch(e => { console.error('FAILED', e); process.exit(1); });

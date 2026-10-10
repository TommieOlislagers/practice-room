'use strict';
/* What Tommie's iPhone reported inside Claude's viewer, replayed: no policy interface, the browser answers
   "denied" before anyone was asked, and a request is refused at once. The page must blame the viewer, not the phone. */
const path = require('path'), fs = require('fs');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
function webkitFrame() {
  if (window.self === window.top) return;
  try { Object.defineProperty(document, 'featurePolicy', { value: undefined, configurable: true }); } catch (e) { /* ignore */ }
  try { Object.defineProperty(document, 'permissionsPolicy', { value: undefined, configurable: true }); } catch (e) { /* ignore */ }
  navigator.permissions.query = async () => ({ state: 'denied' });
  window.__gum = 0;
  navigator.mediaDevices.getUserMedia = () => { window.__gum++; return Promise.reject(new DOMException('The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.', 'NotAllowedError')); };
  /* the viewer's own permission interface, as it answered on the phone */
  const perms = { request: async names => { const r = {}; (names || []).forEach(n => { r[n] = 'unavailable'; }); return r; }, state: async () => ({ db: 'granted', sample: 'prompt' }), manage: async () => {} };
  const docs = window.__docs = {};
  const snap = p => ({ id: p.split('/').pop(), exists: !!docs[p], data: () => (docs[p] ? JSON.parse(JSON.stringify(docs[p])) : undefined) });
  const docRef = p => ({ set: async d => { docs[p] = JSON.parse(JSON.stringify(d)); }, get: async () => snap(p), delete: async () => { delete docs[p]; }, onSnapshot: next => { setTimeout(() => next(snap(p)), 10); return () => {}; } });
  const coll = p => { const api = { orderBy: () => api, limit: () => api, where: () => api, doc: id => docRef(p + '/' + id), onSnapshot: next => { setTimeout(() => next({ docs: Object.keys(docs).filter(k => k.indexOf(p + '/') === 0).map(snap) }), 10); return () => {}; } }; return api; };
  window.claude = { use: name => new Promise(res => setTimeout(() => res(name === 'permissions' ? perms : name === 'db' ? { doc: docRef, collection: coll } : name === 'user' ? { can: async () => true } : null), 30)) };
}
(async () => {
  const srv = await serve(8775);
  fs.writeFileSync(path.join(__dirname, '..', 'dist', 'frame3.html'), '<!doctype html><html><body style="margin:0;background:#888"><iframe id="f" src="http://localhost:8775/dist/local.html" sandbox="allow-scripts allow-forms allow-popups" style="width:402px;height:1300px;border:0"></iframe></body></html>');
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 402, height: 1300 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(webkitFrame);
  await page.goto('http://127.0.0.1:8775/dist/frame3.html');
  await page.waitForTimeout(900);
  const fr = page.frames()[1], f = page.frameLocator('#f');
  let s = await fr.evaluate(() => ({ mic: Object.assign({}, window.PR.app.S.mic), main: document.querySelector('#main').textContent.replace(/\s+/g, ' '), store: window.PR.app.S.store }));
  check('on opening: the viewer is named as the reason, not a phone setting', s.mic.pre === 'blocked' && s.mic.why === 'frame' && /Claude's viewer does not pass the microphone on to this page/.test(s.main) && /Nothing on your phone is set wrong/.test(s.main) && !/set to blocked/.test(s.main) && !/site settings/.test(s.main), JSON.stringify(s.mic));
  check('recordings are offered as what works here', /Checking a recording works right here/.test(s.main));
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'iphone-today.png'), clip: { x: 0, y: 0, width: 402, height: 700 } });
  await f.locator('#tabs [data-to="songs"]').click();
  await f.locator('[data-act="open"][data-id="d-empent"]').click();
  check('practice opens on "Check a take"', (await f.locator('[data-act="p-mode"][data-mode="take"]').getAttribute('aria-pressed')) === 'true');
  await f.locator('#main [data-act="go"][data-to="songs"]').first().click();
  await f.locator('#tabs [data-to="today"]').click();
  await f.locator('#main [data-act="mic-ask"]').click();
  await page.waitForTimeout(600);
  s = await fr.evaluate(() => ({ mic: Object.assign({}, window.PR.app.S.mic), main: document.querySelector('#main').textContent.replace(/\s+/g, ' '), toast: document.querySelector('#toast').textContent, gum: window.__gum, log: window.PR.app.diag.lines(6) }));
  check('asking anyway asks once, and the refusal is still the viewer\'s', s.gum === 1 && s.mic.why === 'frame' && /Refused inside Claude's viewer, before your phone was asked/.test(s.toast) && /The request was refused inside the viewer/.test(s.main) && !/site settings/.test(s.main), s.toast);
  check('the log keeps both answers', s.log.some(l => /mic: NotAllowedError after \d+ ms \(frame\), framed, policy unknown, browser permission denied/.test(l)) && s.log.some(l => /host: microphone unavailable; view offers db=granted, sample=prompt/.test(l)), s.log.slice(0, 2).join(' | '));
  await page.waitForTimeout(3200);
  const doc = await fr.evaluate(() => { const k = Object.keys(window.__docs).filter(x => /^diag\//.test(x)); return { keys: k, log: k.length ? window.__docs[k[0]].log.map(e => e.k) : [] }; });
  check('the log is written to one document named after the device', doc.keys.length === 1 && /^diag\/dev[a-z0-9]{7}$/.test(doc.keys[0]) && doc.log.join() === 'open,mic,host', JSON.stringify(doc));
  /* a second visit: same document, earlier entries kept in front */
  const kept = await fr.evaluate(() => JSON.stringify(window.__docs));
  await page.addInitScript(k => { if (window.self !== window.top) window.__seed = JSON.parse(k); }, kept);
  await page.addInitScript(() => { if (window.self !== window.top && window.__seed) Object.assign(window.__docs, window.__seed); });
  await page.reload(); await page.waitForTimeout(4000);
  const doc2 = await page.frames()[1].evaluate(() => { const k = Object.keys(window.__docs).filter(x => /^diag\//.test(x)); return { keys: k, log: k.length ? window.__docs[k[0]].log.map(e => e.k) : [] }; });
  check('a second visit adds to the same document', doc2.keys.length === 1 && doc2.keys[0] === doc.keys[0] && doc2.log.join() === 'open,mic,host,open', JSON.stringify(doc2));
  await browser.close(); srv.close();
  if (errs.length) { console.log('PAGE ERRORS:\n' + errs.join('\n')); failures += errs.length; }
  console.log(failures ? '\nIPHONE CASE: ' + failures + ' CHECK(S) FAILED' : '\nIPHONE CASE: ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });

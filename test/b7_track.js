'use strict';
/* Reading phone recordings. The test browser has no AAC decoder, so for the "track" route the decoder is replaced
   by a stand-in that first checks it was handed exactly the sound track ffmpeg extracts, then decodes the same
   sound from a WAV. Everything around the decoder is the real page. */
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const serve = require('./serve.js');
const PORT = 8773, BASE = 'http://127.0.0.1:' + PORT;
const MEDIA = n => path.join(__dirname, '..', 'media', n);
const SHOT = n => path.join(__dirname, '..', 'shots', n + '.png');
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
const eyes = {
  title: 'Eyes Without a Face', artist: 'Billy Idol', level: 3, bpm: 85, capo: 0, tuning: 'standard', key: 'E', origin: 'claude', checked: true,
  shapes: [{ n: 'Emaj7', s: 'x79897' }, { n: 'C#m', s: 'x46654' }, { n: 'G#m', s: '466444' }, { n: 'B', s: '799877' }],
  sections: [{ name: 'Verse', type: 'chords', bars: ['Emaj7', 'C#m', 'G#m', 'B'], repeat: 3 }, { name: 'Chorus', type: 'chords', bars: ['A', 'B', 'A', 'B', 'A', 'B', 'F#m', 'G#m'] }]
};
/* stand-in decoder: ADTS in -> verify against the reference, decode the WAV instead */
function stub(base) {
  const real = AudioContext.prototype.decodeAudioData;
  window.__dec = { adts: 0, m4a: 0, match: null, other: 0, refused: 0 };
  const refFrames = async () => {            // the reference stream without its 7-byte headers
    const ref = new Uint8Array(await (await fetch(base + '/media/' + window.__ref)).arrayBuffer());
    const parts = []; let o = 0, total = 0;
    while (o + 7 <= ref.length) { const len = ((ref[o + 3] & 3) << 11) | (ref[o + 4] << 3) | (ref[o + 5] >> 5); parts.push(ref.subarray(o + 7, o + len)); total += len - 7; o += len; }
    const raw = new Uint8Array(total); let w = 0; parts.forEach(p => { raw.set(p, w); w += p.length; });
    return { ref, raw };
  };
  const startsSame = (a, b) => { if (b.length < a.length) return false; for (let i = 0; i < a.length; i += 61) if (a[i] !== b[i]) return false; return a[a.length - 1] === b[a.length - 1]; };
  AudioContext.prototype.decodeAudioData = function (ab, ok, bad) {
    const u = new Uint8Array(ab), self = this;
    const p = (async () => {
      const isAdts = u.length > 7 && u[0] === 0xff && (u[1] & 0xf6) === 0xf0;
      const isM4a = u.length > 12 && String.fromCharCode(u[4], u[5], u[6], u[7], u[8], u[9], u[10], u[11]) === 'ftypM4A ';
      if (!isAdts && !isM4a) { window.__dec.other++; return real.call(self, ab); }
      if (isM4a && window.__refuseM4a) { window.__dec.refused++; throw new DOMException('refused for the test', 'EncodingError'); }
      const { ref, raw } = await refFrames();
      let same;
      if (isAdts) { window.__dec.adts++; same = startsSame(u, ref) && (window.__whole ? u.length === ref.length : true); }
      else {
        window.__dec.m4a++;
        let o = 0, data = null;                                  // find the mdat box
        while (o + 8 <= u.length) { const len = ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0; if (String.fromCharCode(u[o + 4], u[o + 5], u[o + 6], u[o + 7]) === 'mdat') { data = u.subarray(o + 8, o + len); break; } o += len; }
        same = !!data && startsSame(data, raw) && (window.__whole ? data.length === raw.length : true);
      }
      window.__dec.match = same; window.__dec.bytes = u.length;
      const wav = await (await fetch(base + '/wav/eyes_take.wav')).arrayBuffer();
      return real.call(self, wav);
    })();
    p.then(b => ok && ok(b), e => bad && bad(e));
    return p;
  };
}
(async () => {
  const srv = await serve(PORT);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  async function fresh(withStub, ref) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|DEMUXER_ERROR|MEDIA_ERR|could not be decoded/i.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.addInitScript(song => { localStorage.setItem('pr.songs.v1', JSON.stringify({ s1: Object.assign({ id: 's1' }, song) })); }, eyes);
    if (withStub) { await page.addInitScript(stub, BASE); await page.addInitScript(r => { window.__ref = r; window.__whole = true; }, ref); }
    await page.goto(BASE + '/dist/local.html');
    await page.waitForTimeout(400);
    await page.click('#tabs [data-to="songs"]'); await page.click('[data-act="open"][data-id="s1"]');
    await page.click('[data-act="p-mode"][data-mode="take"]');
    return { ctx, page };
  }
  const give = (page, file) => page.setInputFiles('input[data-file="take"]:not([capture])', MEDIA(file));
  const log = page => page.evaluate(() => window.PR.app.diag.lines(6));

  for (const [label, file, ref, how] of [
    ['T1. a 38 MB phone video (too big to load whole)', 'g_big.mp4', 'g_big.ref.aac', /video\/mp4 \.mp4 37\.8 MB -> track \(m4a\), 68 s of sound/],
    ['T2. an iPhone-style .mov, HEVC picture, mono sound', 'b_iphone.mov', 'b_iphone.ref.aac', /video\/quicktime \.mov 10\.6 MB -> track \(m4a\), 68 s of sound/],
    ['T3. a voice memo (.m4a)', 'c_memo.m4a', 'c_memo.ref.aac', /\.m4a 0\.5 MB -> track \(m4a\), 68 s of sound/]
  ]) {
    console.log(label);
    const { ctx, page } = await fresh(true, ref);
    const t0 = Date.now();
    await give(page, file);
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 60000 });
    const txt = (await page.textContent('#sheetBody')).replace(/\s+/g, ' ');
    const dec = await page.evaluate(() => window.__dec), lines = await log(page);
    check('only the sound frames were handed to the decoder, identical to ffmpeg\'s copy', dec.m4a === 1 && dec.adts === 0 && dec.match === true && dec.other === 0, JSON.stringify(dec));
    check('the take is scored as before', /95%\s*19 of 20 right/.test(txt) && /Heard A for G#m/.test(txt), txt.slice(0, 90));
    check('the result says how it was read', /Read from the recording's sound track in \d+\.\d s\./.test(txt), (txt.match(/Read from[^.]*\.\d s\./) || [''])[0] + ' (whole flow ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    check('the technical log has the file and the route', lines.some(l => how.test(l)) && lines.some(l => /score: take of s1: 19 of 20/.test(l)), lines.slice(0, 2).join(' | '));
    if (file === 'g_big.mp4') await page.screenshot({ path: SHOT('track-result') });
    await ctx.close();
  }
  /* T4. the 5-minute limit, shortened for the test */
  {
    console.log('T4. a recording longer than the limit is cut and says so');
    const { ctx, page } = await fresh(true, 'c_memo.ref.aac');
    await page.evaluate(() => { window.PR.app.MAX_TAKE = 30; window.__whole = false; });
    await give(page, 'c_memo.m4a');
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 60000 });
    const txt = (await page.textContent('#sheetBody')).replace(/\s+/g, ' ');
    const dec = await page.evaluate(() => window.__dec), lines = await log(page);
    const frames = Math.ceil(32 * 48000 / 1024);
    check('only the first frames were read from the file', dec.match === true && dec.bytes < 320000 && dec.bytes > 200000, dec.bytes + ' bytes for about ' + frames + ' frames');
    check('the result says the recording was cut', /Only the first 30 seconds of the recording were scored\./.test(txt) && /cut at 30 s/.test(lines.join(' ')), (txt.match(/Only the first[^.]*\./) || [''])[0]);
    await ctx.close();
  }
  /* T4b. a decoder that turns the small MP4 down gets the same frames as a bare stream */
  {
    console.log('T4b. the first wrapper is refused, the second is tried');
    const { ctx, page } = await fresh(true, 'b_iphone.ref.aac');
    await page.evaluate(() => { window.__refuseM4a = true; });
    await give(page, 'b_iphone.mov');
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 60000 });
    const txt = (await page.textContent('#sheetBody')).replace(/\s+/g, ' ');
    const dec = await page.evaluate(() => window.__dec), lines = await log(page);
    check('refused once, then the bare stream is decoded and scored', dec.refused === 1 && dec.adts === 1 && dec.match === true && /19 of 20 right/.test(txt) && lines.some(l => /-> track \(adts\), 68 s of sound/.test(l)), JSON.stringify(dec) + ' | ' + lines[1]);
    await ctx.close();
  }
  /* T5. nothing can read it (this browser has no AAC decoder and cannot play the file): the reasons are logged */
  {
    console.log('T5. a file no route can read');
    const { ctx, page } = await fresh(false);
    await give(page, 'a_android.mp4');
    await page.waitForFunction(() => !document.querySelector('#toast').hidden, null, { timeout: 60000 });
    const toast = await page.textContent('#toast'), lines = await log(page);
    check('the player is told, and offered the route that does work', /could not be read here\. Try a sound recording/.test(toast), toast);
    check('the log lists what each route said', lines.some(l => /take: video\/mp4 \.mp4 13\.2 MB -> could not be read: track aac-decode \(m4a \w+, adts \w+\); decode \w+; play \w+/.test(l)), lines[0]);
    await ctx.close();
  }
  /* T6. other formats still go the old way */
  {
    console.log('T6. a WAV file is decoded whole, as before');
    const { ctx, page } = await fresh(false);
    await page.setInputFiles('input[data-file="take"]:not([capture])', path.join(__dirname, '..', 'wav', 'eyes_take.wav'));
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 60000 });
    const txt = (await page.textContent('#sheetBody')).replace(/\s+/g, ' '), lines = await log(page);
    check('scored, and the result says it was decoded by the browser', /19 of 20 right/.test(txt) && /Decoded by the browser in \d+\.\d s\./.test(txt));
    check('the log shows the first route was skipped for a reason', lines.some(l => /-> decode, 68 s of sound in .* \(after track not-mp4\)/.test(l)), lines.slice(0, 2).join(' | '));
    await ctx.close();
  }
  /* T7. sound in a format the track reader does not take (Opus in MP4): it falls through to the next route */
  {
    console.log('T7. Opus sound inside an MP4');
    const { ctx, page } = await fresh(false);
    await give(page, 'f_opus.mp4');
    await Promise.race([page.waitForSelector('#sheet:not([hidden])', { timeout: 120000 }), page.waitForFunction(() => !document.querySelector('#toast').hidden, null, { timeout: 120000 })]);
    const lines = await log(page);
    const sheet = await page.evaluate(() => !document.querySelector('#sheet').hidden);
    check('the reader steps aside for a codec it does not know', lines.some(l => /track codec-Opus/.test(l)), (sheet ? 'scored; ' : 'not readable in this browser; ') + lines[0]);
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures += errors.length; }
  console.log(failures ? '\nRECORDINGS: ' + failures + ' CHECK(S) FAILED' : '\nRECORDINGS: ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });

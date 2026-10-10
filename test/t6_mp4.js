'use strict';
/* The sound-track reader against files made by ffmpeg: its output must equal ffmpeg's own stream copy, byte for byte. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const PR = require(path.join(__dirname, '..', 'src', 'mp4audio.js'));
const dir = path.join(__dirname, '..', 'media');
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
/* a Blob that counts what is read from it */
function counted(file) {
  const buf = fs.readFileSync(path.join(dir, file));
  const stats = { reads: 0, bytes: 0, size: buf.length };
  const make = (b) => ({
    size: b.length,
    slice: (s, e) => make(b.subarray(s, e)),
    arrayBuffer: async () => { stats.reads++; stats.bytes += b.length; return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); }
  });
  return { blob: make(buf), stats };
}
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), b) === 0;

(async () => {
  for (const f of ['a_android.mp4', 'a_fast.mp4', 'b_iphone.mov', 'c_memo.m4a', 'g_big.mp4']) {
    const ref = fs.readFileSync(path.join(dir, f.replace(/\.\w+$/, '.ref.aac')));
    const { blob, stats } = counted(f);
    const t0 = Date.now();
    const r = await PR.mp4.extractAac(blob);
    check(f + ': sound track equals ffmpeg\'s copy', same(PR.mp4.toAdts(r), ref), r.frames + ' frames, ' + r.sampleRate + ' Hz, ' + r.channels + ' ch, ' + r.seconds.toFixed(2) + ' s (file says ' + (r.total && r.total.toFixed(2)) + '), read ' + (stats.bytes / 1048576).toFixed(2) + ' of ' + (stats.size / 1048576).toFixed(1) + ' MB in ' + stats.reads + ' reads, ' + (Date.now() - t0) + ' ms');
  }
  /* a limit in seconds keeps a whole number of frames from the start */
  {
    const ref = fs.readFileSync(path.join(dir, 'a_android.ref.aac'));
    const { blob, stats } = counted('g_big.mp4');
    let last = 0, calls = 0;
    const r = await PR.mp4.extractAac(blob, { maxSeconds: 10, onProgress: p => { calls++; last = p; } });
    const want = Math.ceil(10 * 48000 / 1024);
    check('a 10 second limit keeps the first ' + want + ' frames', r.frames === want && r.clipped === true && same(PR.mp4.toAdts(r), ref.subarray(0, PR.mp4.toAdts(r).length)) && Math.abs(r.seconds - want * 1024 / 48000) < 1e-9, 'read ' + (stats.bytes / 1024).toFixed(0) + ' KB of a ' + (stats.size / 1048576).toFixed(0) + ' MB file');
    check('progress is reported and ends at 1', calls > 0 && last === 1, calls + ' calls');
  }
  /* what cannot be read says why */
  for (const [f, want] of [['d_frag.mp4', 'fragmented'], ['e_alac.m4a', 'codec-alac'], ['f_opus.mp4', /^codec-/], ['../wav/pent_wait.wav', 'not-mp4']]) {
    let got = null;
    try { await PR.mp4.extractAac(counted(f).blob); got = 'no error'; } catch (e) { got = e.code || String(e); }
    check(path.basename(f) + ' is refused with a reason', want instanceof RegExp ? want.test(got) : got === want, got);
  }
  /* a file cut off in the middle (index at the end is missing) and one whose sound runs past the end */
  {
    const full = fs.readFileSync(path.join(dir, 'a_android.mp4'));
    const cut = (n) => { const b = full.subarray(0, n); const make = (x) => ({ size: x.length, slice: (s, e) => make(x.subarray(s, e)), arrayBuffer: async () => x.buffer.slice(x.byteOffset, x.byteOffset + x.length) }); return make(b); };
    let got = null;
    try { await PR.mp4.extractAac(cut(full.length >> 1)); got = 'no error'; } catch (e) { got = e.code; }
    check('a file cut off before its index is refused', got === 'no-index', got);
    const fast = fs.readFileSync(path.join(dir, 'a_fast.mp4'));
    const make = (x) => ({ size: x.length, slice: (s, e) => make(x.subarray(s, e)), arrayBuffer: async () => x.buffer.slice(x.byteOffset, x.byteOffset + x.length) });
    try { await PR.mp4.extractAac(make(fast.subarray(0, fast.length >> 1))); got = 'no error'; } catch (e) { got = e.code; }
    check('a file whose sound runs past its end is refused', got === 'cut-short', got);
    try { await PR.mp4.extractAac(make(fast.subarray(0, fast.length >> 1)), { maxSeconds: 5 }); got = 'ok'; } catch (e) { got = e.code; }
    check('...but its first seconds can still be read', got === 'ok', got);
    try { await PR.mp4.extractAac(make(Buffer.alloc(0))); got = 'no error'; } catch (e) { got = e.code; }
    check('an empty file is refused', got === 'not-mp4', got);
    try { await PR.mp4.extractAac(make(Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000 not a box at all, just text that is long enough'))); got = 'no error'; } catch (e) { got = e.code; }
    check('some other file is refused', got === 'not-mp4', got);
  }
  /* decoder setup bytes */
  {
    const a = PR.mp4._parseAsc(Uint8Array.from([0x11, 0x90]));           // AAC LC, 48000, 2 channels
    const b = PR.mp4._parseAsc(Uint8Array.from([0x12, 0x08]));           // AAC LC, 44100, 1 channel
    const c = PR.mp4._parseAsc(Uint8Array.from([0x2b, 0x92, 0x08, 0x00])); // SBR on top of LC: 22050 core, 2 channels, 44100 out
    check('decoder setup is read (LC 48k stereo, LC 44.1k mono, SBR over LC)', a.aot === 2 && a.hz === 48000 && a.channels === 2 && b.aot === 2 && b.hz === 44100 && b.channels === 1 && c.aot === 2 && c.hz === 22050 && c.channels === 2, JSON.stringify([a, b, c]));
  }
  /* ffmpeg decodes our stream to the same sound as it decodes the original file's track */
  {
    const tmp = path.join(dir, 'ours.aac');
    const r = await PR.mp4.extractAac(counted('b_iphone.mov').blob);
    fs.writeFileSync(tmp, PR.mp4.toAdts(r));
    const pcm = (args) => { const b = execFileSync('ffmpeg', ['-hide_banner', '-v', 'error'].concat(args, ['-f', 'f32le', '-ac', '1', '-ar', '44100', '-']), { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length >> 2); };
    const ours = pcm(['-i', tmp]), theirs = pcm(['-i', path.join(dir, 'b_iphone.mov'), '-vn']);
    /* the file's own decode drops the encoder's lead-in; find the shift and compare */
    let best = -1, bestLag = 0;
    for (let lag = 0; lag <= 4096; lag += 1) { let d = 0; for (let i = 44100; i < 44100 + 4000; i++) d += Math.abs(ours[i + lag] - theirs[i]); if (best < 0 || d < best) { best = d; bestLag = lag; } }
    let diff = 0, ref = 0; const n = Math.min(ours.length - bestLag, theirs.length);
    for (let i = 0; i < n; i++) { diff += Math.abs(ours[i + bestLag] - theirs[i]); ref += Math.abs(theirs[i]); }
    check('decoded sound matches the original track', diff / ref < 1e-4, 'shift ' + bestLag + ' samples, relative difference ' + (diff / ref).toExponential(2) + ', ' + (n / 44100).toFixed(1) + ' s compared');
    fs.unlinkSync(tmp);
  }
  /* the sound-only MP4 built from the same frames: ffprobe must read it as what it is, and ffmpeg must decode
     it to the same sound as the original file's track */
  for (const f of ['a_android.mp4', 'b_iphone.mov', 'c_memo.m4a']) {
    const r = await PR.mp4.extractAac(counted(f).blob);
    const out = path.join(dir, 'ours.m4a');
    const bytes = PR.mp4.toM4a(r);
    fs.writeFileSync(out, bytes);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', out]).toString());
    const st = probe.streams[0];
    check(f + ' as .m4a: read as AAC with the right rate, channels and length', probe.streams.length === 1 && st.codec_name === 'aac' && +st.sample_rate === r.sampleRate && st.channels === r.channels && Math.abs(+st.duration - r.seconds) < 0.05 && +st.nb_frames === r.frames && /m4a/.test(probe.format.format_name), st.codec_name + ' ' + st.profile + ', ' + st.sample_rate + ' Hz, ' + st.channels + ' ch, ' + (+st.duration).toFixed(2) + ' s, ' + st.nb_frames + ' frames, ' + bytes.length + ' bytes');
    const warn = execFileSync('ffmpeg', ['-hide_banner', '-v', 'warning', '-i', out, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    const pcm = (args) => { const b = execFileSync('ffmpeg', ['-hide_banner', '-v', 'error'].concat(args, ['-f', 'f32le', '-ac', '1', '-ar', String(r.sampleRate), '-']), { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length >> 2); };
    const ours = pcm(['-i', out]), theirs = pcm(['-i', path.join(dir, f), '-vn']);
    let best = -1, lag = 0;
    for (let l = 0; l <= 4096; l++) { let d = 0; for (let i = r.sampleRate; i < r.sampleRate + 3000; i++) d += Math.abs(ours[i + l] - theirs[i]); if (best < 0 || d < best) { best = d; lag = l; } }
    let diff = 0, ref = 0; const n = Math.min(ours.length - lag, theirs.length);
    for (let i = 0; i < n; i++) { diff += Math.abs(ours[i + lag] - theirs[i]); ref += Math.abs(theirs[i]); }
    check(f + ' as .m4a: decodes without complaint to the original sound', diff / ref < 1e-4 && warn.trim() === '', 'shift ' + lag + ', relative difference ' + (diff / ref).toExponential(2) + (warn.trim() ? ', ffmpeg said: ' + warn.trim().slice(0, 120) : ''));
    fs.unlinkSync(out);
  }
  console.log(failures ? failures + ' FAILED' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

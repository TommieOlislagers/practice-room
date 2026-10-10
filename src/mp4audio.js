/* Practice Room: the sound track of a phone recording.
   A phone video is mostly picture, far too large to load whole. This reads the file's index (the
   sample table of an MP4, M4A or MOV), fetches only the AAC sound frames, and hands them back as an
   ADTS stream, which a browser can decode in one go. Nothing here decodes sound itself. */
(function (root) {
  'use strict';
  var PR = root.PR = root.PR || {};
  var RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  /* box types a file of this family can start with */
  var TOP = { ftyp: 1, moov: 1, mdat: 1, free: 1, skip: 1, wide: 1, pnot: 1, uuid: 1, moof: 1, styp: 1, sidx: 1, meta: 1, junk: 1 };

  function fail(code) { var e = new Error(code); e.code = code; return e; }
  function read(blob, start, end) {
    var part = blob.slice(Math.max(0, start), Math.min(blob.size, end));
    if (typeof part.arrayBuffer === 'function') return part.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(fr.error || fail('read')); };
      fr.readAsArrayBuffer(part);
    });
  }
  function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function u32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function u64(b, o) { return u32(b, o) * 4294967296 + u32(b, o + 4); }
  function cc(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

  /* Walk the top-level boxes, reading only their headers, until the index ("moov") turns up. */
  function findMoov(blob) {
    var size = blob.size, seen = 0;
    function step(off) {
      if (off + 8 > size) return Promise.reject(fail(seen ? 'no-index' : 'not-mp4'));
      return read(blob, off, off + 16).then(function (h) {
        if (h.length < 8) throw fail(seen ? 'no-index' : 'not-mp4');
        var len = u32(h, 0), type = cc(h, 4), head = 8;
        if (len === 1) { if (h.length < 16) throw fail('bad-box'); len = u64(h, 8); head = 16; }
        else if (len === 0) len = size - off;
        if (!seen && !TOP[type]) throw fail('not-mp4');
        if (len < head) throw fail('bad-box');
        if (++seen > 4000) throw fail('bad-box');
        if (type === 'moov') {
          if (len > 96 * 1048576) throw fail('index-too-big');
          if (off + len > size) throw fail('cut-short');
          return read(blob, off + head, off + len);
        }
        return step(off + len);
      });
    }
    return step(0);
  }

  /* each(type, payloadStart, payloadEnd) for the boxes in b[start, end); stops early when each returns true */
  function kids(b, start, end, each) {
    var o = start;
    while (o + 8 <= end) {
      var len = u32(b, o), type = cc(b, o + 4), head = 8;
      if (len === 1) { if (o + 16 > end) break; len = u64(b, o + 8); head = 16; }
      else if (len === 0) len = end - o;
      if (len < head || o + len > end) break;
      if (each(type, o + head, o + len) === true) return true;
      o += len;
    }
    return false;
  }
  function child(b, range, name) {
    var r = null;
    if (range) kids(b, range[0], range[1], function (t, s, e) { if (t === name) { r = [s, e]; return true; } });
    return r;
  }

  /* MPEG-4 descriptors: a tag byte, a length in up to four 7-bit groups, then the body */
  function descLen(b, o, end) {
    var len = 0, n = 0, c;
    while (o < end && n < 4) { c = b[o++]; n++; len = (len << 7) | (c & 0x7f); if (!(c & 0x80)) break; }
    return [len, o];
  }
  /* -> { oti, asc } : what kind of stream it is and the decoder's setup bytes */
  function parseEsds(b, s, e) {
    var o = s + 4, l, fl;
    if (b[o] === 0x03) {
      l = descLen(b, o + 1, e); o = l[1] + 2;
      fl = b[o++];
      if (fl & 0x80) o += 2;
      if (fl & 0x40) o += 1 + b[o];
      if (fl & 0x20) o += 2;
    }
    if (o >= e || b[o] !== 0x04) return null;
    l = descLen(b, o + 1, e); o = l[1];
    var oti = b[o]; o += 13;
    if (o >= e || b[o] !== 0x05) return { oti: oti, asc: null };
    l = descLen(b, o + 1, e); o = l[1];
    return { oti: oti, asc: b.subarray(o, Math.min(e, o + l[0])) };
  }
  /* AudioSpecificConfig -> { aot, rateIdx, hz, channels } (the core coder when SBR or PS is signalled on top) */
  function parseAsc(a) {
    var pos = 0;
    function bits(n) {
      var v = 0, i, byte;
      for (i = 0; i < n; i++) { byte = a[pos >> 3] || 0; v = (v * 2) + ((byte >> (7 - (pos & 7))) & 1); pos++; }
      return v;
    }
    function aot() { var t = bits(5); if (t === 31) t = 32 + bits(6); return t; }
    function rate() { var i = bits(4); return i === 15 ? { idx: 15, hz: bits(24) } : { idx: i, hz: RATES[i] || 0 }; }
    var type = aot(), r = rate(), ch = bits(4);
    if (type === 5 || type === 29) { rate(); type = aot(); }
    if (r.idx === 15) r.idx = RATES.indexOf(r.hz);
    return { aot: type, rateIdx: r.idx, hz: r.hz, channels: ch };
  }

  /* One sound track -> what is needed to read its frames, or a reason it cannot be used. */
  function parseTrak(m, s, e) {
    var mdia = child(m, [s, e], 'mdia');
    var hdlr = child(m, mdia, 'hdlr');
    if (!hdlr || hdlr[1] - hdlr[0] < 12 || cc(m, hdlr[0] + 8) !== 'soun') return null;
    var stbl = child(m, child(m, mdia, 'minf'), 'stbl');
    var stsd = child(m, stbl, 'stsd'), stsz = child(m, stbl, 'stsz'), stsc = child(m, stbl, 'stsc');
    var stco = child(m, stbl, 'stco'), co64 = child(m, stbl, 'co64');
    if (!stsd || stsd[1] - stsd[0] < 44) return { why: 'no-sound-entry' };
    var entry = stsd[0] + 8, entryEnd = Math.min(stsd[1], entry + u32(m, entry)), format = cc(m, entry + 4);
    if (format !== 'mp4a') return { why: 'codec-' + format.replace(/[^\w.]/g, '_') };
    if (!stsz || !stsc || !(stco || co64)) return { why: 'no-table' };
    var version = u16(m, entry + 16);
    var boxChannels = version === 2 ? u32(m, entry + 48) : u16(m, entry + 24);
    /* the decoder setup sits in an "esds" box, directly in the entry or (QuickTime) inside a "wave" box */
    var es = null, i;
    for (i = entry + 16; i + 12 <= entryEnd; i++) {
      if (m[i + 4] === 0x65 && m[i + 5] === 0x73 && m[i + 6] === 0x64 && m[i + 7] === 0x73) {
        es = parseEsds(m, i + 8, Math.min(entryEnd, i + Math.max(12, u32(m, i))));
        if (es) break;
      }
    }
    if (!es || !es.asc || es.asc.length < 2) return { why: 'no-setup' };
    if (es.oti !== 0x40 && (es.oti < 0x66 || es.oti > 0x68)) return { why: 'codec-oti-' + es.oti.toString(16) };
    var asc = parseAsc(es.asc);
    if (asc.aot < 1 || asc.aot > 4) return { why: 'aac-type-' + asc.aot };
    if (asc.rateIdx < 0 || asc.rateIdx > 12 || !asc.hz) return { why: 'aac-rate' };
    var channels = asc.channels || (boxChannels <= 2 ? boxChannels : 0);
    if (channels < 1 || channels > 7) return { why: 'aac-channels' };

    var zs = stsz[0], fixed = u32(m, zs + 4), count = u32(m, zs + 8);
    if (!count) return { why: child(m, [0, m.length], 'mvex') ? 'fragmented' : 'no-samples' };
    if (!fixed && zs + 12 + count * 4 > stsz[1]) return { why: 'bad-table' };
    var sc = stsc[0], runs = u32(m, sc + 4);
    if (!runs || sc + 8 + runs * 12 > stsc[1]) return { why: 'bad-table' };
    var co = (stco || co64)[0], wide = !stco, nChunks = u32(m, co + 4);
    if (!nChunks || co + 8 + nChunks * (wide ? 8 : 4) > (stco || co64)[1]) return { why: 'bad-table' };
    var mdhd = child(m, mdia, 'mdhd'), total = null;
    if (mdhd) {
      var v1 = m[mdhd[0]] === 1, scale = u32(m, mdhd[0] + (v1 ? 20 : 12)), dur = v1 ? u64(m, mdhd[0] + 24) : u32(m, mdhd[0] + 16);
      if (scale && dur && dur !== 0xffffffff) total = dur / scale;
    }
    return {
      aot: asc.aot, rateIdx: asc.rateIdx, hz: asc.hz, channels: channels, mpeg2: es.oti !== 0x40, count: count, total: total, asc: new Uint8Array(es.asc),
      sizeOf: fixed ? function () { return fixed; } : function (k) { return u32(m, zs + 12 + k * 4); },
      runs: runs, runFirst: function (r) { return u32(m, sc + 8 + r * 12); }, runPer: function (r) { return u32(m, sc + 12 + r * 12); }, runDesc: function (r) { return u32(m, sc + 16 + r * 12); },
      nChunks: nChunks, chunkOff: wide ? function (c) { return u64(m, co + 8 + c * 8); } : function (c) { return u32(m, co + 8 + c * 4); }
    };
  }

  /* Promise<{ raw, sizes, asc, aot, rateIdx, sampleRate, channels, frames, seconds, total, clipped, codec }>:
     the sound frames one after another in `raw`, their lengths in `sizes`. Wrap them with toM4a() or toAdts().
     opts.maxSeconds: stop after that much sound. opts.onProgress(0..1). Rejects with a short reason in .code. */
  function extractAac(blob, opts) {
    opts = opts || {};
    return findMoov(blob).then(function (m) {
      var trak = null, why = 'no-sound';
      kids(m, 0, m.length, function (type, s, e) {
        if (type !== 'trak') return false;
        var t = parseTrak(m, s, e);
        if (t && !t.why) { trak = t; return true; }
        if (t && t.why && why === 'no-sound') why = t.why;
        return false;
      });
      if (!trak) throw fail(why);

      var limit = trak.count, perFrame = 1024 / trak.hz;
      if (opts.maxSeconds > 0) limit = Math.min(limit, Math.ceil(opts.maxSeconds / perFrame));
      /* the frames sit in chunks, between chunks of picture: list where each chunk is and what it holds */
      var chunks = [], si = 0, run = 0, bytes = 0, c, k, n, sz, cb;
      for (c = 0; c < trak.nChunks && si < limit; c++) {
        while (run + 1 < trak.runs && trak.runFirst(run + 1) <= c + 1) run++;
        if (trak.runDesc(run) !== 1) throw fail('mixed-sound');
        n = Math.min(trak.runPer(run), limit - si); cb = 0;
        for (k = 0; k < n; k++) { sz = trak.sizeOf(si + k); if (sz + 7 > 8191) throw fail('bad-frame'); cb += sz; }
        var off = trak.chunkOff(c);
        if (off + cb > blob.size) throw fail('cut-short');
        if (n) chunks.push({ off: off, first: si, n: n, bytes: cb });
        si += n; bytes += cb;
      }
      if (!si) throw fail('no-samples');
      /* Chunks that sit close together are fetched in one read: a read costs more than the bytes it skips.
         The picture data read along the way is capped at 48 MB in all; past that only touching chunks are joined. */
      var groups = [], g = null, spare = 48 * 1048576;
      chunks.forEach(function (ch) {
        var gap = g ? ch.off - g.end : -1;
        if (g && gap >= 0 && gap <= (spare > 0 ? 262144 : 4096) && ch.off + ch.bytes - g.start <= 4194304) { spare -= gap; g.end = ch.off + ch.bytes; g.items.push(ch); }
        else { g = { start: ch.off, end: ch.off + ch.bytes, items: [ch] }; groups.push(g); }
      });
      var raw = new Uint8Array(bytes), sizes = new Uint32Array(si), w = 0;
      function pump(i) {
        if (i >= groups.length) return Promise.resolve();
        var batch = groups.slice(i, i + 4);
        return Promise.all(batch.map(function (gr) { return read(blob, gr.start, gr.end); })).then(function (bufs) {
          bufs.forEach(function (buf, bi) {
            var gr = batch[bi];
            if (buf.length < gr.end - gr.start) throw fail('short-read');
            gr.items.forEach(function (ch) {
              var p = ch.off - gr.start, j;
              raw.set(buf.subarray(p, p + ch.bytes), w); w += ch.bytes;
              for (j = 0; j < ch.n; j++) sizes[ch.first + j] = trak.sizeOf(ch.first + j);
            });
          });
          if (opts.onProgress) opts.onProgress(Math.min(1, (i + batch.length) / groups.length));
          return pump(i + 4);
        });
      }
      return pump(0).then(function () {
        return { raw: raw, sizes: sizes, asc: trak.asc, aot: trak.aot, rateIdx: trak.rateIdx, mpeg2: trak.mpeg2, sampleRate: trak.hz, channels: trak.channels,
          frames: si, seconds: si * perFrame, total: trak.total, clipped: si < trak.count, reads: groups.length, codec: 'mp4a.40.' + trak.aot };
      });
    });
  }

  /* The frames as an ADTS stream: a 7-byte header in front of each frame. */
  function toAdts(t) {
    var n = t.sizes.length, out = new Uint8Array(t.raw.length + 7 * n), w = 0, p = 0, i, size, full;
    var h1 = 0xf1 | (t.mpeg2 ? 0x08 : 0), h2 = ((t.aot - 1) << 6) | (t.rateIdx << 2) | (t.channels >> 2), h3 = (t.channels & 3) << 6;
    for (i = 0; i < n; i++) {
      size = t.sizes[i]; full = size + 7;
      out[w] = 0xff; out[w + 1] = h1; out[w + 2] = h2; out[w + 3] = h3 | (full >> 11);
      out[w + 4] = (full >> 3) & 0xff; out[w + 5] = ((full & 7) << 5) | 0x1f; out[w + 6] = 0xfc;
      out.set(t.raw.subarray(p, p + size), w + 7);
      w += full; p += size;
    }
    return out;
  }

  /* The frames as a small sound-only MP4 (an .m4a): the same boxes a voice memo has, index first. */
  function toM4a(t) {
    var n = t.sizes.length, hz = t.sampleRate, dur = n * 1024, i;
    function be32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
    function be16(v) { return [(v >>> 8) & 255, v & 255]; }
    function str(x) { return x.split('').map(function (ch) { return ch.charCodeAt(0); }); }
    function zeros(k) { var z = []; while (k-- > 0) z.push(0); return z; }
    /* a box from a type and parts (arrays of bytes or typed arrays) */
    function box(type) {
      var len = 8, parts = Array.prototype.slice.call(arguments, 1), k, out, o;
      for (k = 0; k < parts.length; k++) len += parts[k].length;
      out = new Uint8Array(len); out.set(be32(len), 0); out.set(str(type), 4); o = 8;
      for (k = 0; k < parts.length; k++) { out.set(parts[k], o); o += parts[k].length; }
      return out;
    }
    function desc(tag, body) { var L = body.length; return [tag, 0x80 | ((L >> 21) & 0x7f), 0x80 | ((L >> 14) & 0x7f), 0x80 | ((L >> 7) & 0x7f), L & 0x7f].concat(body); }
    var matrix = [].concat(be32(0x10000), zeros(12), be32(0x10000), zeros(12), be32(0x40000000));
    var rate = Math.round(t.raw.length * 8 / (dur / hz));
    var asc = Array.prototype.slice.call(t.asc);
    var esds = box('esds', be32(0), desc(0x03, [].concat(be16(1), [0], desc(0x04, [].concat([0x40, 0x15], [0, 0, 0], be32(rate), be32(rate), desc(0x05, asc))), desc(0x06, [0x02]))));
    var mp4a = box('mp4a', zeros(6), be16(1), zeros(8), be16(t.channels), be16(16), zeros(4), be16(hz < 65536 ? hz : 0), be16(0), esds);
    var stsz = new Uint8Array(12 + 4 * n);
    stsz.set(be32(n), 8);
    for (i = 0; i < n; i++) { var v = t.sizes[i], o2 = 12 + 4 * i; stsz[o2] = (v >>> 24) & 255; stsz[o2 + 1] = (v >>> 16) & 255; stsz[o2 + 2] = (v >>> 8) & 255; stsz[o2 + 3] = v & 255; }
    var ftyp = box('ftyp', str('M4A '), be32(0), str('M4A '), str('mp42'), str('isom'));
    function moov(dataAt) {
      var stbl = box('stbl',
        box('stsd', be32(0), be32(1), mp4a),
        box('stts', be32(0), be32(1), be32(n), be32(1024)),
        box('stsc', be32(0), be32(1), be32(1), be32(n), be32(1)),
        box('stsz', stsz),
        box('stco', be32(0), be32(1), be32(dataAt)));
      var minf = box('minf', box('smhd', be32(0), be32(0)), box('dinf', box('dref', be32(0), be32(1), box('url ', be32(1)))), stbl);
      var mdia = box('mdia', box('mdhd', be32(0), be32(0), be32(0), be32(hz), be32(dur), be16(0x55c4), be16(0)), box('hdlr', be32(0), be32(0), str('soun'), zeros(12), str('SoundHandler'), [0]), minf);
      var trak = box('trak', box('tkhd', be32(7), be32(0), be32(0), be32(1), be32(0), be32(dur), zeros(8), be16(0), be16(0), be16(0x0100), be16(0), matrix, be32(0), be32(0)), mdia);
      return box('moov', box('mvhd', be32(0), be32(0), be32(0), be32(hz), be32(dur), be32(0x10000), be16(0x0100), zeros(10), matrix, zeros(24), be32(2)), trak);
    }
    var head = moov(0), dataAt = ftyp.length + head.length + 8;
    head = moov(dataAt);
    var out = new Uint8Array(dataAt + t.raw.length);
    out.set(ftyp, 0); out.set(head, ftyp.length);
    out.set(be32(8 + t.raw.length), ftyp.length + head.length); out.set(str('mdat'), ftyp.length + head.length + 4);
    out.set(t.raw, dataAt);
    return out;
  }

  PR.mp4 = { extractAac: extractAac, toAdts: toAdts, toM4a: toM4a, _parseAsc: parseAsc };
  if (typeof module !== 'undefined' && module.exports) module.exports = PR;
})(typeof window !== 'undefined' ? window : globalThis);

/* engine.js: the listening engine. Pure signal processing and scoring, no DOM and no Web Audio.
   Pitch: YIN (de Cheveigne and Kawahara, 2002). Chords: spectral-peak chroma matched against
   harmonic chord templates (after Fujishima 1999, Gomez 2006, Oudre et al. 2009).
   Takes: sequence alignment of what was heard against what the chart expects. */
(function (root) {
  'use strict';
  var PR = root.PR || (root.PR = {});
  var M = PR.music;

  /* ---------- small helpers ---------- */
  function median(arr) {
    if (!arr.length) return NaN;
    var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
    var h = a.length >> 1;
    return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
  }
  function percentile(arr, p) {
    if (!arr.length) return NaN;
    var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
    var i = Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))));
    return a[i];
  }
  function cosine(a, b) {
    var d = 0, na = 0, nb = 0;
    for (var i = 0; i < 12; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na > 0 && nb > 0 ? d / Math.sqrt(na * nb) : 0;
  }
  function samePc(a, b) { return ((a - b) % 12 + 12) % 12 === 0; }

  /* ---------- FFT (radix 2, in place) ---------- */
  function makeFFT(n) {
    var levels = Math.round(Math.log(n) / Math.LN2);
    var rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (var i = 0; i < n; i++) {
      var r = 0;
      for (var b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
      rev[i] = r;
    }
    for (var k = 0; k < n / 2; k++) { cos[k] = Math.cos(2 * Math.PI * k / n); sin[k] = Math.sin(2 * Math.PI * k / n); }
    return function (re, im) {
      var i2, j, t;
      for (i2 = 0; i2 < n; i2++) {
        j = rev[i2];
        if (j > i2) { t = re[i2]; re[i2] = re[j]; re[j] = t; t = im[i2]; im[i2] = im[j]; im[j] = t; }
      }
      for (var size = 2; size <= n; size <<= 1) {
        var half = size >> 1, step = n / size;
        for (var s = 0; s < n; s += size) {
          for (var p = s, q = 0; p < s + half; p++, q += step) {
            var l = p + half;
            var tre = re[l] * cos[q] + im[l] * sin[q];
            var tim = im[l] * cos[q] - re[l] * sin[q];
            re[l] = re[p] - tre; im[l] = im[p] - tim;
            re[p] += tre; im[p] += tim;
          }
        }
      }
    };
  }

  /* ---------- low-pass FIR for decimation ---------- */
  function makeDecimator(factor) {
    if (factor <= 1) return { factor: 1, taps: 1, h: new Float32Array([1]) };
    var taps = 8 * factor + 1, h = new Float32Array(taps), fc = 0.45 / factor, sum = 0, mid = (taps - 1) / 2;
    for (var i = 0; i < taps; i++) {
      var k = i - mid;
      var sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
      var w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (taps - 1));
      h[i] = sinc * w; sum += h[i];
    }
    for (var j = 0; j < taps; j++) h[j] /= sum;
    return { factor: factor, taps: taps, h: h };
  }
  /* Fill out[0..outLen) with the decimated tail of input. Returns how many samples were produced. */
  function decimateTail(input, inLen, dec, out, outLen) {
    var f = dec.factor, taps = dec.taps, h = dec.h;
    var can = Math.floor((inLen - taps) / f) + 1;
    var n = Math.min(outLen, can);
    if (n <= 0) return 0;
    var base = inLen - taps - (n - 1) * f;
    if (f === 1) { for (var a = 0; a < n; a++) out[a] = input[base + a]; return n; }
    for (var j = 0; j < n; j++) {
      var acc = 0, off = base + j * f;
      for (var t = 0; t < taps; t++) acc += h[t] * input[off + t];
      out[j] = acc;
    }
    return n;
  }

  /* tolerance window around a semitone: full weight within 20 cents, tapering to zero at a quarter tone */
  function tolWeight(dev) {
    if (dev <= 0.2) return 1;
    if (dev >= 0.5) return 0;
    var c = Math.cos(Math.PI / 2 * (dev - 0.2) / 0.3);
    return c * c;
  }
  var CHROMA_FMIN = 72, CHROMA_FMAX = 2100;
  function freqWeight(f) {
    if (f < CHROMA_FMIN || f > CHROMA_FMAX) return 0;
    if (f < 1000) return 1;
    return 1 - 0.6 * (f - 1000) / (CHROMA_FMAX - 1000);
  }

  /* ---------- analyzer ---------- */
  function createAnalyzer(sampleRate, opts) {
    opts = opts || {};
    var sr = sampleRate;
    var a4 = opts.a4 || 440;
    var fp = Math.max(1, Math.round(sr / 24000));
    var fc = Math.max(1, Math.round(sr / 12000));
    var srP = sr / fp, srC = sr / fc;
    var decP = makeDecimator(fp), decC = makeDecimator(fc);
    var WP = 2048, NC = 4096;
    var xp = new Float32Array(WP), xc = new Float32Array(NC);
    var re = new Float64Array(NC), im = new Float64Array(NC), mag = new Float32Array(NC / 2);
    var hann = new Float32Array(NC);
    var fft = makeFFT(NC);
    var tauMax = Math.min(Math.floor(srP / 60), WP / 2 - 2);
    var tauMin = Math.max(2, Math.floor(srP / 1500));
    var d = new Float32Array(tauMax + 2);
    var chroma = new Float32Array(12);
    /* peak strength per semitone, MIDI 36..99, not folded into one octave */
    var semi = new Float32Array(64);
    var binHz = srC / NC;
    var needed = Math.max((WP - 1) * fp + decP.taps, (NC - 1) * fc + decC.taps);
    var lastN = 0;

    function setA4(v) { a4 = v; }

    var hfOut = 0;
    /* level of the newest n samples, and the level of their first difference (a crude treble measure:
       a pluck adds treble even when other strings are still ringing loudly) */
    function rms(buf, len, n) {
      var s = 0, h = 0, start = Math.max(1, len - n), dfx;
      for (var i = start; i < len; i++) { s += buf[i] * buf[i]; dfx = buf[i] - buf[i - 1]; h += dfx * dfx; }
      hfOut = Math.sqrt(h / Math.max(1, len - start));
      return Math.sqrt(s / Math.max(1, len - start));
    }

    /* YIN on the decimated tail. Returns frequency in Hz (0 if none) and clarity 0..1. */
    function pitch(buf, len, out) {
      var n = decimateTail(buf, len, decP, xp, WP);
      out.freq = 0; out.clarity = 0; out.midi = NaN;
      if (n < WP) return out;
      var W = WP - tauMax, tau, j, s, diff, running = 0;
      d[0] = 1;
      for (tau = 1; tau <= tauMax; tau++) {
        s = 0;
        for (j = 0; j < W; j++) { diff = xp[j] - xp[j + tau]; s += diff * diff; }
        running += s;
        d[tau] = running > 0 ? s * tau / running : 1;
      }
      /* Deepest dip first, then the shortest period whose dip is nearly as deep. A plain threshold picks the
         octave above on low acoustic strings, where the second partial is stronger than the fundamental.
         Dips are compared at their interpolated depth: at short periods the true minimum falls between
         samples, and the raw value would lose to a sub-harmonic that happens to land on a whole sample. */
      var pick = -1, g = 2, v, s0, s1, s2, cv;
      for (tau = tauMin + 1; tau < tauMax; tau++) {
        s1 = d[tau];
        if (s1 > 0.6 || s1 > d[tau - 1] || s1 > d[tau + 1]) continue;
        s0 = d[tau - 1]; s2 = d[tau + 1]; cv = s0 - 2 * s1 + s2;
        v = cv > 0 ? s1 - (s0 - s2) * (s0 - s2) / (8 * cv) : s1;
        if (v < g) g = v;
      }
      if (g > 0.5) return out;
      var lim = (g < 0 ? 0 : g) + 0.035, depth = 1;
      for (tau = tauMin + 1; tau < tauMax; tau++) {
        s1 = d[tau];
        if (s1 > 0.6 || s1 > d[tau - 1] || s1 > d[tau + 1]) continue;
        s0 = d[tau - 1]; s2 = d[tau + 1]; cv = s0 - 2 * s1 + s2;
        v = cv > 0 ? s1 - (s0 - s2) * (s0 - s2) / (8 * cv) : s1;
        if (v <= lim) { pick = tau; depth = v < 0 ? 0 : v; break; }
      }
      if (pick <= 1 || pick >= tauMax) return out;
      s0 = d[pick - 1]; s1 = d[pick]; s2 = d[pick + 1];
      var den = 2 * s1 - s2 - s0;
      var better = den !== 0 ? pick + (s2 - s0) / (2 * den) : pick;
      if (!(better > 0)) return out;
      out.freq = srP / better;
      out.clarity = Math.max(0, Math.min(1, 1 - depth));
      out.midi = 69 + 12 * Math.log(out.freq / a4) / Math.LN2;
      return out;
    }

    /* Spectral-peak chroma on the decimated tail. Fills chroma[12] (unit length) and semi[64]. */
    function computeChroma(buf, len) {
      var n = decimateTail(buf, len, decC, xc, NC);
      var i, k;
      for (i = 0; i < 12; i++) chroma[i] = 0;
      for (i = 0; i < 64; i++) semi[i] = 0;
      if (n < NC / 4) return 0;
      if (n !== lastN) {
        for (i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
        lastN = n;
      }
      for (i = 0; i < n; i++) { re[i] = xc[i] * hann[i]; im[i] = 0; }
      for (i = n; i < NC; i++) { re[i] = 0; im[i] = 0; }
      fft(re, im);
      var kLo = Math.max(2, Math.floor(CHROMA_FMIN / binHz) - 1), kHi = Math.min(NC / 2 - 2, Math.ceil(CHROMA_FMAX / binHz) + 1);
      var mx = 0;
      for (k = kLo - 1; k <= kHi + 1; k++) { mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]); if (mag[k] > mx) mx = mag[k]; }
      if (mx <= 0) return 0;
      var floor = mx * 0.02, total = 0;
      for (k = kLo; k <= kHi; k++) {
        var m1 = mag[k];
        if (m1 < floor || m1 <= mag[k - 1] || m1 < mag[k + 1]) continue;
        var al = Math.log(mag[k - 1] + 1e-12), be = Math.log(m1 + 1e-12), ga = Math.log(mag[k + 1] + 1e-12);
        var dd = al - 2 * be + ga;
        var p = dd !== 0 ? 0.5 * (al - ga) / dd : 0;
        if (p > 0.5) p = 0.5; else if (p < -0.5) p = -0.5;
        var f = (k + p) * binHz;
        var fw = freqWeight(f);
        if (fw <= 0) continue;
        var pm = Math.exp(be - 0.25 * (al - ga) * p);
        var mf = 69 + 12 * Math.log(f / a4) / Math.LN2;
        var near = Math.round(mf);
        var w = tolWeight(Math.abs(mf - near)) * fw * Math.sqrt(pm);
        if (w <= 0) continue;
        chroma[((near % 12) + 12) % 12] += w; total += w;
        if (near >= 36 && near < 100) semi[near - 36] += w;
      }
      var norm = 0;
      for (i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
      norm = Math.sqrt(norm);
      if (norm > 0) for (i = 0; i < 12; i++) chroma[i] /= norm;
      return total;
    }

    var pOut = { freq: 0, clarity: 0, midi: NaN };
    /* Analyze the newest samples in buf[0..len). The returned object and its arrays are reused between calls. */
    var frame = { rms: 0, hf: 0, freq: 0, clarity: 0, midi: NaN, chroma: null, semi: null, chromaEnergy: 0 };
    function analyze(buf, len, wantPitch, wantChroma) {
      frame.rms = rms(buf, len, Math.round(sr * 0.022));
      frame.hf = hfOut;
      if (wantPitch) { pitch(buf, len, pOut); frame.freq = pOut.freq; frame.clarity = pOut.clarity; frame.midi = pOut.midi; }
      else { frame.freq = 0; frame.clarity = 0; frame.midi = NaN; }
      if (wantChroma) { frame.chromaEnergy = computeChroma(buf, len); frame.chroma = chroma; frame.semi = semi; }
      else { frame.chroma = null; frame.semi = null; frame.chromaEnergy = 0; }
      return frame;
    }
    return { sr: sr, needed: needed, analyze: analyze, setA4: setA4, pitchRate: srP, chromaRate: srC, chromaWindow: NC / srC, pitchWindow: WP / srP };
  }

  /* ---------- chord templates ---------- */
  /* Relative strength of partials 1..8 after square-root compression. Fitted to sampled guitar notes. */
  var HARM = [1, 0.8, 0.62, 0.5, 0.4, 0.32, 0.25, 0.2];
  function templateFromMidi(midis, a4) {
    var t = new Float32Array(12), i, h;
    for (i = 0; i < midis.length; i++) {
      var f0 = M.midiToFreq(midis[i], a4 || 440);
      for (h = 1; h <= HARM.length; h++) {
        var f = f0 * h, fw = freqWeight(f);
        if (f > CHROMA_FMAX) break;
        if (fw <= 0) continue;
        var mf = midis[i] + 12 * Math.log(h) / Math.LN2;
        var near = Math.round(mf);
        var w = tolWeight(Math.abs(mf - near)) * HARM[h - 1] * fw;
        /* small microphones lose the bottom octave */
        if (f < 110) w *= 0.45; else if (f < 150) w *= 0.75;
        t[((near % 12) + 12) % 12] += w;
      }
    }
    var n = 0;
    for (i = 0; i < 12; i++) n += t[i] * t[i];
    n = Math.sqrt(n);
    if (n > 0) for (i = 0; i < 12; i++) t[i] /= n;
    return t;
  }
  function pcsKey(midis) {
    var seen = {}, out = [];
    midis.forEach(function (m) { var pc = ((m % 12) + 12) % 12; if (!seen[pc]) { seen[pc] = 1; out.push(pc); } });
    return out.sort(function (a, b) { return a - b; }).join(',');
  }
  /* A dictionary used only for the "heard" readout. */
  var NAME_QUALS = [['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]], ['sus4', [0, 5, 7]], ['sus2', [0, 2, 7]], ['5', [0, 7]]];
  var nameBook = null;
  function buildNameBook() {
    nameBook = [];
    for (var r = 0; r < 12; r++) {
      NAME_QUALS.forEach(function (q) {
        var up = r < 4 ? 12 : 0;
        var midis = [36 + r + up];
        q[1].forEach(function (iv) { midis.push(48 + r + iv + up); });
        midis.push(60 + r + up);
        nameBook.push({ name: M.pcName(r) + q[0], root: r, qual: q[0], tmpl: templateFromMidi(midis), size: q[1].length, pcsKey: pcsKey(midis) });
      });
    }
  }
  function nameChord(chroma) {
    if (!nameBook) buildNameBook();
    var best = null, bs = 0;
    for (var i = 0; i < nameBook.length; i++) {
      var s = cosine(chroma, nameBook[i].tmpl) - (nameBook[i].size > 3 ? 0.015 : 0) - (nameBook[i].size < 3 ? 0.03 : 0);
      if (s > bs) { bs = s; best = nameBook[i]; }
    }
    return best ? { name: best.name, root: best.root, qual: best.qual, pcsKey: best.pcsKey, score: bs } : null;
  }
  /* pitch-class sets as "0,4,7" strings */
  function related(aKey, bKey) {
    var a = aKey.split(','), b = bKey.split(','), small = a.length <= b.length ? a : b, big = a.length <= b.length ? b : a;
    for (var i = 0; i < small.length; i++) if (big.indexOf(small[i]) < 0) return false;
    return true;
  }
  function common(aKey, bKey) {
    var a = aKey.split(','), b = bKey.split(','), n = 0;
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) n++;
    return n;
  }
  /* A clearly different chord than the target, named the way the chart writes chords (relative to the capo). */
  function otherChord(chroma, t, minScore) {
    var nm = nameChord(chroma);
    if (!nm || nm.score < minScore || !t.pcsKey) return null;
    if (common(nm.pcsKey, t.pcsKey) > 1) return null;
    return M.pcName(nm.root - (t.capo || 0)) + nm.qual;
  }

  /* The chords a learner most often plays by mistake for a given chord: the parallel major or minor,
     and the two chords that share two of its three notes. rootPc is the sounding pitch class. */
  var nearCache = {};
  function nearChords(rootPc, minor) {
    var key = rootPc + (minor ? 'm' : 'M');
    if (nearCache[key]) return nearCache[key];
    var names = minor
      ? [M.pcName(rootPc), M.pcName(rootPc + 3), M.pcName(rootPc + 8)]
      : [M.pcName(rootPc) + 'm', M.pcName(rootPc + 9) + 'm', M.pcName(rootPc + 4) + 'm'];
    var out = [];
    names.forEach(function (nm) {
      var ch = M.parseChord(nm), sh = ch ? M.shapeFor(ch) : null;
      if (!sh) return;
      var midis = M.shapeMidi(sh, 'standard', 0);
      out.push({ name: nm, tmpl: templateFromMidi(midis), pcsKey: pcsKey(midis), generic: true });
    });
    nearCache[key] = out;
    return out;
  }

  /* Attach templates and rivals to targets. Rivals are the other chords of the same chart, plus the
     near chords above. Returns the chart's own distinct chords. */
  function prepareTargets(targets, a4) {
    var byKey = {};
    targets.forEach(function (t) {
      if (t.kind !== 'chord') return;
      t.pcsKey = pcsKey(t.midis);
      t.tmpl = templateFromMidi(t.midis, a4);
      var k = t.chordName || t.pcsKey;
      /* where the chord's third sits in this voicing, and where the other third would sit */
      t.thirdIdx = null;
      if (t.root !== undefined && t.root !== null && (t.third === 3 || t.third === 4)) {
        var own = [], alt = [];
        t.midis.forEach(function (m) {
          if (((m - t.root - t.third) % 12 + 12) % 12 !== 0) return;
          var a = m + (t.third === 4 ? -1 : 1);
          if (m >= 36 && m < 100 && a >= 36 && a < 100) { own.push(m - 36); alt.push(a - 36); }
        });
        if (own.length) { t.thirdIdx = own; t.altIdx = alt; t.parallel = M.pcName(t.root) + (t.third === 4 ? 'm' : ''); }
      }
      if (!byKey[k]) byKey[k] = { name: t.chordName || t.label, tmpl: t.tmpl, pcsKey: t.pcsKey, root: t.root, third: t.third, thirdIdx: t.thirdIdx, altIdx: t.altIdx, parallel: t.parallel };
    });
    var all = Object.keys(byKey).map(function (k) { return byKey[k]; });
    targets.forEach(function (t) {
      if (t.kind !== 'chord') return;
      var rivals = all.filter(function (r) { return r.pcsKey !== t.pcsKey; });
      if (t.root !== undefined && t.root !== null && (t.third === 3 || t.third === 4)) {
        nearChords(t.root, t.third === 3).forEach(function (g) {
          if (g.pcsKey === t.pcsKey || related(g.pcsKey, t.pcsKey)) return;
          if (rivals.some(function (r) { return r.pcsKey === g.pcsKey; })) return;
          rivals.push(g);
        });
      }
      t.rivals = rivals;
    });
    return all;
  }

  function noteMatches(midi, target) {
    if (!(midi === midi)) return false;
    var dlt = midi - target;
    if (Math.abs(dlt) <= 0.5) return true;
    return Math.abs(Math.abs(dlt) - 12) <= 0.5;
  }
  function centsOff(midi, target) {
    var dlt = midi - target;
    if (Math.abs(dlt) > 6) dlt -= 12 * Math.round(dlt / 12);
    return dlt * 100;
  }
  function chordScore(chroma, t) {
    var s = cosine(chroma, t.tmpl), best = 0, bestName = null;
    if (t.rivals) for (var i = 0; i < t.rivals.length; i++) {
      var r = cosine(chroma, t.rivals[i].tmpl);
      if (r > best) { best = r; bestName = t.rivals[i].name; }
    }
    return { s: s, rival: best, rivalName: bestName };
  }
  var CHORD_ABS = 0.76, CHORD_MARGIN = 0.02;
  /* Major or minor? Folded into one octave, a minor chord on an electric guitar looks nearly major, because
     the fifth partial of each root is a major third. In the unfolded spectrum the question is simple:
     is the string that carries the third sounding the chart's third, or the one a fret away?
     Returns 1 for the chart's third, -1 for the other third, 0 when unclear. */
  function thirdSide(semi, t) {
    if (!semi || !t.thirdIdx) return 0;
    var own = 0, alt = 0, tot = 0, i;
    for (i = 0; i < 64; i++) tot += semi[i];
    for (i = 0; i < t.thirdIdx.length; i++) { own += semi[t.thirdIdx[i]]; alt += semi[t.altIdx[i]]; }
    if (tot <= 0) return 0;
    if (alt > own * 1.6 && alt > tot * 0.035) return -1;
    if (own > alt * 1.6 && own > tot * 0.035) return 1;
    return 0;
  }
  function chordOk(sc, side) { return side >= 0 && sc.s >= CHORD_ABS && sc.s >= sc.rival - CHORD_MARGIN; }
  /* Returns the name of the wrong chord heard, or null. */
  function chordWrong(sc, side, t) {
    if (side < 0 && sc.s >= 0.7) return t.parallel;
    if (sc.rival >= 0.84 && sc.rival >= sc.s + 0.08) return sc.rivalName;
    return null;
  }

  /* ---------- which note just started? ----------
     When strings ring over each other the period detector hears a blend. A note that was just plucked
     shows as partials that grew compared with a moment ago. before and now are semitone spectra. */
  var ZERO64 = new Float32Array(64);
  var LOOKBACK = 0.28;
  var HOFF = [0, 12, 19, 24, 28, 31];
  var growthBuf = new Float32Array(64), scoreBuf = new Float32Array(64);
  /* Fills growthBuf with what grew. Returns the total growth, or 0 if nothing clearly new sounded. */
  function growth(before, now) {
    var tot = 0, sumNow = 0, i, dlt;
    if (!before) before = ZERO64;
    for (i = 0; i < 64; i++) { dlt = now[i] - before[i]; growthBuf[i] = dlt > 0 ? dlt : 0; tot += growthBuf[i]; sumNow += now[i]; }
    return tot > 0 && tot >= sumNow * 0.1 ? tot : 0;
  }
  function partialSum(idx) {
    var got = 0;
    for (var h = 0; h < 6; h++) { var j = idx + HOFF[h]; if (j >= 0 && j < 64) got += growthBuf[j]; }
    return got;
  }
  /* Share of the new sound that sits on the partials of target (0..1). */
  function noteSupport(before, now, target) {
    var tot = growth(before, now);
    if (!tot) return 0;
    var idx = target - 36;
    if (idx < 0 || idx >= 64) return 0;
    var base = growthBuf[idx] + (idx + 12 < 64 ? growthBuf[idx + 12] : 0);
    if (base < tot * 0.05) return 0;
    return partialSum(idx) / tot;
  }
  /* The note that just started, or -1. Highest note whose partials explain nearly as much as the best. */
  function freshNote(before, now) {
    var tot = growth(before, now);
    if (!tot) return -1;
    var best = 0, i;
    for (i = 0; i <= 52; i++) {
      var base = growthBuf[i] + (i + 12 < 64 ? growthBuf[i + 12] : 0);
      scoreBuf[i] = base >= tot * 0.05 ? partialSum(i) : 0;
      if (scoreBuf[i] > best) best = scoreBuf[i];
    }
    if (best < tot * 0.5) return -1;
    for (i = 52; i >= 0; i--) if (scoreBuf[i] >= 0.85 * best) return i + 36;
    return -1;
  }
  /* Is a note of this name audible at all? Guards against phantom pitches from a blend of strings. */
  function present(semi, midi) {
    var tot = 0, i;
    for (i = 0; i < 64; i++) tot += semi[i];
    if (tot <= 0) return false;
    var idx = midi - 36, got = 0;
    if (idx >= 0 && idx < 64) got += semi[idx];
    if (idx + 12 >= 0 && idx + 12 < 64) got += semi[idx + 12];
    return got >= tot * 0.05;
  }
  /* Does the period detector's reading count for this target? A clear reading does. A hazy one has to
     show a partial of its own in the spectrum, because two ringing strings can fake a pitch a twelfth
     below one of them. lastSemi is the newest semitone spectrum, or null. */
  function yinHit(frame, target, lastSemi) {
    if (!(frame.clarity >= 0.8) || !noteMatches(frame.midi, target)) return false;
    if (frame.clarity >= 0.9 || !lastSemi) return true;
    return present(lastSemi, Math.round(frame.midi));
  }
  /* Rolling store of semitone spectra. */
  function Snaps() { this.list = []; }
  Snaps.prototype.push = function (semi, t) {
    this.list.push({ t: t, semi: Float32Array.from(semi) });
    while (this.list.length > 1 && t - this.list[0].t > 0.9) this.list.shift();
  };
  Snaps.prototype.latest = function (t) {
    var l = this.list[this.list.length - 1];
    return l && t - l.t <= 0.2 ? l.semi : null;
  };
  Snaps.prototype.before = function (t) {
    var best = null;
    for (var i = 0; i < this.list.length; i++) if (this.list[i].t <= t) best = this.list[i];
    return best ? best.semi : null;
  };

  /* ---------- level gate and onsets, shared by live tracking ---------- */
  /* The noise floor is the quietest third of a second heard so far. It only ever goes down, so steady
     playing cannot push the gate up and mute itself. */
  function Gate() {
    this.floor = null;
    this.hfFloor = null;
    this.win = [];
    this.prev = [];
    this.lastOnset = -1;
  }
  Gate.prototype.push = function (rms, t, hf) {
    var w = this.win, i, s = 0, sh = 0;
    if (hf === undefined) hf = 0;
    w.push({ r: rms, h: hf, t: t });
    while (w.length > 1 && t - w[0].t > 0.3) w.shift();
    if (w.length >= 3 && t - w[0].t >= 0.2) {
      for (i = 0; i < w.length; i++) { s += w[i].r; sh += w[i].h; }
      s /= w.length; sh /= w.length;
      if (this.floor === null || s < this.floor) this.floor = Math.max(0.0004, s);
      if (this.hfFloor === null || sh < this.hfFloor) this.hfFloor = Math.max(0.00002, sh);
    }
    var gate = Math.max(0.002, (this.floor === null ? 0.001 : this.floor) * 2.2);
    /* onset: clearly louder, or clearly brighter, than anything in the 90 ms before */
    var p = this.prev, ref = Infinity, refH = Infinity;
    while (p.length && t - p[0].t > 0.095) p.shift();
    for (i = 0; i < p.length; i++) { if (p[i].r < ref) ref = p[i].r; if (p[i].h < refH) refH = p[i].h; }
    /* two strings a semitone apart beat against each other, and the level swings like a slow tremolo.
       A real attack also gets brighter, a beat does not. */
    var loud = rms > ref * 1.8 && rms > ref + gate * 0.5 && (hf <= 0 || hf > refH * 1.4);
    var bright = hf > 0 && hf > refH * 2.2 && hf > (this.hfFloor === null ? 0 : this.hfFloor) * 4 && rms > ref * 1.05;
    var onset = p.length > 0 && rms > gate && (loud || bright) && t - this.lastOnset > 0.12;
    if (onset) this.lastOnset = t;
    p.push({ r: rms, h: hf, t: t });
    return { voiced: rms > gate, onset: onset, loud: onset && loud, gate: gate };
  };

  /* ---------- wait mode: the chart waits for you ---------- */
  function WaitTracker(targets, opts) {
    this.targets = targets;
    this.opts = opts || {};
    this.i = 0;
    this.results = [];
    this.gate = new Gate();
    this.snaps = new Snaps();
    this.done = targets.length === 0;
    this.startT = null;
    this.loops = 0;
    this._enter(0, 0);
  }
  WaitTracker.prototype._enter = function (i, t) {
    this.i = i;
    var cur = this.targets[i], prev = i > 0 ? this.targets[i - 1] : (this.loops > 0 ? this.targets[this.targets.length - 1] : null);
    this.st = {
      since: t, run: 0, wrongRun: 0, wrongKey: null, wrong: null, onset: false, specRun: 0, cand: -1, cents: [], sup: 0,
      prevMidi: prev && prev.kind === 'note' ? prev.midis[0] : null, prevName: prev && prev.kind === 'chord' ? (prev.chordName || prev.label) : null,
      /* the same note or chord twice in a row has to be struck again, a ringing string does not count */
      needOnset: !!(prev && cur && ((cur.kind === 'note' && prev.kind === 'note' && samePc(cur.midis[0], prev.midis[0])) || (cur.kind === 'chord' && prev.kind === 'chord' && cur.pcsKey === prev.pcsKey)))
    };
  };
  WaitTracker.prototype.skip = function (t) {
    if (this.done) return;
    this.results.push({ index: this.i, hit: false, skipped: true, time: t - this.st.since, wrong: this.st.wrong, t: t, loop: this.loops });
    this._advance(t);
  };
  WaitTracker.prototype._advance = function (t) {
    if (this.i + 1 >= this.targets.length) {
      if (this.opts.loop) { this.loops++; this._enter(0, t); }
      else this.done = true;
    } else this._enter(this.i + 1, t);
  };
  /* frame: {rms, hf, midi, clarity, chroma, semi}. Returns an event or null. */
  WaitTracker.prototype.push = function (frame, t) {
    if (this.done) return null;
    if (this.startT === null) { this.startT = t; this.st.since = t; }
    var g = this.gate.push(frame.rms, t, frame.hf);
    var st = this.st, cur = this.targets[this.i], ev = null;
    if (g.onset && t - st.since > 0.03) st.onset = true;
    var target = cur.kind === 'note' ? cur.midis[0] : -1;
    if (frame.semi) {
      if (cur.kind === 'note') {
        var before = this.snaps.before(t - LOOKBACK);
        st.sup = g.voiced ? noteSupport(before, frame.semi, target) : 0;
        var c = g.voiced ? freshNote(before, frame.semi) : -1;
        if (c >= 0) st.cand = c;
        if (st.sup >= 0.6) st.specRun++; else if (st.sup < 0.45) st.specRun = 0;
      }
      this.snaps.push(frame.semi, t);
    }
    if (!g.voiced) { st.run = 0; st.wrongRun = 0; st.specRun = 0; return null; }
    var armed = !st.needOnset || st.onset;
    if (cur.kind === 'note') {
      if (yinHit(frame, target, this.snaps.latest(t))) {
        st.run++;
        st.wrongRun = 0;
        st.cents.push(centsOff(frame.midi, target));
        if (st.run >= 2 && armed) ev = { type: 'hit', index: this.i, time: t - st.since, cents: median(st.cents), clean: !st.wrong, wrong: st.wrong, t: t };
      } else {
        st.run = 0;
        if (st.specRun >= 2 && armed && t - st.since > 0.08) {
          ev = { type: 'hit', index: this.i, time: t - st.since, cents: null, clean: !st.wrong, wrong: st.wrong, t: t, ringing: true };
        } else if (frame.clarity >= 0.9 && st.onset && !(st.prevMidi !== null && noteMatches(frame.midi, st.prevMidi))) {
          /* Still sounding or re-plucking the previous note is not a mistake, the chart just waits.
             A wrong note must also show in the spectrum as the note that just started. */
          var key = Math.round(frame.midi);
          if (key === st.wrongKey) st.wrongRun++; else { st.wrongKey = key; st.wrongRun = 1; }
          if (st.wrongRun >= 4 && !st.wrong && st.cand >= 0 && samePc(st.cand, key) && st.sup < 0.6) {
            st.wrong = M.midiName(key); ev = { type: 'wrong', index: this.i, heard: st.wrong, t: t };
          }
        } else st.wrongRun = 0;
      }
    } else if (frame.chroma) {
      var sc = chordScore(frame.chroma, cur), side = thirdSide(frame.semi, cur);
      st.lastScore = sc.s;
      if (chordOk(sc, side)) {
        /* three frames in a row: the blend of two chords during a change can look like a third chord for a moment */
        if (st.run === 0) st.okSince = t;
        st.run++; st.wrongRun = 0;
        if (st.run >= 3 && t - st.okSince >= 0.17 && armed) ev = { type: 'hit', index: this.i, time: t - st.since, score: sc.s, clean: !st.wrong, wrong: st.wrong, t: t };
      } else {
        st.run = 0;
        var wn = chordWrong(sc, side, cur);
        if (!wn && sc.s < 0.7) wn = otherChord(frame.chroma, cur, 0.88);
        if (wn && st.onset && wn !== st.prevName) {
          if (wn === st.wrongKey) st.wrongRun++; else { st.wrongKey = wn; st.wrongRun = 1; }
          if (st.wrongRun >= 4 && !st.wrong) { st.wrong = wn; ev = { type: 'wrong', index: this.i, heard: st.wrong, t: t }; }
        } else st.wrongRun = 0;
      }
    }
    if (ev && ev.type === 'hit') {
      this.results.push({ index: ev.index, hit: true, clean: ev.clean, time: ev.time, cents: ev.cents, wrong: ev.wrong, t: t, loop: this.loops });
      this._advance(t);
    }
    return ev;
  };

  /* ---------- tempo mode: the chart moves, you keep up ---------- */
  /* targets need .start and .end in seconds. Detections are shifted back to when the sound began. */
  function TempoTracker(targets, opts) {
    this.targets = targets;
    this.opts = opts || {};
    /* A note is confirmed about 70 ms after it starts; a chord about 100 ms plus one chroma frame. */
    this.lagNote = this.opts.lagNote === undefined ? 0.07 : this.opts.lagNote;
    this.lagChord = this.opts.lagChord === undefined ? 0.12 : this.opts.lagChord;
    this.gate = new Gate();
    this.snaps = new Snaps();
    this.onsetT = -1;
    this.state = targets.map(function () {
      return { run: 0, first: null, frames: 0, match: 0, wrong: {}, spec: 0, onsetAt: null, okSince: 0 };
    });
    this.results = [];
    this.next = 0;
    this.done = targets.length === 0;
  }
  TempoTracker.prototype.push = function (frame, t) {
    var out = [];
    if (this.done) return out;
    var g = this.gate.push(frame.rms, t, frame.hf);
    var T = this.targets, i;
    if (g.onset) this.onsetT = t;
    var before = frame.semi ? this.snaps.before(t - LOOKBACK) : null;
    if (frame.semi) this.snaps.push(frame.semi, t);
    var latest = this.snaps.latest(t);
    /* where the sound began: the onset if one was just heard, else the detection time minus its lag */
    var onT = this.onsetT - 0.02, sinceOn = t - this.onsetT;
    for (i = this.next; i < T.length; i++) {
      var tg = T[i], st = this.state[i];
      var lag = tg.kind === 'note' ? this.lagNote : this.lagChord;
      var te = t - lag;
      var dur = tg.end - tg.start;
      var early = Math.min(0.12, dur * 0.3);
      if (te < tg.start - early) break;
      if (tg.kind === 'note') {
        /* a ringing note is confirmed from the spectrum a little after its window */
        if (te >= tg.end + 0.2) continue;
        var inSlot = onT >= tg.start - early && onT < tg.end;
        /* the note has to begin inside its slot: a string still ringing from before does not count,
           so a match only counts when it starts after an onset heard in this slot */
        if (g.onset && inSlot) { st.onsetAt = onT; st.run = 0; }
        if (!g.voiced) { st.run = 0; st.spec = 0; continue; }
        if (frame.semi && st.first === null) {
          var sup = noteSupport(before, frame.semi, tg.midis[0]);
          if (sup >= 0.6) { st.spec++; if (st.spec >= 2) st.first = st.onsetAt !== null ? st.onsetAt : Math.max(tg.start - early, t - 0.22); }
          else if (sup < 0.45) st.spec = 0;
        }
        if (te < tg.end) {
          st.frames++;
          if (yinHit(frame, tg.midis[0], latest)) {
            st.run++; st.match++;
            if (st.first === null && (st.run >= 2 || (dur < 0.25 && frame.clarity >= 0.9))) {
              if (st.onsetAt !== null) st.first = st.onsetAt;
              else if (tg.legato) st.first = te - (st.run - 1) * (this.opts.frameDt || 0.04);
            }
          } else {
            st.run = 0;
            if (frame.clarity >= 0.9 && te >= tg.start) { var k = M.midiName(Math.round(frame.midi)); st.wrong[k] = (st.wrong[k] || 0) + 1; }
          }
        }
      } else {
        if (te >= tg.end) continue;
        if (!g.voiced) { st.run = 0; continue; }
        if (frame.chroma) {
          st.frames++;
          var sc = chordScore(frame.chroma, tg), side = thirdSide(frame.semi, tg);
          if (chordOk(sc, side)) {
            if (st.run === 0) st.okSince = te;
            st.run++; st.match++;
            /* held for a moment: the blend of two chords during a change can look like a third chord */
            if (st.first === null && st.run >= 3 && te - st.okSince >= 0.17) st.first = st.okSince;
          } else {
            st.run = 0;
            var wn = chordWrong(sc, side, tg);
            if (!wn && sc.s < 0.7) wn = otherChord(frame.chroma, tg, 0.86);
            if (wn && te >= tg.start + dur * 0.25) st.wrong[wn] = (st.wrong[wn] || 0) + 1;
          }
        }
      }
    }
    /* finalize targets whose window has passed */
    while (this.next < T.length) {
      var tn = T[this.next], sn = this.state[this.next];
      var lagN = tn.kind === 'note' ? this.lagNote : this.lagChord;
      if (t - lagN < tn.end + (tn.kind === 'note' ? 0.25 : 0.05)) break;
      var durN = tn.end - tn.start;
      var hit = sn.first !== null;
      var offset = hit ? sn.first - tn.start : null;
      var grade = 'miss';
      if (hit) {
        var okWin = tn.kind === 'note' ? Math.max(0.13, Math.min(0.25, durN * 0.3)) : Math.max(0.3, durN * 0.3);
        grade = offset < (tn.kind === 'note' ? -0.07 : -0.13) ? 'early' : (offset <= okWin ? 'on' : 'late');
      }
      var wrongName = null, wc = 0;
      Object.keys(sn.wrong).forEach(function (k2) { if (sn.wrong[k2] > wc) { wc = sn.wrong[k2]; wrongName = k2; } });
      var res = { index: this.next, hit: hit, grade: grade, offset: offset, silent: sn.frames === 0, wrong: !hit && wc >= 2 ? wrongName : null };
      this.results.push(res);
      out.push(res);
      this.next++;
    }
    if (this.next >= T.length) this.done = true;
    return out;
  };

  /* ---------- take analysis ---------- */
  /* Slides over a whole recording and collects frames, a slice at a time so a page can show progress. */
  function FrameStream(pcm, sr, opts, analyzer) {
    opts = opts || {};
    this.pcm = pcm; this.sr = sr; this.opts = opts;
    this.an = analyzer || createAnalyzer(sr, opts);
    this.hop = Math.max(1, Math.round(sr * (opts.hop || 0.0232)));
    this.buf = new Float32Array(this.an.needed);
    this.frames = [];
    this.end = opts.end || pcm.length;
    this.pos = (opts.start || 0) + this.hop;
    this.n = 0;
    this.total = Math.max(1, Math.floor((this.end - (opts.start || 0)) / this.hop));
  }
  FrameStream.prototype.step = function (maxFrames) {
    var need = this.an.needed, buf = this.buf, pcm = this.pcm, opts = this.opts;
    var chromaEvery = opts.chromaEvery || 2, count = 0;
    for (; this.pos <= this.end && count < maxFrames; this.pos += this.hop, this.n++, count++) {
      var from = this.pos - need;
      if (from < 0) { buf.fill(0, 0, -from); buf.set(pcm.subarray(0, this.pos), -from); }
      else buf.set(pcm.subarray(from, this.pos));
      var wantChroma = opts.chroma !== false && (this.n % chromaEvery === 0);
      var f = this.an.analyze(buf, need, opts.pitch !== false, wantChroma);
      this.frames.push({
        t: this.pos / this.sr, rms: f.rms, hf: f.hf, midi: f.midi, clarity: f.clarity, freq: f.freq,
        chroma: wantChroma && f.chromaEnergy > 0 ? Float32Array.from(f.chroma) : null,
        semi: wantChroma && f.chromaEnergy > 0 ? Float32Array.from(f.semi) : null
      });
    }
    return this.pos > this.end;
  };
  function extractFrames(pcm, sr, opts, analyzer) {
    var st = new FrameStream(pcm, sr, opts, analyzer);
    while (!st.step(100000)) { /* keep going */ }
    return st.frames;
  }

  /* Noise gate for a whole take. */
  function takeGate(frames) {
    var r = frames.map(function (f) { return f.rms; });
    var floor = percentile(r, 0.1), top = percentile(r, 0.95);
    return Math.max(0.0015, Math.min(floor * 2.2, top * 0.18), top * 0.03);
  }

  /* Turn a recording into note events. The period detector gives clean stretches of one pitch (and how
     far off they are in cents). The spectrum gives the moments a note starts, also over ringing strings.
     The two are merged so that one played note is one event. */
  function noteEvents(frames, gate) {
    var yin = [], cur = null, i;
    function close() {
      if (cur && cur.n >= 3) {
        /* keep it only if the spectrum shows a partial of that note: blends of strings give phantom pitches */
        var ok = cur.checked === 0 || cur.present / cur.checked >= 0.5;
        if (ok) { cur.cents = median(cur.dev) * 100; delete cur.dev; yin.push(cur); }
      }
      cur = null;
    }
    var og = new Gate();
    for (i = 0; i < frames.length; i++) {
      var f = frames[i];
      var loud = og.push(f.rms, f.t, f.hf).loud;
      var voiced = f.rms > gate && f.clarity >= 0.82 && f.midi === f.midi;
      /* a stretch survives short dropouts (ringing strings blur the reading), but a fresh attack ends it */
      if (cur && loud && (cur.gap > 0 || cur.n >= 4)) close();
      if (!voiced) { if (cur) { cur.gap++; if (cur.gap > 8) close(); } continue; }
      var key = Math.round(f.midi);
      if (cur && key === cur.midi) {
        cur.n++; cur.gap = 0; cur.t1 = f.t; cur.dev.push(f.midi - key);
      } else {
        close();
        cur = { midi: key, t0: f.t, t1: f.t, n: 1, gap: 0, dev: [f.midi - key], present: 0, checked: 0, starts: 0 };
      }
      if (f.semi) { cur.checked++; if (present(f.semi, key)) cur.present++; }
    }
    close();
    /* note starts read from the spectrum */
    var spec = [], snaps = new Snaps(), run = null;
    for (i = 0; i < frames.length; i++) {
      var fr = frames[i];
      if (!fr.semi) continue;
      var c = fr.rms > gate ? freshNote(snaps.before(fr.t - LOOKBACK), fr.semi) : -1;
      snaps.push(fr.semi, fr.t);
      if (c >= 0 && run && run.midi === c) { run.n++; run.t1 = fr.t; }
      else {
        if (run && run.n >= 2) keep(run);
        run = c >= 0 ? { midi: c, t0: fr.t, t1: fr.t, n: 1 } : null;
      }
    }
    if (run && run.n >= 2) keep(run);
    /* A note reads as "just started" for close to half a second. Two runs of one pitch inside that time
       are one note, not two. */
    function keep(r) {
      for (var q = spec.length - 1; q >= 0 && r.t0 - spec[q].t0 < 0.45; q--) {
        if (spec[q].midi === r.midi) { spec[q].t1 = r.t1; spec[q].n += r.n; return; }
      }
      spec.push(r);
    }
    var events = yin.slice();
    spec.forEach(function (sp) {
      /* the same note as a stretch the period detector found? same note name, around the same time.
         A stretch can begin well after the start, once the other strings have died away. */
      var host = null;
      for (var k = 0; k < yin.length; k++) {
        var y = yin[k];
        if (samePc(y.midi, sp.midi) && sp.t0 >= y.t0 - 0.6 && sp.t0 <= y.t1 + 0.1) { host = y; break; }
      }
      var start = Math.max(0, sp.t0 - 0.15);
      if (host) {
        host.starts++;
        if (host.starts === 1) { if (start < host.t0) host.t0 = start; host.firstStart = sp.t0; }
        /* a second start inside one stretch is the same string struck again */
        else if (sp.t0 - host.firstStart > 0.2 && start > host.t0 + 0.2) events.push({ midi: host.midi, t0: start, t1: sp.t1, n: sp.n, spectral: true, cents: host.cents });
      } else events.push({ midi: sp.midi, t0: start, t1: sp.t1, n: sp.n, spectral: true, cents: null });
    });
    events.sort(function (a, b2) { return a.t0 - b2.t0; });
    return events;
  }

  /* Label chroma frames with the best chord, then merge into segments. chordList holds the chart's chords;
     near chords that are not in the chart are labelled too, so a wrong chord is reported as what it was. */
  function chordSegments(frames, gate, chordList) {
    var extra = [], seen = {};
    chordList.forEach(function (c) { seen[c.pcsKey] = 1; });
    chordList.forEach(function (c) {
      if (c.root === undefined || c.root === null || !(c.third === 3 || c.third === 4)) return;
      nearChords(c.root, c.third === 3).forEach(function (gch) { if (!seen[gch.pcsKey]) { seen[gch.pcsKey] = 1; extra.push(gch); } });
    });
    var labels = [], times = [], scores = [], i, j;
    for (i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (!f.chroma) continue;
      var lab = -1, best = 0;
      if (f.rms > gate * 0.6) {
        var own = -1, ownS = 0, oth = -1, othS = 0, s;
        for (j = 0; j < chordList.length; j++) { s = cosine(f.chroma, chordList[j].tmpl); if (s > ownS) { ownS = s; own = j; } }
        for (j = 0; j < extra.length; j++) {
          if (own >= 0 && related(extra[j].pcsKey, chordList[own].pcsKey)) continue;
          s = cosine(f.chroma, extra[j].tmpl); if (s > othS) { othS = s; oth = j; }
        }
        if (ownS >= CHORD_ABS && ownS >= othS - CHORD_MARGIN) {
          lab = own; best = ownS;
          if (thirdSide(f.semi, chordList[own]) < 0) {
            /* it is the other third: label it as the parallel chord if we know one, else leave it unlabelled */
            lab = -1;
            var par = chordList[own].parallel, pk;
            for (pk = 0; pk < chordList.length; pk++) if (chordList[pk].name === par) lab = pk;
            for (pk = 0; pk < extra.length && lab < 0; pk++) if (extra[pk].name === par) lab = chordList.length + pk;
          }
        }
        else if (othS >= 0.84 && othS >= ownS + 0.04) { lab = chordList.length + oth; best = othS; }
      }
      labels.push(lab); times.push(f.t); scores.push(best);
    }
    /* mode filter, width 3 */
    var sm = labels.slice();
    for (i = 1; i < labels.length - 1; i++) {
      if (labels[i - 1] === labels[i + 1] && labels[i] !== labels[i - 1]) sm[i] = labels[i - 1];
    }
    var segs = [], cur = null;
    for (i = 0; i < sm.length; i++) {
      if (cur && sm[i] === cur.lab) { cur.t1 = times[i]; cur.n++; cur.score += scores[i]; }
      else {
        if (cur) segs.push(cur);
        cur = { lab: sm[i], t0: times[i], t1: times[i], n: 1, score: scores[i] };
      }
    }
    if (cur) segs.push(cur);
    var dt = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : 0.05;
    var out = [];
    segs.forEach(function (sg) {
      if (sg.lab < 0 || sg.n < 3) return;
      var def = sg.lab < chordList.length ? chordList[sg.lab] : extra[sg.lab - chordList.length];
      var last = out[out.length - 1];
      var o = { name: def.name, key: def.pcsKey, t0: sg.t0, t1: sg.t1 + dt, score: sg.score / sg.n };
      if (last && last.key === o.key && o.t0 - last.t1 < 0.5) { last.t1 = o.t1; last.score = (last.score + o.score) / 2; }
      else out.push(o);
    });
    return out;
  }

  /* Align expected items with heard items. Expected items after the last one played are free.
     With freeStart, expected items before the first one played are free too.
     Returns, per expected index: the matched heard index, -1 for a miss, -2 for outside the played range. */
  function align(nExp, nHeard, cost, freeStart) {
    /* A wrong note in the right place costs less than an added or a dropped one. Otherwise a wholly wrong
       performance is scored by cherry-picking the notes that happen to coincide. */
    var INS = 1, DEL = 1;
    var W = nHeard + 1;
    var D = new Float32Array((nExp + 1) * W);
    var B = new Uint8Array((nExp + 1) * W);
    var i, j;
    for (j = 1; j <= nHeard; j++) { D[j] = j * INS; B[j] = 2; }
    for (i = 1; i <= nExp; i++) { D[i * W] = freeStart ? 0 : i * DEL; B[i * W] = freeStart ? 4 : 3; }
    for (i = 1; i <= nExp; i++) {
      for (j = 1; j <= nHeard; j++) {
        var c = cost(i - 1, j - 1);
        var a = D[(i - 1) * W + (j - 1)] + c;
        var b = D[i * W + (j - 1)] + INS;
        var d2 = D[(i - 1) * W + j] + DEL;
        var m = a, k = 1;
        if (b < m) { m = b; k = 2; }
        if (d2 < m) { m = d2; k = 3; }
        D[i * W + j] = m; B[i * W + j] = k;
      }
    }
    var bi = 0, bv = Infinity;
    for (i = 0; i <= nExp; i++) { var v = D[i * W + nHeard]; if (v < bv - 1e-6) { bv = v; bi = i; } }
    var map = new Int32Array(nExp).fill(-2);
    var sub = new Uint8Array(nExp);
    i = bi; j = nHeard;
    while (i > 0) {
      var kk = B[i * W + j];
      if (j === 0 && kk === 4) break;
      if (kk === 1) { var cc = cost(i - 1, j - 1); map[i - 1] = j - 1; sub[i - 1] = cc >= 0.5 ? 1 : 0; i--; j--; }
      else if (kk === 2) j--;
      else { map[i - 1] = -1; i--; }
    }
    return { map: map, sub: sub, cost: bv, lastExp: bi };
  }

  /* Score a recorded take against a list of targets. Returns a report. */
  function scoreTake(frames, targets, opts) {
    opts = opts || {};
    if (!frames.length || !targets.length) return { ok: false, reason: 'empty' };
    var gate = takeGate(frames);
    var loud = percentile(frames.map(function (f) { return f.rms; }), 0.95);
    if (!(loud > 0.0012)) return { ok: false, reason: 'silent', level: loud };
    var hasNotes = targets.some(function (t) { return t.kind === 'note'; });
    var hasChords = targets.some(function (t) { return t.kind === 'chord'; });
    var chordList = hasChords ? prepareTargets(targets, opts.a4) : [];
    /* Build the list of expected items. Repeated identical chords collapse into one item. */
    var exp = [];
    targets.forEach(function (t) {
      var last = exp[exp.length - 1];
      if (t.kind === 'chord' && last && last.kind === 'chord' && last.key === t.pcsKey) { last.members.push(t.index); last.beats += t.beats || 0; }
      else exp.push({ kind: t.kind, key: t.kind === 'chord' ? t.pcsKey : null, midi: t.kind === 'note' ? t.midis[0] : null, label: t.label, members: [t.index], beats: t.beats || 0 });
    });
    /* Heard items, in time order, from both detectors. */
    var heard = [];
    if (hasNotes) noteEvents(frames, gate).forEach(function (e) { heard.push({ kind: 'note', midi: e.midi, t0: e.t0, t1: e.t1, cents: e.cents, label: M.midiName(e.midi) }); });
    if (hasChords) chordSegments(frames, gate, chordList).forEach(function (s) { heard.push({ kind: 'chord', key: s.key, t0: s.t0, t1: s.t1, label: s.name, score: s.score }); });
    heard.sort(function (a, b) { return a.t0 - b.t0; });
    if (hasNotes && hasChords) {
      /* single notes found inside a chord segment are that chord's own strings: drop them */
      var chordsOnly = heard.filter(function (h) { return h.kind === 'chord'; });
      heard = heard.filter(function (h) {
        if (h.kind !== 'note') return true;
        return !chordsOnly.some(function (c) { return h.t0 >= c.t0 - 0.05 && h.t1 <= c.t1 + 0.05; });
      });
    }
    if (!heard.length) return { ok: false, reason: 'nomatch', heard: [], level: loud };
    /* Loop the expected list when the player went round more than once. */
    var loops = 1;
    if (opts.loop && exp.length) loops = Math.min(12, Math.max(1, Math.ceil(heard.length / exp.length) + 1));
    var expAll = [];
    for (var L = 0; L < loops; L++) exp.forEach(function (e) { expAll.push(e); });
    function cost(i, j) {
      var e = expAll[i], h = heard[j];
      if (e.kind !== h.kind) return 0.9;
      if (e.kind === 'note') { var dlt = Math.abs(h.midi - e.midi); return dlt === 0 ? 0 : (dlt === 12 ? 0.2 : 0.6); }
      return e.key === h.key ? 0 : 0.6;
    }
    function build(al) {
      var items = [], first = -1, lastPlayed = -1, i;
      for (i = 0; i < expAll.length; i++) { if (al.map[i] === -2) continue; if (first < 0) first = i; lastPlayed = i; }
      if (first < 0) return null;
      var hits = 0, wrong = 0, missed = 0, cents = [], used = {}, firstH = Infinity, lastH = -1;
      for (i = first; i <= lastPlayed; i++) {
        var e2 = expAll[i], mp = al.map[i], it = { label: e2.label, kind: e2.kind, members: e2.members, loop: Math.floor(i / exp.length), beats: e2.beats };
        if (mp >= 0) { used[mp] = 1; if (mp < firstH) firstH = mp; if (mp > lastH) lastH = mp; }
        if (mp >= 0 && !al.sub[i]) {
          it.status = 'hit'; it.t0 = heard[mp].t0; it.t1 = heard[mp].t1;
          if (heard[mp].cents !== undefined && heard[mp].cents !== null) { it.cents = heard[mp].cents; cents.push(Math.abs(it.cents)); }
          hits++;
        } else if (mp >= 0) { it.status = 'wrong'; it.heard = heard[mp].label; it.t0 = heard[mp].t0; it.t1 = heard[mp].t1; wrong++; }
        else { it.status = 'missed'; missed++; }
        items.push(it);
      }
      var inner = 0, outer = 0, extraLabels = [];
      heard.forEach(function (h, j) {
        if (used[j]) return;
        if (j > firstH && j < lastH) { inner++; if (extraLabels.length < 6) extraLabels.push(h.label); } else outer++;
      });
      var denom = hits + wrong + missed + inner;
      return { cost: al.cost, items: items, first: first, lastPlayed: lastPlayed, hits: hits, wrong: wrong, missed: missed, extras: inner, strays: outer, extraLabels: extraLabels, cents: cents, err: denom ? (wrong + missed + inner) / denom : 1, denom: denom };
    }
    var A = build(align(expAll.length, heard.length, cost, false));
    var B = build(align(expAll.length, heard.length, cost, true));
    /* Believe "started part-way through the chart" only when it gives a convincing match. */
    var R = A;
    if (B && (!A || (B.first > 0 && B.hits >= 3 && B.err <= 0.25 && B.cost < A.cost - 0.5))) R = B;
    if (!R || !R.hits) return { ok: false, reason: 'nomatch', heard: heard.slice(0, 12).map(function (h) { return h.label; }), level: loud };
    /* timing: seconds per beat for chord items, and for each change how long nothing was sounding.
       "Sounding" is read from the level, not from the chord label: a chord that is left to ring fades
       and loses its label well before it stops. */
    var items = R.items, perBeat = [], changes = [], i2;
    function frameAt(t) { var lo = 0, hi = frames.length - 1; while (lo < hi) { var mid = (lo + hi) >> 1; if (frames[mid].t < t) lo = mid + 1; else hi = mid; } return lo; }
    function quietBefore(a, b) {
      var i0 = frameAt(a.t0 + 0.2), i1 = frameAt(b.t0), iA = frameAt(a.t1), lv = [], k, kmin = -1, mn = Infinity;
      if (i1 <= i0) return 0;
      for (k = frameAt(a.t0); k <= Math.max(iA, i0); k++) lv.push(frames[k].rms);
      var ref = median(lv) * 0.3;
      for (k = i0; k <= i1; k++) if (frames[k].rms < mn) { mn = frames[k].rms; kmin = k; }
      if (kmin < 0 || mn >= ref) return 0;
      var lo = kmin, hi = kmin;
      while (lo > i0 && frames[lo - 1].rms < ref) lo--;
      while (hi < i1 && frames[hi + 1].rms < ref) hi++;
      return Math.max(0, frames[hi].t - frames[lo].t);
    }
    for (i2 = 0; i2 + 1 < items.length; i2++) {
      var a = items[i2], b = items[i2 + 1];
      if (a.status === 'hit' && b.status === 'hit') {
        var span = b.t0 - a.t0;
        if (a.kind === 'chord' && a.beats > 0 && span > 0.15) perBeat.push(span / a.beats);
        changes.push({ from: a.label, to: b.label, gap: a.kind === 'chord' ? quietBefore(a, b) : Math.max(0, b.t0 - a.t1), span: span });
      }
    }
    var spb = perBeat.length >= 2 ? median(perBeat) : NaN;
    var steadiness = NaN;
    if (perBeat.length >= 3) {
      var dev = perBeat.map(function (v) { return Math.abs(v - spb) / spb; });
      steadiness = Math.max(0, 1 - median(dev) * 2);
    }
    return {
      ok: true, total: items.length, hits: R.hits, wrong: R.wrong, missed: R.missed, extras: R.extras, strays: R.strays, extraLabels: R.extraLabels,
      accuracy: R.denom ? R.hits / R.denom : 0,
      coverage: { first: R.first % exp.length, played: items.length, of: exp.length, loops: Math.floor(R.lastPlayed / exp.length) + 1 },
      bpm: spb === spb ? 60 / spb : null, steadiness: steadiness === steadiness ? steadiness : null,
      cents: R.cents.length ? median(R.cents) : null,
      changes: changes, items: items, level: loud, duration: frames[frames.length - 1].t, heardCount: heard.length
    };
  }

  /* Pitch of a short clip, for checking one string. */
  function clipPitch(frames) {
    var gate = takeGate(frames);
    var good = frames.filter(function (f) { return f.rms > gate && f.clarity >= 0.9 && f.midi === f.midi; });
    if (good.length < 4) return null;
    var counts = {};
    good.forEach(function (f) { var k = Math.round(f.midi); counts[k] = (counts[k] || 0) + 1; });
    var bestK = null, bc = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bc) { bc = counts[k]; bestK = +k; } });
    /* skip the pluck itself, where the string runs sharp */
    var vals = good.filter(function (f) { return Math.round(f.midi) === bestK; }).map(function (f) { return f.midi; });
    if (vals.length > 8) vals = vals.slice(Math.floor(vals.length * 0.2));
    var m = median(vals);
    return { midi: m, note: bestK, cents: (m - bestK) * 100, frames: vals.length, freq: M.midiToFreq(m) };
  }

  PR.dsp = { createAnalyzer: createAnalyzer, makeFFT: makeFFT, cosine: cosine, median: median, percentile: percentile, templateFromMidi: templateFromMidi, nameChord: nameChord, HARM: HARM };
  PR.track = { WaitTracker: WaitTracker, TempoTracker: TempoTracker, Gate: Gate, Snaps: Snaps, freshNote: freshNote, noteSupport: noteSupport, present: present,
    prepareTargets: prepareTargets, noteMatches: noteMatches, centsOff: centsOff, chordScore: chordScore, chordOk: chordOk, chordWrong: chordWrong, thirdSide: thirdSide, LOOKBACK: LOOKBACK };
  PR.take = { FrameStream: FrameStream, extractFrames: extractFrames, scoreTake: scoreTake, noteEvents: noteEvents, chordSegments: chordSegments, takeGate: takeGate, clipPitch: clipPitch, align: align };
  if (typeof module !== 'undefined' && module.exports) module.exports = PR;
})(typeof window !== 'undefined' ? window : globalThis);

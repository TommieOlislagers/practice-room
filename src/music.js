/* music.js: notes, chords, shapes, tab and chord-sheet parsing, difficulty. No DOM, no audio. */
(function (root) {
  'use strict';
  var PR = root.PR || (root.PR = {});

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function mod12(n) { return ((n % 12) + 12) % 12; }

  function pcOf(name) {
    var m = /^([A-Ga-g])([#b♯♭]*)$/.exec(String(name).trim());
    if (!m) return null;
    var pc = LETTER[m[1].toUpperCase()];
    for (var i = 0; i < m[2].length; i++) pc += (m[2][i] === '#' || m[2][i] === '♯') ? 1 : -1;
    return mod12(pc);
  }
  function pcName(pc, flats) { return (flats ? FLAT : SHARP)[mod12(pc)]; }
  function midiName(m, flats) {
    var r = Math.round(m);
    return pcName(r, flats) + (Math.floor(r / 12) - 1);
  }
  function midiToFreq(m, a4) { return (a4 || 440) * Math.pow(2, (m - 69) / 12); }
  function freqToMidi(f, a4) { return 69 + 12 * Math.log(f / (a4 || 440)) / Math.LN2; }

  /* Strings are listed low to high, as MIDI numbers. */
  var TUNINGS = {
    standard: { name: 'Standard', midi: [40, 45, 50, 55, 59, 64] },
    dropd: { name: 'Drop D', midi: [38, 45, 50, 55, 59, 64] },
    eb: { name: 'Half step down', midi: [39, 44, 49, 54, 58, 63] },
    dstd: { name: 'Whole step down', midi: [38, 43, 48, 53, 57, 62] },
    dadgad: { name: 'DADGAD', midi: [38, 45, 50, 55, 57, 62] },
    openg: { name: 'Open G', midi: [38, 43, 50, 55, 59, 62] },
    opend: { name: 'Open D', midi: [38, 45, 50, 54, 57, 62] }
  };
  function tuningMidi(t) {
    if (Array.isArray(t) && t.length === 6) return t.slice();
    if (t && TUNINGS[t]) return TUNINGS[t].midi.slice();
    return TUNINGS.standard.midi.slice();
  }
  function tuningName(t) {
    if (Array.isArray(t)) return t.map(function (m) { return pcName(m); }).join(' ');
    return (TUNINGS[t] || TUNINGS.standard).name;
  }

  /* ---------- chord symbols ---------- */
  /* Order matters: longest and most specific first. Each entry: [alternatives, intervals, canonical suffix]. */
  var QUALS = [
    [['maj13', 'M13'], [0, 4, 7, 11, 2, 9], 'maj13'],
    [['maj9', 'M9', 'ma9'], [0, 4, 7, 11, 2], 'maj9'],
    [['maj7', 'M7', 'ma7', 'Maj7', 'major7', 'j7', 'Δ7', 'Δ'], [0, 4, 7, 11], 'maj7'],
    [['mmaj7', 'mM7', 'minmaj7', 'm(maj7)', 'mMaj7'], [0, 3, 7, 11], 'mMaj7'],
    [['m7b5', 'min7b5', 'm7(b5)', 'ø', 'ø7'], [0, 3, 6, 10], 'm7b5'],
    [['dim7', '°7'], [0, 3, 6, 9], 'dim7'],
    [['dim', '°'], [0, 3, 6], 'dim'],
    [['aug7', '+7', '7#5', '7+5', '7+'], [0, 4, 8, 10], '7#5'],
    [['aug', '+'], [0, 4, 8], 'aug'],
    [['m13', 'min13'], [0, 3, 7, 10, 2, 9], 'm13'],
    [['m11', 'min11'], [0, 3, 7, 10, 2, 5], 'm11'],
    [['m9', 'min9', '-9'], [0, 3, 7, 10, 2], 'm9'],
    [['m7', 'min7', 'mi7', '-7'], [0, 3, 7, 10], 'm7'],
    [['m6/9', 'm69'], [0, 3, 7, 9, 2], 'm6/9'],
    [['m6', 'min6'], [0, 3, 7, 9], 'm6'],
    [['madd9', 'm(add9)', 'madd2', 'm(add2)'], [0, 3, 7, 2], 'madd9'],
    [['msus4', 'msus'], [0, 5, 7], 'sus4'],
    [['m', 'min', 'mi', '-'], [0, 3, 7], 'm'],
    [['7sus4', '7sus'], [0, 5, 7, 10], '7sus4'],
    [['7sus2'], [0, 2, 7, 10], '7sus2'],
    [['7#9', '7(#9)'], [0, 4, 7, 10, 3], '7#9'],
    [['7b9', '7(b9)'], [0, 4, 7, 10, 1], '7b9'],
    [['7b5', '7(b5)'], [0, 4, 6, 10], '7b5'],
    [['13'], [0, 4, 7, 10, 2, 9], '13'],
    [['11'], [0, 7, 10, 2, 5], '11'],
    [['9sus4', '9sus'], [0, 5, 7, 10, 2], '9sus4'],
    [['9'], [0, 4, 7, 10, 2], '9'],
    [['7'], [0, 4, 7, 10], '7'],
    [['6/9', '69', '6add9'], [0, 4, 7, 9, 2], '6/9'],
    [['6'], [0, 4, 7, 9], '6'],
    [['sus2', '2'], [0, 2, 7], 'sus2'],
    [['sus4', 'sus', '4'], [0, 5, 7], 'sus4'],
    [['add9', 'add2', '(add9)', '(add2)'], [0, 4, 7, 2], 'add9'],
    [['add11', 'add4', '(add4)', '(add11)'], [0, 4, 5, 7], 'add11'],
    [['5'], [0, 7], '5'],
    [['maj', 'M', 'major'], [0, 4, 7], ''],
    [[''], [0, 4, 7], '']
  ];
  var QUAL_LOOKUP = {};
  QUALS.forEach(function (q) { q[0].forEach(function (alt) { if (!(alt in QUAL_LOOKUP)) QUAL_LOOKUP[alt] = q; }); });

  var chordCache = {};
  function parseChord(sym) {
    if (typeof sym !== 'string') return null;
    var key = sym.trim();
    if (key in chordCache) return chordCache[key];
    var s = key.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
    var res = null;
    var m = /^([A-G])([#b]?)(.*)$/.exec(s);
    if (m) {
      var rest = m[3], bass = null;
      /* slash bass: last "/X" where X is a note name. "6/9" must stay intact. */
      var sm = /^(.*)\/([A-G][#b]?)$/.exec(rest);
      if (sm) { rest = sm[1]; bass = pcOf(sm[2]); }
      var q = QUAL_LOOKUP.hasOwnProperty(rest) ? QUAL_LOOKUP[rest] : null;
      if (!q && !/^M(\d|$)/.test(rest)) {
        var low = rest.toLowerCase();
        q = QUAL_LOOKUP.hasOwnProperty(low) ? QUAL_LOOKUP[low] : null;
      }
      if (q) {
        var rootPc = pcOf(m[1] + m[2]);
        var flats = m[2] === 'b';
        res = {
          symbol: key,
          root: rootPc,
          rootName: m[1] + m[2],
          bass: bass,
          quality: q[2],
          intervals: q[1].slice(),
          pcs: q[1].map(function (iv) { return mod12(rootPc + iv); }),
          minor: q[1].indexOf(3) >= 0 && q[1].indexOf(4) < 0,
          third: q[1].indexOf(4) >= 0 ? 4 : (q[1].indexOf(3) >= 0 && q[1].indexOf(6) < 0 ? 3 : null),
          flats: flats,
          canon: pcName(rootPc, false) + q[2]
        };
      }
    }
    chordCache[key] = res;
    return res;
  }

  /* ---------- chord shapes (frets low string to high string, "x" = not played) ---------- */
  var OPEN_SHAPES = {
    'C': 'x32010', 'D': 'xx0232', 'E': '022100', 'G': '320003', 'A': 'x02220',
    'Am': 'x02210', 'Em': '022000', 'Dm': 'xx0231',
    'F': '133211', 'Bm': 'x24432', 'F#m': '244222', 'B': 'x24442',
    'C7': 'x32310', 'D7': 'xx0212', 'E7': '020100', 'G7': '320001', 'A7': 'x02020', 'B7': 'x21202',
    'Cmaj7': 'x32000', 'Dmaj7': 'xx0222', 'Emaj7': '021100', 'Fmaj7': 'xx3210', 'Gmaj7': '320002', 'Amaj7': 'x02120',
    'Am7': 'x02010', 'Dm7': 'xx0211', 'Em7': '022030',
    'Asus2': 'x02200', 'Asus4': 'x02230', 'Dsus2': 'xx0230', 'Dsus4': 'xx0233', 'Esus4': '022200',
    'Cadd9': 'x32030', 'Gadd9': '320203', 'Eadd9': '022102',
    'E5': '022xxx', 'A5': 'x022xx', 'D5': 'xx023x',
    'A6': 'x02222', 'E6': '022120', 'D6': 'xx0202',
    'D9': 'x54555', 'E9': '020102'
  };
  var SLASH_SHAPES = {
    'G/B': 'x20003', 'D/F#': '200232', 'C/G': '332010', 'C/E': '032010', 'Am/G': '302210',
    'Am/E': '002210', 'D/A': 'x00232', 'G/D': 'xx0003', 'A/C#': 'x42220', 'F/C': 'x33211', 'Em/D': 'xx0000'
  };
  /* Movable forms: offsets from the root fret, low to high. null = not played. */
  var E_FORMS = {
    '': [0, 2, 2, 1, 0, 0], 'm': [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], 'm7': [0, 2, 0, 0, 0, 0],
    'maj7': [0, 2, 1, 1, 0, 0], 'sus4': [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, null, null, null], '7sus4': [0, 2, 0, 2, 0, 0],
    '6': [0, 2, 2, 1, 2, 0]
  };
  var A_FORMS = {
    '': [null, 0, 2, 2, 2, 0], 'm': [null, 0, 2, 2, 1, 0], '7': [null, 0, 2, 0, 2, 0], 'm7': [null, 0, 2, 0, 1, 0],
    'maj7': [null, 0, 2, 1, 2, 0], 'sus4': [null, 0, 2, 2, 3, 0], 'sus2': [null, 0, 2, 2, 0, 0], '5': [null, 0, 2, 2, null, null],
    '7sus4': [null, 0, 2, 0, 3, 0], 'add9': [null, 0, 2, 4, 2, 0], 'm9': [null, 0, -1, 0, 0, null], '9': [null, 0, -1, 0, 0, 0],
    'dim': [null, 0, 1, 2, 1, null], 'm7b5': [null, 0, 1, 0, 1, null], 'dim7': [null, 0, 1, -1, 1, null], 'aug': [null, 0, -1, -2, -2, null],
    'm6': [null, 0, 2, -1, 1, 0], 'mMaj7': [null, 0, 2, 1, 1, 0]
  };

  function parseShape(str) {
    if (Array.isArray(str)) return str.slice();
    if (typeof str !== 'string') return null;
    var s = str.trim(), parts;
    if (/[-\s,]/.test(s)) parts = s.split(/[-\s,]+/); else parts = s.split('');
    if (parts.length !== 6) return null;
    var out = [];
    for (var i = 0; i < 6; i++) {
      if (/^[xX]$/.test(parts[i])) out.push(null);
      else if (/^\d{1,2}$/.test(parts[i])) out.push(parseInt(parts[i], 10));
      else return null;
    }
    return out;
  }
  function shapeToString(frets) {
    var wide = frets.some(function (f) { return f !== null && f > 9; });
    return frets.map(function (f) { return f === null ? 'x' : String(f); }).join(wide ? '-' : '');
  }
  function movable(form, rootFret) {
    var out = form.map(function (o) { return o === null ? null : rootFret + o; });
    return out.some(function (f) { return f !== null && f < 0; }) ? null : out;
  }
  /* Returns an array of six frets (or null) for a chord, relative to the nut or capo. */
  function shapeFor(chord, songShapes) {
    if (!chord) return null;
    var sym = chord.symbol;
    if (songShapes) {
      var own = songShapes[sym] || songShapes[chord.canon];
      var parsed = own ? parseShape(own) : null;
      if (parsed) return parsed;
    }
    var canonFull = chord.canon + (chord.bass !== null ? '/' + pcName(chord.bass) : '');
    if (SLASH_SHAPES[canonFull]) return parseShape(SLASH_SHAPES[canonFull]);
    if (OPEN_SHAPES[chord.canon]) return parseShape(OPEN_SHAPES[chord.canon]);
    var q = chord.quality;
    var eFret = mod12(chord.root - 4), aFret = mod12(chord.root - 9);
    var cand = [];
    if (E_FORMS[q]) { var e = movable(E_FORMS[q], eFret === 0 ? 12 : eFret); if (e) cand.push({ s: e, pos: eFret === 0 ? 12 : eFret }); }
    if (A_FORMS[q]) { var a = movable(A_FORMS[q], aFret === 0 ? 12 : aFret); if (a) cand.push({ s: a, pos: aFret === 0 ? 12 : aFret }); }
    if (!cand.length) return null;
    cand.sort(function (x, y) { return x.pos - y.pos; });
    return cand[0].s;
  }
  function shapeInfo(frets) {
    if (!frets) return null;
    var played = frets.filter(function (f) { return f !== null; });
    var fretted = played.filter(function (f) { return f > 0; });
    var min = fretted.length ? Math.min.apply(null, fretted) : 0;
    var max = fretted.length ? Math.max.apply(null, fretted) : 0;
    var hasOpen = played.some(function (f) { return f === 0; });
    var atMin = frets.filter(function (f) { return f === min; }).length;
    /* A barre: no open strings, and the lowest fret is held on two or more strings, with at least four strings sounding. */
    var barre = !hasOpen && fretted.length >= 4 && atMin >= 2 && min >= 1;
    return { min: min, max: max, hasOpen: hasOpen, barre: barre, span: fretted.length ? max - min : 0, strings: played.length };
  }
  function shapeMidi(frets, tuning, capo) {
    var t = tuningMidi(tuning), out = [];
    for (var i = 0; i < 6; i++) if (frets[i] !== null) out.push(t[i] + (capo || 0) + frets[i]);
    return out;
  }
  /* A plausible voicing when no shape is known: root low, then chord tones upward. */
  function genericVoicing(chord, capo) {
    var base = 40 + mod12(chord.root + (capo || 0) - 4);
    if (base > 47) base -= 0;
    var out = [];
    if (chord.bass !== null) out.push(40 + mod12(chord.bass + (capo || 0) - 4));
    else out.push(base);
    var start = base + 7;
    chord.intervals.forEach(function (iv) {
      var n = base + 12 + mod12(iv);
      out.push(n);
    });
    out.push(start);
    out.push(base + 24);
    return out;
  }

  /* ---------- text parsing ---------- */
  var HEADER_WORDS = 'intro|verse|chorus|pre[- ]?chorus|post[- ]?chorus|bridge|solo|outro|interlude|instrumental|riff|hook|refrain|coda|break|breakdown|middle ?8|middle eight|ending|tag|link|turnaround|lead|fill|main riff|part|section|rap';
  var HEADER_RE = new RegExp('^\\s*[\\[(]?\\s*((?:' + HEADER_WORDS + ')\\b[^\\])\\n:]{0,28}?)\\s*[\\])]?\\s*:?\\s*$', 'i');
  var HEADER_INLINE_RE = new RegExp('^\\s*[\\[(]?\\s*((?:' + HEADER_WORDS + ')\\b[^\\])\\n:|]{0,28}?)\\s*[\\])]?\\s*:\\s*(\\S.*)$', 'i');
  var NEUTRAL_RE = /^(\||\|\||\|:|:\||\/|-|–|—|%|n\.?c\.?|\(?x\d+\)?|\(?\d+x\)?|\.\.\.|…|->|\*+|\(|\)|,)$/i;

  function cleanChordToken(tok) {
    return tok.replace(/^[(\[{,*|:]+/, '').replace(/[)\]},*|:.]+$/, '');
  }
  /* Is this line made of chord symbols? Returns {bars:[...], repeat:n} or null. */
  function readChordLine(line) {
    var raw = line.replace(/\t/g, '    ');
    if (!raw.trim()) return null;
    var tokens = raw.trim().split(/\s+/);
    var chords = 0, other = 0, repeat = 1;
    var hasBars = /\|/.test(raw);
    var bars = [], cur = [], lastChord = null;
    function closeBar() {
      if (!cur.length) return;
      if (cur.length === 1 && cur[0] === '%') bars.push(bars.length ? bars[bars.length - 1] : '%');
      else bars.push(cur.map(function (x) { return x === '%' ? (lastChord || '%') : x; }).filter(function (x) { return x !== '%'; }).join(' '));
      cur = [];
    }
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var rm = /^\(?x\s?(\d+)\)?$/i.exec(t) || /^\(?(\d+)\s?x\)?$/i.exec(t);
      if (rm) { repeat = Math.min(8, Math.max(1, parseInt(rm[1], 10))); continue; }
      /* tokens can carry bar lines: "|C" "G|" "|Am" */
      var pieces = hasBars ? t.split(/(\|+:?|:\|+)/).filter(function (p) { return p !== ''; }) : [t];
      for (var j = 0; j < pieces.length; j++) {
        var p = pieces[j];
        if (/^(\|+:?|:\|+)$/.test(p)) { closeBar(); continue; }
        var c = cleanChordToken(p);
        if (c === '' || NEUTRAL_RE.test(p) || NEUTRAL_RE.test(c)) {
          if (c === '%' && hasBars) cur.push('%');
          continue;
        }
        if (parseChord(c)) { chords++; cur.push(c); if (!hasBars) closeBar(); lastChord = c; }
        else other++;
      }
    }
    closeBar();
    bars = bars.filter(function (b) { return b !== ''; });
    if (!chords) return null;
    if (chords / (chords + other) < 0.75) return null;
    /* A single ambiguous word such as "A" or "Am" with other words is a lyric. */
    return { bars: bars, repeat: repeat };
  }

  var TAB_LINE_RE = /^\s*([A-Ga-g][#b]?)?\s*([|:]{0,2})\s*([-–—0-9hpbrsvtxXT\/\\~()<>*.=|:^\[\] ]{6,})$/;
  function readTabLine(line) {
    var m = TAB_LINE_RE.exec(line.replace(/\s+$/, ''));
    if (!m) return null;
    var body = m[3];
    var dashes = (body.match(/[-–—]/g) || []).length;
    if (dashes < 4 || dashes / body.length < 0.3) return null;
    if (!m[1] && !m[2] && !/^[-|]/.test(body.trim())) return null;
    var prefixLen = line.length - line.replace(/^\s*([A-Ga-g][#b]?)?\s*([|:]{0,2})\s*/, '').length;
    var out = line.slice(prefixLen).replace(/\s+$/, '').replace(/[–—]/g, '-');
    /* "|  x2" and similar notes after the last bar line are not frets */
    var lastBar = out.lastIndexOf('|');
    if (lastBar > 0 && out.slice(lastBar + 1).indexOf('-') < 0) out = out.slice(0, lastBar + 1);
    /* a space inside the body would shift columns: treat it as an empty position */
    out = out.replace(/ /g, '-');
    return { label: m[1] || null, body: out, prefix: prefixLen };
  }

  var HARMONIC_FRET = { 12: 12, 7: 19, 19: 19, 5: 24, 24: 24, 4: 28, 9: 28, 16: 28, 3: 31 };

  /* Parse one six-line system. lines: top (high string) to bottom (low string), as {label, body}. */
  function parseSystem(lines, defaultTuning, capo) {
    var labels = lines.map(function (l) { return l.label; });
    var inverted = false;
    if (labels[0] && labels[5] && labels[0] === 'E' && labels[5] === 'e') inverted = true;
    var std = TUNINGS.standard.midi;
    var ordered = inverted ? lines.slice().reverse() : lines.slice();
    var tune = tuningMidi(defaultTuning);
    var allLabeled = ordered.every(function (l) { return !!l.label; });
    var labelTuning = null;
    if (allLabeled) {
      labelTuning = [];
      for (var i = 0; i < 6; i++) {
        var stringIdx = 5 - i;
        var pc = pcOf(ordered[i].label);
        var base = std[stringIdx], best = null;
        for (var d = -5; d <= 4; d++) if (mod12(base + d) === pc) { if (best === null || Math.abs(d) < Math.abs(best)) best = d; }
        labelTuning[stringIdx] = best === null ? base : base + best;
      }
      var same = labelTuning.every(function (v, k) { return v === std[k]; });
      if (!same) tune = labelTuning; else labelTuning = null;
    }
    var width = 0;
    ordered.forEach(function (l) { if (l.body.length > width) width = l.body.length; });
    var bodies = ordered.map(function (l) { var b = l.body; while (b.length < width) b += '-'; return b; });
    var tokens = [];
    for (var li = 0; li < 6; li++) {
      var b = bodies[li], col = 0;
      while (col < b.length) {
        var ch = b[col];
        if (ch >= '0' && ch <= '9') {
          var len = 1, val = parseInt(ch, 10);
          if (col + 1 < b.length && b[col + 1] >= '0' && b[col + 1] <= '9') {
            var two = parseInt(b.substr(col, 2), 10);
            if (two <= 24) { val = two; len = 2; }
          }
          var prev = col > 0 ? b[col - 1] : '-';
          var harmonic = prev === '<' || (prev === '[' && b[col + len] === ']');
          var isBendTarget = (prev === 'b' || prev === 'r' || prev === '^') && col >= 2 && /[0-9)]/.test(b[col - 2]);
          if (!isBendTarget) {
            var fretForPitch = harmonic && HARMONIC_FRET[val] !== undefined ? HARMONIC_FRET[val] : val;
            tokens.push({
              line: li, s: 5 - li, col: col, len: len, fret: val,
              midi: tune[5 - li] + (capo || 0) + fretForPitch,
              harmonic: harmonic,
              legato: prev === 'h' || prev === 'p' || prev === '/' || prev === '\\' || prev === 's'
            });
          }
          col += len;
        } else col++;
      }
    }
    tokens.sort(function (a, b2) { return a.col - b2.col || a.line - b2.line; });
    var barCols = [];
    for (var c = 0; c < width; c++) if (bodies[0][c] === '|') barCols.push(c);
    var events = [], cur = null;
    tokens.forEach(function (tk) {
      if (cur && tk.col <= cur.end && !cur.notes.some(function (n) { return n.line === tk.line; })) {
        cur.notes.push(tk);
        if (tk.col === cur.col) cur.end = Math.max(cur.end, tk.col + tk.len - 1);
      } else {
        cur = { col: tk.col, end: tk.col + tk.len - 1, notes: [tk] };
        events.push(cur);
      }
    });
    events.forEach(function (ev) {
      var bar = 0;
      for (var k = 0; k < barCols.length; k++) if (barCols[k] < ev.col) bar = k + 1;
      ev.bar = bar;
    });
    var tech = { h: 0, p: 0, b: 0, slide: 0, vib: 0, harm: 0 };
    bodies.forEach(function (bd) {
      tech.h += (bd.match(/\dh\d/g) || []).length;
      tech.p += (bd.match(/\dp\d/g) || []).length;
      tech.b += (bd.match(/\db/g) || []).length;
      tech.slide += (bd.match(/\d[\/\\s]\d/g) || []).length;
      tech.vib += (bd.match(/~+/g) || []).length;
      tech.harm += (bd.match(/<\d+>/g) || []).length;
    });
    return {
      lines: bodies,
      labels: [5, 4, 3, 2, 1, 0].map(function (si, k) { var nm = pcName(tune[si]); return k === 0 && nm.length === 1 ? nm.toLowerCase() : nm; }),
      tuning: labelTuning,
      events: events,
      tech: tech,
      width: width
    };
  }

  /* Read meta lines such as "Capo: 4th fret", "Tuning: Drop D", "Tempo: 120". */
  function readMeta(line, meta) {
    var m;
    if ((m = /\bcapo\b[^0-9\n]{0,12}(\d{1,2})/i.exec(line))) { meta.capo = Math.min(12, parseInt(m[1], 10)); return true; }
    if (/\b(no capo|capo:?\s*none)\b/i.test(line)) { meta.capo = 0; return true; }
    if ((m = /\b(?:tempo|bpm)\b[^0-9\n]{0,10}(\d{2,3})/i.exec(line)) || (m = /\b(\d{2,3})\s*bpm\b/i.exec(line))) {
      var v = parseInt(m[1], 10); if (v >= 30 && v <= 260) { meta.bpm = v; return true; }
    }
    if ((m = /^\s*key\s*[:=]\s*([A-G][#b]?m?)\b/i.exec(line))) { meta.key = m[1]; return true; }
    if ((m = /^\s*tuning\s*[:=]?\s*(.+)$/i.exec(line))) {
      var t = m[1].trim();
      if (/drop\s*d/i.test(t)) meta.tuning = 'dropd';
      else if (/dadgad/i.test(t)) meta.tuning = 'dadgad';
      else if (/open\s*g/i.test(t)) meta.tuning = 'openg';
      else if (/open\s*d/i.test(t)) meta.tuning = 'opend';
      else if (/half[- ]?step|eb\s+ab\s+db/i.test(t)) meta.tuning = 'eb';
      else if (/whole[- ]?step|d\s+g\s+c\s+f\s+a\s+d/i.test(t)) meta.tuning = 'dstd';
      else {
        var names = t.split(/[\s,\-]+/).filter(function (x) { return pcOf(x) !== null; });
        if (names.length === 6) {
          var std = TUNINGS.standard.midi, arr = [];
          for (var i = 0; i < 6; i++) {
            var pc = pcOf(names[i]), best = null;
            for (var d = -5; d <= 4; d++) if (mod12(std[i] + d) === pc) { if (best === null || Math.abs(d) < Math.abs(best)) best = d; }
            arr.push(std[i] + (best === null ? 0 : best));
          }
          var same = arr.every(function (v2, k) { return v2 === std[k]; });
          meta.tuning = same ? 'standard' : arr;
        }
      }
      return true;
    }
    return false;
  }

  /* Parse pasted text: chord sheets (chords over words, with or without bar lines), ChordPro, and ASCII tab. */
  function parseSheet(text) {
    var meta = {};
    var sections = [];
    var warnings = [];
    var cur = null;
    var src = String(text || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');
    var lines = src.split('\n');
    function open(name, type) {
      cur = { name: name || '', type: type, bars: [], systems: [] };
      sections.push(cur);
      return cur;
    }
    var pendingName = null;
    var i = 0;
    var inTabDirective = false;
    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) { i++; continue; }

      /* ChordPro directives */
      var dm = /^\{\s*([a-z_]+)\s*[: ]?\s*(.*?)\s*\}$/i.exec(trimmed);
      if (dm) {
        var d = dm[1].toLowerCase(), arg = dm[2];
        if (d === 'title' || d === 't') meta.title = arg;
        else if (d === 'artist' || d === 'subtitle' || d === 'st') { if (!meta.artist) meta.artist = arg; }
        else if (d === 'capo') meta.capo = Math.min(12, parseInt(arg, 10) || 0);
        else if (d === 'tempo') { var tv = parseInt(arg, 10); if (tv >= 30 && tv <= 260) meta.bpm = tv; }
        else if (d === 'key') meta.key = arg;
        else if (d === 'soc' || d === 'start_of_chorus') pendingName = arg || 'Chorus';
        else if (d === 'sov' || d === 'start_of_verse') pendingName = arg || 'Verse';
        else if (d === 'sob' || d === 'start_of_bridge') pendingName = arg || 'Bridge';
        else if (d === 'sot' || d === 'start_of_tab') { inTabDirective = true; if (arg) pendingName = arg; }
        else if (d === 'eot' || d === 'end_of_tab') inTabDirective = false;
        else if (d === 'c' || d === 'comment' || d === 'ci' || d === 'comment_italic') {
          if (HEADER_RE.test(arg)) pendingName = arg.replace(/[:\[\]]/g, '').trim();
        }
        i++; continue;
      }
      if (trimmed.charAt(0) === '#' && !readTabLine(line) && !readChordLine(line)) { i++; continue; }

      /* tab systems: a run of tab lines */
      if (readTabLine(line)) {
        var run = [];
        var j = i;
        while (j < lines.length) { var tl = readTabLine(lines[j]); if (!tl) break; run.push(tl); j++; }
        if (run.length >= 6 && run.length % 6 === 0) {
          var sec = cur && cur.type === 'tab' && pendingName === null ? cur : null;
          if (!sec) {
            if (cur && !cur.bars.length && !cur.systems.length && pendingName === null) { sec = cur; sec.type = 'tab'; }
            else { sec = open(pendingName || '', 'tab'); pendingName = null; }
          }
          for (var k = 0; k < run.length; k += 6) sec.systems.push({ raw: run.slice(k, k + 6) });
          i = j; continue;
        }
        if (run.length === 4 || run.length === 5 || run.length === 7) {
          warnings.push(run.length === 4 ? 'A 4-line tab was skipped (it looks like a bass tab).' : 'A ' + run.length + '-line tab was skipped. Only 6-string tab is read.');
          i = j; continue;
        }
        /* fewer than 4 dash lines in a row: not a tab, fall through */
      }

      /* meta lines: "Capo: 2nd fret", "Tuning: E A D G B E", "Tempo: 96" */
      if (trimmed.length < 60 && (/^\s*(capo|tuning|tempo|bpm|key)\b/i.test(trimmed) || (/\b(capo|tuning|tempo|bpm)\b/i.test(trimmed) && !readChordLine(line)))) {
        if (readMeta(trimmed, meta)) { i++; continue; }
      }

      /* section header, alone on its line */
      var hm = HEADER_RE.exec(trimmed);
      if (hm && !readChordLine(trimmed.replace(/^[\[(]|[\])]:?$/g, ''))) {
        pendingName = hm[1].replace(/\s+/g, ' ').trim();
        pendingName = pendingName.charAt(0).toUpperCase() + pendingName.slice(1);
        i++; continue;
      }
      /* header followed by chords on the same line: "Intro: C G Am F" */
      var him = HEADER_INLINE_RE.exec(trimmed);
      var lineForChords = line;
      if (him) {
        var restChords = readChordLine(him[2]);
        if (restChords) { pendingName = him[1].trim(); pendingName = pendingName.charAt(0).toUpperCase() + pendingName.slice(1); lineForChords = him[2]; }
      }

      /* ChordPro inline chords: "[C]word [G]word" */
      var inline = [];
      var ire = /\[([^\]\s]{1,12})\]/g, im2;
      while ((im2 = ire.exec(lineForChords))) { if (parseChord(im2[1])) inline.push(im2[1]); }
      var looksInline = inline.length > 0 && lineForChords.replace(/\[[^\]]*\]/g, '').trim().length > 0;
      if (looksInline || (inline.length > 1)) {
        var s1 = (cur && cur.type === 'chords' && pendingName === null) ? cur : open(pendingName || '', 'chords');
        pendingName = null;
        inline.forEach(function (c) { s1.bars.push(c); });
        i++; continue;
      }

      var cl = readChordLine(lineForChords);
      if (cl) {
        var s2 = (cur && cur.type === 'chords' && pendingName === null) ? cur : open(pendingName || '', 'chords');
        pendingName = null;
        for (var r = 0; r < cl.repeat; r++) cl.bars.forEach(function (b) { s2.bars.push(b); });
        i++; continue;
      }
      i++;
    }
    sections = sections.filter(function (s) { return s.bars.length || s.systems.length; });
    /* resolve "%" repeats and number unnamed sections */
    var unnamed = 0;
    sections.forEach(function (s) {
      var last = null;
      s.bars = s.bars.map(function (b) { if (b === '%' && last) return last; last = b; return b; }).filter(function (b) { return b !== '%'; });
      if (!s.name) { unnamed++; s.name = (s.type === 'tab' ? 'Tab ' : 'Part ') + unnamed; }
    });
    var out = sections.map(function (s) {
      if (s.type === 'tab') {
        return { name: s.name, type: 'tab', systems: s.systems.map(function (sy) { return { lines: sy.raw.map(function (l) { return (l.label ? l.label : '') + '|' + l.body.replace(/^\|/, ''); }) }; }) };
      }
      return { name: s.name, type: 'chords', bars: s.bars };
    });
    return { meta: meta, sections: out, warnings: warnings };
  }

  /* ---------- building a playable model from a stored song ---------- */
  function splitBar(bar) { return String(bar).trim().split(/\s+/).filter(Boolean); }

  function buildSong(song) {
    var capo = song.capo || 0;
    var tuning = song.tuning || 'standard';
    var beatsPerBar = song.beatsPerBar || 4;
    var beatsPerSlot = song.beatsPerSlot || beatsPerBar;
    var targets = [];
    var view = [];
    var chordSet = {};
    var beat = 0;
    var feats = { chords: 0, tabNotes: 0, tech: { h: 0, p: 0, b: 0, slide: 0, vib: 0, harm: 0 }, maxFret: 0, minFret: 99, stacks: 0, twoPerBar: false, systems: 0 };
    (song.sections || []).forEach(function (sec, si) {
      var reps = Math.max(1, Math.min(16, sec.repeat || 1));
      if (sec.type === 'notes') {
        /* timed single notes, written as "string:fret" tokens: "6:0 6:3 5:0*2 | 4:2+3:2" */
        var tn = tuningMidi(tuning);
        var vn = { name: sec.name || '', type: 'tab', index: si, systems: [], first: targets.length };
        var lines = ['', '', '', '', '', ''], spans = [], perRow = 0;
        var flush = function () {
          if (!lines[0].length) return;
          vn.systems.push({ lines: lines.map(function (l) { return l + '-|'; }), labels: [5, 4, 3, 2, 1, 0].map(function (sidx, k) { var nm = pcName(tn[sidx]); return k === 0 && nm.length === 1 ? nm.toLowerCase() : nm; }), spans: spans });
          lines = ['', '', '', '', '', '']; spans = []; perRow = 0;
        };
        for (var rr = 0; rr < reps; rr++) {
          String(sec.steps || '').trim().split(/\s+/).forEach(function (tok) {
            if (!tok) return;
            if (tok === '|') { if (perRow >= 8) flush(); else if (lines[0].length) lines = lines.map(function (l) { return l + '-|'; }); return; }
            var mm = /^([^*]+)(?:\*([\d.]+))?$/.exec(tok);
            if (!mm) return;
            var beats = mm[2] ? parseFloat(mm[2]) : (sec.step || 1);
            var notes = [];
            mm[1].split('+').forEach(function (pr) {
              var q = /^([1-6]):(\d{1,2})$/.exec(pr);
              if (q) notes.push({ s: 6 - parseInt(q[1], 10), fret: parseInt(q[2], 10) });
            });
            if (!notes.length) { beat += beats; return; }
            var idx = targets.length, col = lines[0].length + 1, wide = notes.some(function (n) { return n.fret > 9; }) ? 2 : 1;
            for (var li = 0; li < 6; li++) {
              var hit = null;
              notes.forEach(function (n) { if (5 - n.s === li) hit = n; });
              var cell = hit ? String(hit.fret) : '';
              while (cell.length < wide) cell += '-';
              lines[li] += '-' + cell + '-';
              if (hit) spans.push({ line: li, col: col, len: String(hit.fret).length, target: idx });
            }
            var midis = notes.map(function (n) { if (n.fret > feats.maxFret) feats.maxFret = n.fret; if (n.fret > 0 && n.fret < feats.minFret) feats.minFret = n.fret; return tn[n.s] + capo + n.fret; });
            feats.tabNotes++; perRow++;
            if (midis.length > 1) feats.stacks++;
            targets.push({
              index: idx, kind: midis.length > 1 ? 'chord' : 'note', midis: midis,
              label: midis.map(function (m) { return midiName(m); }).join(' '),
              detail: notes.map(function (n) { return 'string ' + (6 - n.s) + ', fret ' + n.fret; }).join(' + '),
              pos: notes.map(function (n) { return { s: n.s, f: n.fret }; }),
              section: si, beat: beat, beats: beats
            });
            beat += beats;
          });
          flush();
        }
        vn.last = targets.length - 1;
        if (vn.systems.length) { feats.systems += vn.systems.length; view.push(vn); }
      } else if (sec.type === 'tab' || sec.systems) {
        var vsec = { name: sec.name || '', type: 'tab', index: si, systems: [], first: targets.length };
        (sec.systems || []).forEach(function (sy) {
          var raw = (sy.lines || []).map(function (l) { return readTabLine(l) || { label: null, body: String(l) }; });
          if (raw.length !== 6) return;
          var parsed = parseSystem(raw, sy.tuning || tuning, capo);
          feats.systems++;
          Object.keys(parsed.tech).forEach(function (k) { feats.tech[k] += parsed.tech[k]; });
          var barWidths = {};
          var vsys = { lines: parsed.lines, labels: parsed.labels, spans: [] };
          parsed.events.forEach(function (ev) {
            var idx = targets.length;
            ev.notes.sort(function (x, y) { return x.s - y.s; });
            var midis = ev.notes.map(function (n) { return n.midi; });
            ev.notes.forEach(function (n) {
              vsys.spans.push({ line: n.line, col: n.col, len: n.len, target: idx });
              if (n.fret > feats.maxFret) feats.maxFret = n.fret;
              if (n.fret > 0 && n.fret < feats.minFret) feats.minFret = n.fret;
            });
            feats.tabNotes++;
            if (midis.length > 1) feats.stacks++;
            var lab = ev.notes.length === 1 ? midiName(midis[0]) : ev.notes.map(function (n) { return midiName(n.midi); }).join(' ');
            targets.push({
              index: idx, kind: midis.length > 1 ? 'chord' : 'note', midis: midis, label: lab,
              detail: ev.notes.map(function (n) { return 'string ' + (6 - n.s) + ', fret ' + n.fret; }).join(' + '),
              pos: ev.notes.map(function (n) { return { s: n.s, f: n.fret }; }),
              section: si, beat: null, beats: null, legato: ev.notes.length === 1 && ev.notes[0].legato,
              harmonic: ev.notes.some(function (n) { return n.harmonic; })
            });
          });
          vsec.systems.push(vsys);
        });
        vsec.last = targets.length - 1;
        if (vsec.systems.length) view.push(vsec);
      } else {
        var vs = { name: sec.name || '', type: 'chords', index: si, cells: [], first: targets.length, repeat: reps };
        for (var r = 0; r < reps; r++) {
          (sec.bars || []).forEach(function (bar) {
            var names = splitBar(bar);
            if (!names.length) return;
            if (names.length > 1) feats.twoPerBar = true;
            var cell = { rep: r, chords: [] };
            var each = beatsPerSlot / names.length;
            names.forEach(function (nm) {
              var ch = parseChord(nm);
              if (/^(n\.?c\.?|-|rest)$/i.test(nm) || !ch) { cell.chords.push({ name: nm, target: -1 }); beat += each; return; }
              var shape = shapeFor(ch, song.shapes);
              var midis = shape ? shapeMidi(shape, tuning, capo) : genericVoicing(ch, capo);
              if (!chordSet[nm]) chordSet[nm] = { name: nm, chord: ch, shape: shape, midis: midis, count: 0 };
              chordSet[nm].count++;
              var idx = targets.length;
              targets.push({ index: idx, kind: 'chord', midis: midis, label: nm, chordName: nm, pos: shape ? shape.map(function (f, k) { return f === null ? null : { s: k, f: f }; }).filter(Boolean) : null, section: si, beat: beat, beats: each, root: mod12(ch.root + capo), third: ch.third, capo: capo });
              cell.chords.push({ name: nm, target: idx });
              beat += each;
            });
            vs.cells.push(cell);
          });
        }
        vs.last = targets.length - 1;
        if (vs.cells.length) view.push(vs);
      }
    });
    var chords = Object.keys(chordSet).map(function (k) { return chordSet[k]; });
    feats.chords = chords.length;
    var timed = targets.length > 0 && targets.every(function (t) { return t.beat !== null; });
    return {
      song: song, targets: targets, view: view, chords: chords, timed: timed, totalBeats: beat,
      capo: capo, tuning: tuning, feats: feats, kind: feats.tabNotes && feats.chords ? 'mixed' : (feats.tabNotes ? 'tab' : 'chords')
    };
  }

  /* ---------- difficulty ---------- */
  var LEVELS = [
    null,
    { n: 1, name: 'Open chords', blurb: 'A few open chords or single notes near the nut.' },
    { n: 2, name: 'Moving faster', blurb: 'More shapes, quicker changes, a first barre such as F or Bm.' },
    { n: 3, name: 'Barre chords', blurb: 'Barre shapes up the neck, riffs that shift position.' },
    { n: 4, name: 'Riffs and lead', blurb: 'Fast riffs, bends and legato, richer chords.' },
    { n: 5, name: 'Advanced', blurb: 'Fast lead lines, complex voicings and rhythm.' }
  ];
  var FIRST_CHORDS = { 'A': 1, 'Am': 1, 'C': 1, 'D': 1, 'Dm': 1, 'E': 1, 'Em': 1, 'G': 1, 'E5': 1, 'A5': 1, 'D5': 1 };

  function suggestLevel(model) {
    var reasons = [];
    var level = 1;
    var f = model.feats;
    if (model.chords.length) {
      var barre = 0, high = 0, ext = 0, colour = 0, unknown = 0;
      model.chords.forEach(function (c) {
        var info = shapeInfo(c.shape);
        if (!c.shape) unknown++;
        if (info && info.barre) { barre++; if (info.min >= 5) high++; }
        if (c.chord.intervals.length >= 5 || /dim|aug|b5|#5|#9|b9|13|11/.test(c.chord.quality)) ext++;
        else if (!FIRST_CHORDS[c.chord.canon] && !(info && info.barre)) colour++;
      });
      var n = model.chords.length;
      var bpm = model.song.bpm || 0;
      var l2 = false, l3 = false, l4 = false;
      if (barre >= 1) { l2 = true; reasons.push(barre + (barre === 1 ? ' barre chord' : ' barre chords')); }
      if (colour >= 1) { l2 = true; reasons.push(colour + (colour === 1 ? ' colour chord (7th, sus or add)' : ' colour chords (7th, sus or add)')); }
      if (n > 5) { l2 = true; reasons.push(n + ' different chords'); }
      if (f.twoPerBar) { l2 = true; reasons.push('two chords in one bar'); }
      if (barre >= 3 || high >= 1) { l3 = true; if (high) reasons.push('barre shapes at fret 5 or higher'); }
      if (ext >= 2 || (f.twoPerBar && bpm >= 120 && barre >= 2)) { l4 = true; if (ext) reasons.push(ext + ' extended or altered chords'); }
      if (l2) level = 2;
      if (l3) level = 3;
      if (l4) level = 4;
      if (ext >= 5) level = 5;
      if (!reasons.length) reasons.push(n + (n === 1 ? ' open chord' : ' open chords'));
    }
    if (f.tabNotes) {
      var tl = 1;
      var range = f.minFret <= f.maxFret ? f.maxFret - f.minFret : 0;
      var legato = f.tech.h + f.tech.p + f.tech.slide;
      if (f.maxFret > 5 || legato > 0 || f.stacks > 0 || f.tabNotes > 60) tl = 2;
      if (f.tech.b > 0 || range > 7 || f.maxFret >= 12 || f.tabNotes > 150) tl = 3;
      if ((f.maxFret > 12 && (f.tech.b > 2 || legato > 6)) || f.tabNotes > 300) tl = 4;
      var tr = [];
      tr.push(f.tabNotes + ' tab notes up to fret ' + f.maxFret);
      if (legato) tr.push(legato + ' hammer-ons, pull-offs or slides');
      if (f.tech.b) tr.push(f.tech.b + (f.tech.b === 1 ? ' bend' : ' bends'));
      reasons = reasons.concat(tr);
      if (tl > level) level = tl;
    }
    return { level: level, reasons: reasons };
  }

  PR.music = {
    SHARP: SHARP, FLAT: FLAT, mod12: mod12, pcOf: pcOf, pcName: pcName, midiName: midiName, midiToFreq: midiToFreq, freqToMidi: freqToMidi,
    TUNINGS: TUNINGS, tuningMidi: tuningMidi, tuningName: tuningName,
    parseChord: parseChord, parseShape: parseShape, shapeToString: shapeToString, shapeFor: shapeFor, shapeInfo: shapeInfo, shapeMidi: shapeMidi,
    genericVoicing: genericVoicing, readChordLine: readChordLine, readTabLine: readTabLine, parseSystem: parseSystem, parseSheet: parseSheet,
    buildSong: buildSong, splitBar: splitBar, LEVELS: LEVELS, suggestLevel: suggestLevel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PR;
})(typeof window !== 'undefined' ? window : globalThis);

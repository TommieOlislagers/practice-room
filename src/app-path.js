/* app-path.js: the path to a song.

   Every song gets a list of steps that lead up to playing it: the chord shapes in it, the changes between
   them, the techniques its rhythm asks for, a scale for its fills or tune, each part in time, and at the end
   the whole song at full speed. Each step is an exercise that can be started and passed.

   Shapes, changes, techniques and scales are skills: they are the same step in every song that needs them,
   so what was learned for one song is already ticked off in the next. Parts and whole-song steps belong to
   the song.

   Nothing about the path is stored. A step counts as done when the session log holds a run that passed it,
   so it is the same on every device and inside Claude. The exercises are small songs made on the spot
   (ids starting "x:"), played on the same stage as everything else. */
(function (root) {
  'use strict';
  var PR = root.PR, M = PR.music, App = PR.app, S = App.S;
  var PASS = 0.8, OMC_PASS = 30, PART_PCT = 70, SLOW_PCT = 75;

  /* ---------- technique drills: written for this app, not taken from any song ---------- */
  function rep(tok, n) { var out = []; for (var i = 0; i < n; i++) out.push(tok); return out.join(' '); }
  function boogie(lo, hi) { var a = lo + ':0+' + hi + ':2', b = lo + ':0+' + hi + ':4'; return [a, a, b, a, a, a, b, a].join(' '); }
  var TECH = {
    'strum-quarters': { title: 'Steady strums on the beat', bpm: 70, note: 'One down-strum on every click. Count 1, 2, 3, 4 out loud and let the hand swing like a pendulum.',
      sections: [{ name: 'Four to the bar', type: 'chords', bars: [rep('Em', 4), rep('Em', 4), rep('G', 4), rep('G', 4)], repeat: 2 }] },
    'strum-eighths': { title: 'Down-up eighths', bpm: 70, note: 'Down on the click, up in between. The hand keeps the same swing the whole time; only the strings change.',
      sections: [{ name: 'Eight to the bar', type: 'chords', bars: [rep('Em', 8), rep('G', 8), rep('Em', 8), rep('G', 8)], repeat: 2 }] },
    'strum-pattern': { title: 'A mixed strumming pattern', bpm: 76, note: 'Down, down-up, up-down-up. The hand still swings through the two strokes it leaves out, without touching the strings.',
      sections: [{ name: 'Down, down-up, up-down-up', type: 'chords', bars: ['G - G G - G G G', 'Em - Em Em - Em Em Em', 'C - C C - C C C', 'D - D D - D D D'], repeat: 2 }] },
    'strum-sixteenths': { title: 'Sixteenth strumming', bpm: 56, note: 'Four strokes to every click: down-up-down-up. Stay loose in the wrist and strum only the top three or four strings.',
      sections: [{ name: 'Sixteen to the bar', type: 'chords', bars: [rep('Em', 16), rep('Am', 16)], repeat: 3 }] },
    'offbeat': { title: 'Off-beat upstrokes', bpm: 80, note: 'Nothing on the click, a short upstroke between clicks. Tap your foot on the click to hold the beat.',
      sections: [{ name: 'On the "and"', type: 'chords', bars: ['- Am - Am - Am - Am', '- G - G - G - G'], repeat: 4 }] },
    'shuffle': { title: 'Boogie shuffle in A', bpm: 84, level: 2, note: 'Two strings at a time. Swing it: long-short, long-short. The ring finger reaches two frets up for the higher note. Twelve bars: A, D and E.',
      sections: [{ name: 'Twelve-bar boogie', type: 'notes', step: 0.5, steps: [boogie(5, 4), boogie(5, 4), boogie(5, 4), boogie(5, 4), boogie(4, 3), boogie(4, 3), boogie(5, 4), boogie(5, 4), boogie(6, 5), boogie(4, 3), boogie(5, 4), boogie(6, 5)].join(' | ') }] },
    'twelve-eight': { title: 'Slow blues: three strums to the beat', bpm: 58, note: 'Count 1-and-a, 2-and-a, 3-and-a, 4-and-a. Lean on the first of every three and keep the other two light.',
      sections: [{ name: 'Twelve to the bar', type: 'chords', bars: [rep('A', 12), rep('D', 12), rep('A', 12), rep('E', 12)], repeat: 2 }] },
    'waltz': { title: 'Three-four time', bpm: 92, beatsPerBar: 3, beatsPerSlot: 3, note: 'Three beats to the bar: a firm strum on one, two lighter ones after it.',
      sections: [{ name: 'One, two, three', type: 'chords', bars: [rep('G', 3), rep('G', 3), rep('D', 3), rep('D', 3), rep('C', 3), rep('C', 3), rep('G', 3), rep('G', 3)], repeat: 2 }] },
    'quick-changes': { title: 'Two chords in a bar', bpm: 66, level: 2, note: 'Two beats on each chord. Start moving the fingers on the last upstroke, not after it.',
      sections: [{ name: 'Half-bar changes', type: 'chords', bars: ['G D', 'Em C', 'G D', 'C G'], repeat: 3 }] },
    'palm-mute': { title: 'Palm-muted eighths', bpm: 90, level: 2, note: 'Rest the edge of the picking hand on the strings right where they leave the bridge. The notes should thud, not ring. Muted notes are hard for the microphone, so play along and judge it yourself.',
      sections: [{ name: 'Chug', type: 'notes', step: 0.5, steps: [rep('6:0+5:2', 8), rep('6:0+5:2', 8), rep('5:0+4:2', 8), rep('6:0+5:2', 8)].join(' | '), repeat: 2 }] },
    'power-chords': { title: 'Power chords', bpm: 80, level: 2, beatsPerSlot: 2, note: 'Index on the root, ring finger two frets up on the next string. Lay the index lightly across the higher strings so they stay silent.',
      shapes: { F5: '133xxx', G5: '355xxx', A5: '577xxx', C5: 'x355xx', D5: 'x577xx' },
      sections: [{ name: 'Along two strings', type: 'chords', bars: ['F5', 'G5', 'A5', 'C5', 'D5', 'C5', 'A5', 'G5'], repeat: 2 }] },
    'barre-e': { title: 'The E-shape barre', bpm: 60, level: 2, beatsPerSlot: 2, note: 'An E chord pushed up the neck with the index finger as a bar. Roll the index slightly onto its bony edge, thumb behind the neck, and squeeze only while the chord sounds.',
      shapes: { F: '133211', G: '355433', A: '577655' },
      sections: [{ name: 'F, G, A and back', type: 'chords', bars: ['F', '-', 'G', '-', 'A', '-', 'G', '-'], repeat: 2 }] },
    'barre-em': { title: 'The Em-shape barre', bpm: 60, level: 2, beatsPerSlot: 2, note: 'The E-shape barre with the middle finger lifted. The bar itself now has to sound the third string cleanly.',
      shapes: { 'F#m': '244222', Gm: '355333', Am: '577555' },
      sections: [{ name: 'F#m, Gm, Am and back', type: 'chords', bars: ['F#m', '-', 'Gm', '-', 'Am', '-', 'Gm', '-'], repeat: 2 }] },
    'barre-a': { title: 'The A-shape barre', bpm: 60, level: 3, beatsPerSlot: 2, note: 'An A chord pushed up the neck: bar with the index, and flatten the ring finger across three strings (or use three fingers). The low E string stays out.',
      shapes: { B: 'x24442', C: 'x35553', D: 'x57775' },
      sections: [{ name: 'B, C, D and back', type: 'chords', bars: ['B', '-', 'C', '-', 'D', '-', 'C', '-'], repeat: 2 }] },
    'barre-am': { title: 'The Am-shape barre', bpm: 60, level: 3, beatsPerSlot: 2, note: 'An Am chord pushed up the neck. Bar five strings with the index and build the Am shape in front of it.',
      shapes: { Bm: 'x24432', Cm: 'x35543', Dm: 'x57765' },
      sections: [{ name: 'Bm, Cm, Dm and back', type: 'chords', bars: ['Bm', '-', 'Cm', '-', 'Dm', '-', 'Cm', '-'], repeat: 2 }] },
    'sevenths': { title: 'Seventh chords', bpm: 66, level: 2, note: 'Each of these is an open chord with one finger lifted or moved. Find that finger first.',
      sections: [{ name: 'A7, D7, E7, B7', type: 'chords', bars: ['A7', 'D7', 'A7', 'E7', 'B7', 'E7', 'A7', 'A7'], repeat: 2 }] },
    'sus-moves': { title: 'Sus chords', bpm: 72, level: 2, note: 'Hold the chord and move one finger: add the little finger for sus4, lift a finger for sus2. One strum each.',
      sections: [{ name: 'Lift and add', type: 'chords', bars: ['D Dsus4 D Dsus2', 'A Asus4 A Asus2', 'D Dsus4 D Dsus2', 'E Esus4 E E'], repeat: 2 }] },
    'bass-walk': { title: 'Slash chords and a walking bass', bpm: 66, level: 2, beatsPerSlot: 2, note: 'The letter after the slash is the lowest note. Aim the first stroke at that string so the bass line can be heard stepping down.',
      sections: [{ name: 'Stepping down', type: 'chords', bars: ['G', 'G/B', 'C', 'C', 'Am', 'Am/G', 'D/F#', 'G'], repeat: 2 }] },
    'travis': { title: 'Alternating thumb', bpm: 66, level: 3, note: 'The thumb plays the two low notes in turn, steady as a clock. Index and middle fill in between on the third and second strings.',
      sections: [{ name: 'C, G, Am, C', type: 'notes', step: 0.5, steps: ['5:3 3:0 4:2 2:1 5:3 3:0 4:2 2:1', '6:3 3:0 4:0 2:0 6:3 3:0 4:0 2:0', '5:0 3:2 4:2 2:1 5:0 3:2 4:2 2:1', '5:3 3:0 4:2 2:1 5:3 3:0 4:2 2:1'].join(' | '), repeat: 2 }] },
    'hammer-pull': { title: 'Hammer-ons and pull-offs', bpm: 60, level: 2, note: 'Pick only the first note of each pair. Hammer the ring finger down hard for the second; for a pull-off, flick it sideways off the string.',
      sections: [{ name: 'Fifth position', type: 'tab', systems: [{ lines: ['e|-----------------------------------|', 'B|-----------------------------------|', 'G|-----------------5h7-7p5-----------|', 'D|---------5h7-7p5---------5h7-7p5---|', 'A|-5h7-7p5---------------------------|', 'E|-----------------------------------|'] }] }] },
    'bends': { title: 'Bends in tune', bpm: 60, level: 3, note: 'Push the string up with three fingers behind each other until it sounds like the note two frets higher. Play that note first so you know the target.',
      sections: [{ name: 'Target, then bend', type: 'tab', systems: [{ lines: ['e|-------------------------------|', 'B|-----------10-8b10----10-8b10--|', 'G|-9-7b9-----------9-7b9---------|', 'D|-------------------------------|', 'A|-------------------------------|', 'E|-------------------------------|'] }] }] },
    'slides': { title: 'Slides', bpm: 60, level: 2, note: 'Pick once, keep the pressure on, and slide to the next fret so the note never stops.',
      sections: [{ name: 'Up and back', type: 'tab', systems: [{ lines: ['e|---------------------------|', 'B|---------------------------|', 'G|-5/7---7\\5---5/9---9\\5-----|', 'D|-----------------------5/7-|', 'A|---------------------------|', 'E|---------------------------|'] }] }] },
    'double-stops': { title: 'Double stops', bpm: 66, level: 3, note: 'Two notes at once on the second and third strings, moving up the neck. Pick both strings with one stroke, or pluck them with thumb and finger.',
      sections: [{ name: 'Thirds in G', type: 'notes', step: 1, steps: '3:0+2:0 3:2+2:1 3:4+2:3 3:5+2:5 | 3:7+2:7 3:5+2:5 3:4+2:3 3:2+2:1 | 3:0+2:0*2', repeat: 2 }] },
    'alt-picking': { title: 'Alternate picking', bpm: 72, level: 2, note: 'Down, up, down, up on every note, also when you cross to the next string. Small movements from the wrist.',
      sections: [{ name: 'Open strings', type: 'notes', step: 0.5, steps: [rep('6:0', 4) + ' ' + rep('5:0', 4), rep('4:0', 4) + ' ' + rep('3:0', 4), rep('2:0', 4) + ' ' + rep('1:0', 4)].join(' | ') },
        { name: 'Four frets a string', type: 'notes', step: 0.5, steps: '6:1 6:2 6:3 6:4 5:1 5:2 5:3 5:4 | 4:1 4:2 4:3 4:4 3:1 3:2 3:3 3:4 | 2:1 2:2 2:3 2:4 1:1 1:2 1:3 1:4' }] }
  };
  /* picking a chord one string at a time, made from the shapes of four open chords */
  (function () {
    var bars = ['Am', 'C', 'G', 'Em'].map(function (n) {
      var sh = M.shapeFor(M.parseChord(n)), low = 0;
      while (sh[low] === null) low++;
      var s = function (k) { return (6 - k) + ':' + sh[k]; };
      return [s(low), s(3), s(4), s(5), s(4), s(3)].join(' ');
    });
    TECH.arpeggio = { title: 'Picking a chord one string at a time', bpm: 72, level: 2, beatsPerBar: 3, note: 'Hold the whole chord down. The thumb takes the bass note, then index, middle and ring take the top three strings, up and back. Let every note ring into the next.',
      sections: [{ name: 'Am, C, G, Em', type: 'notes', step: 0.5, steps: bars.join(' | '), repeat: 2 }] };
  })();

  /* ---------- scales, laid out in one hand position for any key ---------- */
  var SCALES = {
    'major': { name: 'major scale', iv: [0, 2, 4, 5, 7, 9, 11] }, 'minor': { name: 'minor scale', iv: [0, 2, 3, 5, 7, 8, 10] },
    'penta-major': { name: 'major pentatonic', iv: [0, 2, 4, 7, 9] }, 'penta-minor': { name: 'minor pentatonic', iv: [0, 3, 5, 7, 10] },
    'blues': { name: 'blues scale', iv: [0, 3, 5, 6, 7, 10] }, 'dorian': { name: 'Dorian scale', iv: [0, 2, 3, 5, 7, 9, 10] }, 'mixolydian': { name: 'Mixolydian scale', iv: [0, 2, 4, 5, 7, 9, 10] }
  };
  function scaleSong(type, rootName) {
    var sc = SCALES[type], pc = M.pcOf(rootName);
    if (!sc || pc === null || pc === undefined || pc !== pc) return null;
    var open = M.tuningMidi('standard');
    var p = M.mod12(pc - 4), start = 40 + p;
    if (p > 8) { p = M.mod12(pc - 9); start = 45 + p; }              /* high on the low string: start from the A string instead */
    var lo = p === 0 ? 0 : p - 1, hi = p === 0 ? 4 : p + 3, toks = [], m, k;
    for (m = start; m <= start + 28; m++) {
      if (sc.iv.indexOf(M.mod12(m - pc)) < 0) continue;
      var put = null;
      /* the thickest string that has the note inside the hand position; an open string wins when there is one */
      for (k = 5; k >= 0; k--) { if (m - open[k] === 0 && lo === 0) put = (6 - k) + ':0'; }
      for (k = 0; k < 6 && !put; k++) { var f = m - open[k]; if (f >= lo && f <= hi) put = (6 - k) + ':' + f; }
      if (!put) break;
      toks.push(put);
    }
    if (toks.length < 5) return null;
    var down = toks.slice(0, -1).reverse(), all = toks.concat(down), bars = [];
    for (var i = 0; i < all.length; i += 4) bars.push(all.slice(i, i + 4).join(' '));
    var where = p === 0 ? 'open position' : 'fret ' + p;
    return { title: M.pcName(pc, /b/.test(rootName)) + ' ' + sc.name, bpm: 70, level: p === 0 ? 1 : 2,
      note: 'Up and back down, one note a click, starting on ' + M.pcName(pc, /b/.test(rootName)) + ' (' + where + '). One finger per fret; say the note names as you go.',
      sections: [{ name: 'Up and down, ' + where, type: 'notes', step: 1, steps: bars.join(' | ') }] };
  }

  /* ---------- exercises as small songs ---------- */
  function isEx(id) { return typeof id === 'string' && id.indexOf('x:') === 0; }
  var exCache = {};
  function exercise(id) {
    if (!isEx(id)) return null;
    if (exCache[id]) return exCache[id];
    var out = null, m;
    if ((m = /^x:shape:(.+)~([0-9x-]+)$/.exec(id))) {
      var name = m[1], fr = M.parseShape(m[2]), ch = M.parseChord(name);
      if (fr && ch) {
        var toks = [], shapes = {};
        fr.forEach(function (f, k) { if (f !== null) toks.push((6 - k) + ':' + f); });
        shapes[name] = m[2];
        var info = M.shapeInfo(fr);
        out = { title: name + ' chord', level: info && info.barre ? 2 : 1, bpm: 60, beatsPerSlot: 2, shapes: shapes, kind: 'shape',
          note: 'First pick the strings one at a time, low to high: every one has to ring clearly. A dull string means a finger is leaning on it or not pressing close to the fret. Then strum the chord, let go, and place it again.',
          sections: [{ name: 'String by string', type: 'notes', step: 1, steps: toks.join(' ') + ' | ' + toks.slice().reverse().join(' ') },
            { name: 'Strum, let go, place again', type: 'chords', bars: [name, '-', name, '-', name, '-', name, '-'] }] };
      }
    } else if ((m = /^x:tech:([a-z0-9-]+)$/.exec(id)) && TECH[m[1]]) {
      out = Object.assign({ level: 1, kind: 'tech' }, TECH[m[1]]);
    } else if ((m = /^x:scale:([a-z-]+):([A-G][#b]?)$/.exec(id))) {
      out = scaleSong(m[1], m[2]); if (out) out.kind = 'scale';
    }
    if (out) { out.id = id; out.exercise = true; out.origin = 'exercise'; out.checked = true; out.artist = ''; }
    exCache[id] = out;
    return out;
  }

  /* ---------- what the session log shows ---------- */
  var idx = null;
  function index() {
    var list = S.sessions, key = list.length + ':' + (list[0] ? list[0].id + ':' + list[0].at : '') + ':' + (list.length ? list[list.length - 1].at : '');
    if (idx && idx.key === key) return idx;
    var by = {}, pairs = {};
    list.forEach(function (x) {
      if (!x) return;
      if (x.kind === 'omc' && x.pair && typeof x.count === 'number') {
        var pk = pairKey(x.pair[0], x.pair[1]), p = pairs[pk] || (pairs[pk] = { best: 0, at: 0 });
        if (x.count > p.best) p.best = x.count;
        if (x.count >= OMC_PASS && (!p.at || x.at < p.at)) p.at = x.at;
        return;
      }
      if (!x.song || typeof x.acc !== 'number') return;
      (by[x.song] || (by[x.song] = [])).push(x);
    });
    idx = { key: key, by: by, pairs: pairs };
    pathCache = {}; sumCache = null;
    return idx;
  }
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  /* the earliest run that passed, and the best accuracy so far */
  function passOf(list, ok) {
    var at = 0, best = null;
    (list || []).forEach(function (x) {
      if (!ok(x)) return;
      if (best === null || x.acc > best) best = x.acc;
      if (x.acc >= PASS && (!at || x.at < at)) at = x.at;
    });
    return { at: at, best: best };
  }
  function any() { return true; }

  /* ---------- the steps for one song ---------- */
  function shapeStr(fr) { return fr.map(function (f) { return f === null ? 'x' : String(f); }).join(fr.some(function (f) { return f !== null && f > 9; }) ? '-' : ''); }
  function needsOf(song, model) {
    var out = [], seen = {};
    function add(n) { if (TECH[n] && !seen[n]) { seen[n] = 1; out.push(n); } }
    if (model.chords.length) add((song.beatsPerBar || 4) === 3 ? 'waltz' : 'strum-quarters');
    (song.needs || []).forEach(add);
    model.chords.forEach(function (c) {
      var info = M.shapeInfo(c.shape), q = c.chord.quality;
      if (info && info.barre) add(c.shape[0] !== null ? (c.chord.minor ? 'barre-em' : 'barre-e') : (c.chord.minor ? 'barre-am' : 'barre-a'));
      if (q === '5') add('power-chords');
      if (q === '7' && !(info && info.barre)) add('sevenths');
      if (/^sus/.test(q)) add('sus-moves');
      if (c.chord.bass !== null) add('bass-walk');
    });
    if (model.feats.twoPerBar) add('quick-changes');
    var t = model.feats.tech;
    if (t.h + t.p > 0) add('hammer-pull');
    if (t.b > 0) add('bends');
    if (t.slide > 0) add('slides');
    return out.slice(0, 9);
  }
  var pathCache = {};
  function build(song) {
    if (!song || song.drill || song.exercise || isEx(song.id)) return null;
    var model = App.modelOf(song);
    if (!model.targets.length) return null;
    var ix = index(), steps = [], mine = ix.by[song.id] || [];
    function push(st, pass) {
      st.done = !!pass.at; st.at = pass.at || 0; st.best = pass.best;
      steps.push(st);
    }
    /* 1. the shapes */
    model.chords.slice(0, 14).forEach(function (c) {
      if (!c.shape) return;
      var ex = 'x:shape:' + c.name + '~' + shapeStr(c.shape);
      push({ id: ex, ex: ex, kind: 'shape', stage: 'shapes', title: c.name, sub: 'Every string rings, then four clean strums', skill: true }, passOf(ix.by[ex], any));
    });
    /* 2. the changes that come up most */
    var seq = [], count = {}, order = [];
    model.targets.forEach(function (t) { if (t.chordName && seq[seq.length - 1] !== t.chordName) seq.push(t.chordName); });
    for (var i = 1; i < seq.length; i++) { var k = pairKey(seq[i - 1], seq[i]); if (!count[k]) { count[k] = 0; order.push([seq[i - 1], seq[i], k]); } count[k]++; }
    order.sort(function (a, b) { return count[b[2]] - count[a[2]]; });
    order.slice(0, 6).forEach(function (pr) {
      var p = ix.pairs[pr[2]] || { best: 0, at: 0 };
      push({ id: 'chg:' + pr[2], kind: 'change', stage: 'changes', title: pr[0] + ' → ' + pr[1], a: pr[0], b: pr[1], sub: OMC_PASS + ' clean changes in a minute', skill: true, count: p.best }, { at: p.at, best: null });
    });
    /* 3. technique and scale */
    needsOf(song, model).forEach(function (n) {
      var ex = 'x:tech:' + n;
      push({ id: ex, ex: ex, kind: 'tech', stage: 'technique', title: TECH[n].title, sub: 'Pass the drill at 80%', skill: true }, passOf(ix.by[ex], any));
    });
    if (song.scale && SCALES[song.scale.type] && scaleSong(song.scale.type, song.scale.root)) {
      var sx = 'x:scale:' + song.scale.type + ':' + song.scale.root, so = exercise(sx);
      push({ id: sx, ex: sx, kind: 'scale', stage: 'technique', title: so.title, sub: song.melody ? 'The notes the tune is made of' : 'For the fills and the solo', skill: true }, passOf(ix.by[sx], any));
    }
    /* 4. each part of the song, in time */
    var timed = model.timed, sigs = {}, parts = [];
    model.view.forEach(function (v, vi) {
      var sig = v.type === 'chords' ? v.cells.map(function (c) { return c.chords.map(function (x) { return x.name; }).join(' '); }).join('|') : 'tab' + vi;
      var n = v.last - v.first + 1;
      if (n < 2) return;
      if (sigs[sig]) { sigs[sig].names.push(v.name || 'Part'); return; }
      sigs[sig] = { view: vi, names: [v.name || 'Part'], n: n };
      parts.push(sigs[sig]);
    });
    if (parts.length > 1) parts.slice(0, 7).forEach(function (pt) {
      var base = pt.names.length > 1 ? pt.names[0].replace(/\s*(\d+|\(.*\))\s*$/, '') || pt.names[0] : pt.names[0];
      push({ id: 'part:' + pt.view, kind: 'part', stage: 'parts', title: base, view: pt.view, pct: PART_PCT, sub: timed ? 'In time at ' + PART_PCT + '% speed or faster, 80% right' : 'Start to finish, 80% right' },
        passOf(mine, function (x) { return pt.names.indexOf(x.section) >= 0 && (x.kind === 'take' || (x.kind === 'wait' ? !timed : (x.pct || 100) >= PART_PCT)); }));
    });
    /* 5. the song */
    var whole = function (pct) { return function (x) { return x.section === 'Whole song' && (x.kind === 'take' || (x.kind === 'wait' ? !timed : (x.pct || 100) >= pct)); }; };
    if (timed) push({ id: 'song:slow', kind: 'song', stage: 'song', title: 'The whole song, slowed down', view: -1, pct: SLOW_PCT, sub: 'Start to finish at ' + SLOW_PCT + '% speed, 80% right' }, passOf(mine, whole(SLOW_PCT)));
    push({ id: 'song:full', kind: 'song', stage: 'song', title: 'The whole song', view: -1, pct: 100, final: true, sub: timed ? 'Start to finish at full speed, 80% right' : 'Start to finish, 80% right' }, passOf(mine, whole(100)));
    return steps;
  }
  var STAGES = [['shapes', 'Shapes'], ['changes', 'Changes'], ['technique', 'Technique'], ['parts', 'Parts'], ['song', 'The song']];
  function of(song) {
    if (!song) return null;
    var ix = index(), ck = song.id + ':' + (song.updatedAt || 0) + ':' + (song.builtin ? 'b' : 'u') + ':' + (song.capo || 0) + ':' + (song.bpm || 0);
    if (pathCache[ck] && pathCache[ck].key === ix.key) return pathCache[ck].path;
    var steps = build(song), path = null;
    if (steps && steps.length) {
      var last = steps[steps.length - 1], mastered = last.done;
      var done = steps.filter(function (s) { return s.done; }).length;
      var next = null; for (var i = 0; i < steps.length; i++) if (!steps[i].done) { next = steps[i]; break; }
      path = { id: song.id, steps: steps, total: steps.length, done: mastered ? steps.length : done, real: done, mastered: mastered, masteredAt: last.at, next: mastered ? null : next,
        pct: mastered ? 100 : Math.round(done / steps.length * 100),
        stages: STAGES.map(function (sg) { return { id: sg[0], title: sg[1], steps: steps.filter(function (s) { return s.stage === sg[0]; }) }; }).filter(function (sg) { return sg.steps.length; }) };
    }
    pathCache[ck] = { key: ix.key, path: path };
    return path;
  }
  /* across the whole library: skills learned, songs finished, and the days on which a step was finished */
  var sumCache = null;
  function summary() {
    var ix = index(), songs = App.allSongs(), sk = songs.length + ':' + ix.key;
    if (sumCache && sumCache.sk === sk) return sumCache.sum;
    var skills = {}, days = {}, mastered = 0, steps = 0, known = {};
    songs.forEach(function (song) {
      var p = of(song); if (!p) return;
      if (p.mastered) mastered++;
      p.steps.forEach(function (st) {
        if (st.skill) known[st.id] = 1;
        if (!st.done) return;
        if (st.skill) skills[st.id] = 1; else steps++;
        days[App.dayKey(st.at)] = 1;
      });
    });
    var sum = { skills: Object.keys(skills).length, skillsOf: Object.keys(known).length, mastered: mastered, songs: songs.length, steps: steps + Object.keys(skills).length, days: days };
    sumCache = { sk: sk, sum: sum };
    return sum;
  }
  /* what a session just changed on a song's path: call before() first, then diff() after saving */
  function snap(songId) {
    var song = songId ? App.findSong(songId) : null, p = song ? of(song) : null;
    var done = {}; if (p) p.steps.forEach(function (s) { if (s.done) done[s.id] = 1; });
    return { id: songId, done: done, mastered: !!(p && p.mastered) };
  }
  function diff(before) {
    var song = before.id ? App.findSong(before.id) : null, p = song ? of(song) : null;
    if (!p) return null;
    var fresh = p.steps.filter(function (s) { return s.done && !before.done[s.id]; });
    return { song: song, path: p, steps: fresh, mastered: p.mastered && !before.mastered };
  }

  function passed(id) { return passOf(index().by[id], any); }
  App.path = { of: of, passed: passed, exercise: exercise, isExercise: isEx, summary: summary, snap: snap, diff: diff, TECH: TECH, SCALES: SCALES, scaleSong: scaleSong, needsOf: needsOf, PASS: PASS, OMC_PASS: OMC_PASS,
    reset: function () { idx = null; pathCache = {}; sumCache = null; } };
})(typeof window !== 'undefined' ? window : globalThis);

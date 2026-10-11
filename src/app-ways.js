/* app-ways.js: more ways to play a song than one strum a bar.

   A library song is a chord chart. From the chart and the chord shapes this file works out other parts to
   play over the same bars: the strumming pattern stroke by stroke, bass note and strum, a picked arpeggio,
   alternating-thumb fingerpicking, palm-muted power chords, a boogie shuffle, and a lead line that climbs
   through the notes of each chord. They are standard accompaniment patterns applied to the chords, made by
   rule; none of them is a transcription of what is played on the record.

   The recorded riff, solo or melody is the one part that is not made here. The player can paste a tab of it
   (song.lead), and it then becomes one more way to play the song. */
(function (root) {
  'use strict';
  var PR = root.PR, M = PR.music, App = PR.app;

  var WAYS = [
    { id: 'chords', name: 'Chords', short: 'one strum a chord', blurb: 'One strum for every chord. Start here: it is about landing each change on time.' },
    { id: 'strum', name: 'Strumming', short: 'the strumming pattern', blurb: 'The strumming pattern, stroke by stroke. White arrows are downstrokes, yellow ones upstrokes on the thin strings.' },
    { id: 'bass', name: 'Bass and strum', short: 'bass note, then strum', blurb: 'A bass note on the beat and the rest of the chord after it, the bass swapping between two strings. The backbone of roots rock and country.' },
    { id: 'arp', name: 'Arpeggio', short: 'picked one string at a time', blurb: 'Hold each chord down and pick its strings one at a time, bass note first. Let every note ring into the next.' },
    { id: 'thumb', name: 'Fingerpicking', short: 'alternating thumb', blurb: 'The thumb keeps time on two bass strings, back and forth, while index and middle fill in on the thin strings.' },
    { id: 'power', name: 'Power chords', short: 'driving eighth notes', blurb: 'Each chord cut down to two low strings and played in steady eighth notes. Rest the edge of the hand on the bridge for the chug.' },
    { id: 'boogie', name: 'Boogie shuffle', short: 'the rock and roll riff', blurb: 'The two-string rock and roll figure under every chord: the ring finger, then the little finger two frets higher.' },
    { id: 'lead', name: 'Lead line', short: 'notes that follow the chords', blurb: 'Single notes in one position up the neck: the root, third and fifth of each chord as it comes by. This is the skeleton a solo is built on.' },
    { id: 'tab', name: 'Your tab', short: 'the riff, solo or melody', blurb: 'The riff, solo or melody from the tab you pasted.' }
  ];
  var BY = {}; WAYS.forEach(function (w) { BY[w.id] = w; });

  function shapesOf(song) { return App.songShapes(song); }
  function hasChords(song) { return (song.sections || []).some(function (s) { return s && (s.type === 'chords' || (!s.type && s.bars)); }); }
  function barBeats(song) { return song.beatsPerSlot || song.beatsPerBar || 4; }
  function pattern(song) {
    var b = barBeats(song);
    if (M.strumSlots(song.strum, b)) return song.strum;
    return b === 3 ? 'D D DU' : b === 2 ? 'D  DDD' : b === 6 ? 'D  DU D  DU ' : 'D DU UDU';
  }
  /* three clicks to the beat (twelve-eight, six-eight): picked parts then go in threes */
  function inThrees(song) { var s = M.strumSlots(pattern(song), barBeats(song)); return !!s && (s.length / barBeats(song)) % 3 === 0; }

  /* ---------- one chord, as something to pick ---------- */
  function tk(k, f) { return (6 - k) + ':' + f; }
  function chordInfo(song, name, shapes) {
    var ch = M.parseChord(name);
    if (!ch) return null;
    var sh = M.shapeFor(ch, shapes);
    if (!sh) return { ch: ch, name: name, shape: null };
    var played = [], k;
    for (k = 0; k < 6; k++) if (sh[k] !== null) played.push(k);
    var low = played[0], open = M.tuningMidi(song.tuning || 'standard');
    /* the other bass note: the fifth of the chord if it is on one of the next two strings */
    var fifth = M.mod12(ch.root + 7), alt = -1;
    var has = function (c) { return sh[c] !== null && sh[c] !== undefined; };
    /* on a wound string where there is one (the thumb's side of the hand), the fifth before anything else */
    [low + 1, low + 2].forEach(function (c) { if (alt < 0 && c <= 2 && has(c) && M.mod12(open[c] + sh[c]) === fifth) alt = c; });
    [low + 2, low + 1].forEach(function (c) { if (alt < 0 && c <= 2 && has(c)) alt = c; });
    if (alt < 0) alt = has(low + 1) ? low + 1 : low;
    var near = function (want) { var best = played[played.length - 1]; played.forEach(function (p) { if (Math.abs(p - want) < Math.abs(best - want) || (Math.abs(p - want) === Math.abs(best - want) && p > best)) best = p; }); return best; };
    var top = played.filter(function (p) { return p >= Math.max(3, low + 1); });
    if (top.length < 2) top = played.slice(-3);
    /* when the second bass note is already on the third string, the fingers move one string over */
    var up = alt >= 3;
    return { ch: ch, name: name, shape: sh, played: played, low: low, alt: alt, s3: near(3), s2: near(4), s1: near(5), f3: up ? near(4) : near(3), f2: up ? near(5) : near(4), top: top };
  }
  function stack(info, strings, mark) { return strings.map(function (k) { return tk(k, info.shape[k]); }).join('+') + '@' + info.name + (mark || ''); }
  function power(info, stretch) {
    var r = info.ch.root, e = M.mod12(r - 4), a = M.mod12(r - 9), d = M.mod12(r - 2);
    var k = e <= a && e <= d ? 0 : (a <= d ? 1 : 2), f = k === 0 ? e : k === 1 ? a : d;
    return tk(k, f) + '+' + tk(k + 1, f + 2 + (stretch ? 2 : 0)) + '@' + M.pcName(r, info.ch.flats) + '5';
  }
  /* the notes of a chord inside one hand position on the four thin strings, lowest root first */
  function leadNotes(info, win, open) {
    var cand = [], k, f;
    for (k = 2; k < 6; k++) for (f = win.lo; f <= win.hi; f++) cand.push({ k: k, f: f, m: open[k] + f });
    cand.sort(function (x, y) { return x.m - y.m || y.k - x.k; });
    var pcs = info.ch.pcs, find = function (pc, above) { for (var i = 0; i < cand.length; i++) if (M.mod12(cand[i].m) === pc && cand[i].m > above) return cand[i]; return null; };
    var R = find(pcs[0], -1); if (!R) return null;
    /* leave room above the root for the rest of the chord */
    var R2 = find(pcs[0], R.m), T = find(pcs[1], R.m) || find(pcs[1], -1), V = find(pcs[2] === undefined ? pcs[0] : pcs[2], T ? Math.max(T.m, R.m) : R.m) || find(pcs[2] === undefined ? pcs[0] : pcs[2], -1);
    if (!T) T = R2 || R; if (!V) V = R2 || R;
    return { R: tk(R.k, R.f), T: tk(T.k, T.f), V: tk(V.k, V.f) };
  }

  /* ---------- a chart section turned into a picked part ---------- */
  var CYCLES = {
    bass: { 4: ['b', 'S', 'a', 'S'], 3: ['b', 'S', 'S'], tri: ['b', 'S', 'S', 'a', 'S', 'S'], unit: 1 },
    arp: { 4: ['b', '3', '2', '3', '1', '3', '2', '3'], 3: ['b', '3', '2', '1', '2', '3'], tri: ['b', '3', '2', '1', '2', '3'], unit: 0.5 },
    thumb: { 4: ['b', '3', 'a', '2', 'b', '1', 'a', '2'], 3: ['b', '3', 'a', '2', 'a', '3'], tri: ['b', '3', '2', 'a', '3', '2'], unit: 0.5 },
    power: { 4: ['P'], 3: ['P'], tri: ['P'], unit: 0.5 },
    boogie: { 4: ['P', 'P', 'Q', 'P'], 3: ['P', 'P', 'Q', 'P', 'P', 'P'], tri: ['P', 'P', 'Q'], unit: 0.5 },
    lead: { 4: ['R', 'T', 'V', 'T'], 3: ['R', 'T', 'V'], tri: ['R', 'T', 'V'], unit: 1 }
  };
  function fmt(n) { return String(Math.round(n * 1e9) / 1e9); }
  function picked(song, sec, way, ctx) {
    var B = barBeats(song), cyc = CYCLES[way], tri = ctx.tri, unit = way === 'bass' || way === 'lead' ? (tri && way === 'bass' ? 1 / 3 : 1) : (tri ? 1 / 3 : 0.5);
    var bars = (sec.bars || []).map(function (bar) {
      var names = M.splitBar(bar), cb = B / Math.max(1, names.length), out = [];
      names.forEach(function (nm) {
        var info = /^(n\.?c\.?|-|rest)$/i.test(nm) ? null : (ctx.info[nm] || (ctx.info[nm] = chordInfo(song, nm, ctx.shapes)));
        var n = Math.max(1, Math.round(cb / unit)), dur = cb / n, c = tri ? cyc.tri : (B === 3 ? cyc[3] : cyc[4]);
        if (!info || (!info.shape && way !== 'power' && way !== 'boogie' && way !== 'lead')) { out.push('r*' + fmt(cb)); return; }
        var ln = way === 'lead' ? (ctx.lead[nm] || (ctx.lead[nm] = leadNotes(info, ctx.win, ctx.open))) : null;
        if (way === 'lead' && !ln) { out.push('r*' + fmt(cb)); return; }
        if (way === 'bass' && n === 1) c = ['S'];
        for (var i = 0; i < n; i++) {
          var role = c[i % c.length], t;
          if (role === 'b') t = tk(info.low, info.shape[info.low]);
          else if (role === 'a') t = tk(info.alt, info.shape[info.alt]);
          else if (role === '3') { var k3 = way === 'thumb' ? info.f3 : info.s3; t = tk(k3, info.shape[k3]); }
          else if (role === '2') { var k2 = way === 'thumb' ? info.f2 : info.s2; t = tk(k2, info.shape[k2]); }
          else if (role === '1') t = tk(info.s1, info.shape[info.s1]);
          else if (role === 'S') t = stack(info, info.top, '↓').replace('@', '*' + fmt(dur) + '@');
          else if (role === 'P' || role === 'Q') t = power(info, role === 'Q').replace('@', '*' + fmt(dur) + '@');
          else t = ln[role];
          out.push(t.indexOf('*') >= 0 ? t : t + '*' + fmt(dur));
        }
      });
      return out.join(' ');
    });
    return { name: sec.name, type: 'notes', step: 1, steps: bars.join(' | '), repeat: sec.repeat };
  }

  /* ---------- the song, played one of these ways ---------- */
  var cache = {};
  function songAs(song, way) {
    if (!song || !way || way === 'chords') return song;
    var key = song.id + ':' + (song.updatedAt || 0) + ':' + (song.builtin ? 'b' : 'u') + ':' + way + ':' + (song.capo || 0) + ':' + (song.beatsPerSlot || 0) + ':' + (song.lead ? song.lead.at || 1 : 0);
    if (cache[key]) return cache[key];
    var out;
    if (way === 'tab') {
      if (!song.lead || !Array.isArray(song.lead.sections) || !song.lead.sections.length) return song;
      out = Object.assign({}, song, { sections: song.lead.sections, capo: song.lead.capo || 0, tuning: song.lead.tuning || 'standard', way: 'tab' });
    } else if (!BY[way] || !hasChords(song)) return song;
    else if (way === 'strum') {
      var pat = pattern(song);
      out = Object.assign({}, song, { way: 'strum', sections: song.sections.map(function (s) { return s.type === 'chords' || (!s.type && s.bars) ? Object.assign({}, s, { strum: pat }) : s; }) });
    } else {
      var open = M.tuningMidi(song.tuning || 'standard'), rootName = (song.scale && song.scale.root) || (M.parseChord(song.key || '') || {}).rootName || 'E';
      var pc = M.mod12(M.pcOf(rootName) - (song.capo || 0)), p = M.mod12(pc - 4);
      if (p > 8) p = M.mod12(pc - 9);
      var ctx = { shapes: shapesOf(song), info: {}, lead: {}, tri: inThrees(song), open: open, win: { lo: p === 0 ? 0 : p - 1, hi: p === 0 ? 4 : p + 3 } };
      out = Object.assign({}, song, { way: way, sections: song.sections.map(function (s) { return s.type === 'chords' || (!s.type && s.bars) ? picked(song, s, way, ctx) : s; }) });
    }
    cache[key] = out;
    return out;
  }
  /* which ways suit a song, in the order they are offered */
  function list(song) {
    if (!song || song.drill || song.exercise) return [];
    var out = [];
    if (hasChords(song)) {
      var B = barBeats(song), tri = inThrees(song), needs = song.needs || [], g = song.genre || '';
      var rock = /rock|wave/i.test(g) || needs.indexOf('power-chords') >= 0 || needs.indexOf('palm-mute') >= 0;
      out = ['chords', 'strum', 'bass', 'arp'];
      if (!tri && (B === 4 || B === 3)) out.push('thumb');
      if (rock) out.push('power');
      if (!tri && B === 4 && (/roots|blues/i.test(g) || needs.indexOf('shuffle') >= 0)) out.push('boogie');
      out.push('lead');
    }
    if (song.lead && Array.isArray(song.lead.sections) && song.lead.sections.length) out.push('tab');
    return out.map(function (id) { return BY[id]; });
  }
  /* the way the song is meant to be finished in: not one strum a bar */
  function main(song) {
    var ids = list(song).map(function (w) { return w.id; }), needs = song.needs || [];
    if (ids.indexOf('strum') < 0) return '';
    if (song.way && ids.indexOf(song.way) >= 0 && song.way !== 'chords') return song.way;
    if (needs.indexOf('travis') >= 0 && ids.indexOf('thumb') >= 0) return 'thumb';
    if (needs[0] === 'arpeggio') return 'arp';
    return 'strum';
  }

  App.ways = { WAYS: WAYS, by: BY, list: list, main: main, song: songAs, pattern: pattern, inThrees: inThrees, barBeats: barBeats };
})(typeof window !== 'undefined' ? window : globalThis);

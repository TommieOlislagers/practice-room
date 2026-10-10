/* app-core.js: state, storage, drills, statistics, small UI helpers. */
(function (root) {
  'use strict';
  var PR = root.PR, M = PR.music;
  var App = PR.app = {};

  /* ---------- helpers ---------- */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fmtDur(secs) {
    secs = Math.max(0, Math.round(secs));
    var m = Math.floor(secs / 60), s = secs % 60;
    return m + ':' + pad2(s);
  }
  function fmtMin(secs) { var m = secs / 60; return m >= 10 ? String(Math.round(m)) : (Math.round(m * 10) / 10).toString(); }
  function pct(v) { return Math.round(v * 100); }
  var WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDay(ms) { var d = new Date(ms); return WEEKDAY[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH[d.getMonth()]; }
  function ago(ms) {
    var diff = Date.now() - ms, day = 86400000;
    var today = dayKey(Date.now()), k = dayKey(ms);
    if (k === today) return 'today';
    if (k === dayKey(Date.now() - day)) return 'yesterday';
    if (diff < 7 * day) return Math.round(diff / day) + ' days ago';
    return fmtDay(ms);
  }

  var IC = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 17a8 8 0 0 1 16 0"/><path d="M12 17l4-6"/><circle cx="12" cy="17" r="1.3" fill="currentColor" stroke="none"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3.5 19h17z"/><path d="M12 10v4.5"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-3-3M19 16H5l3 3"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6.5" width="12" height="11" rx="2"/><path d="m15.5 10.5 5-3v9l-5-3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19l1-4L16.5 4.5l3 3L9 18z"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5H5v14h14v-5M13 5h6v6M19 5l-8 8"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 6-8 6zM18 6v12"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.4l2.95 6 6.6.95-4.78 4.66 1.13 6.58L12 17.5l-5.9 3.1 1.13-6.59L2.45 9.35l6.6-.95z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.6 2.2c.5 3.3 5 5.6 5 10.6a5.6 5.6 0 0 1-11.2 0c0-1.9.8-3.3 1.8-4.4.3 1.6 1 2.5 1.9 2.9-.5-3.300.4-6.600 2.500-9.100z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.4 2 5 13.6h5.4L9.6 22 19 9.8h-5.800z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3.500h10v5.200a5 5 0 0 1-4 4.900V17h3.200v3.500H7.800V17H11v-3.400a5 5 0 0 1-4-4.900z"/><path d="M5.600 5.200H3.200a3.600 3.600 0 0 0 3 4.400zM18.400 5.200h2.400a3.600 3.600 0 0 1-3 4.400z"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.500 10V7.500a4.500 4.500 0 0 1 9 0V10h.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm2 0h5V7.500a2.500 2.500 0 0 0-5 0z"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.500 4L12 5l4.500 7L21 8l-1.800 10H4.800z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 8h14l-3.500-3.500 1.400-1.400L22.800 9l-5.900 5.900-1.400-1.400L19 10H5zM19 16H5l3.500 3.500-1.400 1.400L1.200 15l5.900-5.900 1.400 1.400L5 14h14z" transform="scale(.82) translate(2.600 2.600)"/></svg>',
    github: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 19a5 5 0 0 1-.6-9.96 6 6 0 0 1 11.5 1.02A4.5 4.5 0 0 1 17.5 19z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
  };

  /* ---------- state ---------- */
  var S = App.S = {
    route: { name: 'today' },
    songs: {},
    sessions: [],
    settings: { a4: 440, tuning: 'standard', tones: true, countIn: true, click: true, trim: 0, goal: 10, guide: true },
    store: 'loading',
    canWrite: true,
    mic: { state: 'idle', pre: 'unknown', detail: '', why: '', framed: false, policy: null, perm: '', tried: false },
    filter: { level: 0, q: '' },
    hasSample: false
  };

  /* ---------- built-in drills: part of the page, not of the library ---------- */
  var DRILLS = [
    { id: 'd-open', title: 'Open strings, low to high and back', level: 1, bpm: 60, note: 'One pluck every two clicks. Let each string ring, then move on.',
      sections: [{ name: 'All six strings', type: 'notes', step: 2, steps: '6:0 5:0 4:0 3:0 | 2:0 1:0 2:0 3:0 | 4:0 5:0 6:0*4' }] },
    { id: 'd-chrom', title: 'One finger per fret', level: 1, bpm: 60, note: 'Frets 1 to 4 with fingers 1 to 4, one string at a time. Keep earlier fingers down.',
      sections: [{ name: 'Up the strings', type: 'notes', step: 1, steps: '6:1 6:2 6:3 6:4 | 5:1 5:2 5:3 5:4 | 4:1 4:2 4:3 4:4 | 3:1 3:2 3:3 3:4 | 2:1 2:2 2:3 2:4 | 1:1 1:2 1:3 1:4' }] },
    { id: 'd-cmaj', title: 'C major scale, open position', level: 1, bpm: 70, note: 'Say the note names as you go: C D E F G A B C.',
      sections: [{ name: 'Up and down', type: 'notes', step: 1, steps: '5:3 4:0 4:2 4:3 | 3:0 3:2 2:0 2:1 | 2:0 3:2 3:0 4:3 | 4:2 4:0 5:3*2' }] },
    { id: 'd-empent', title: 'E minor pentatonic, open position', level: 1, bpm: 70, note: 'The scale behind most rock riffs. Two notes on every string.',
      sections: [{ name: 'Up and down', type: 'notes', step: 1, steps: '6:0 6:3 5:0 5:2 | 4:0 4:2 3:0 3:2 | 2:0 2:3 1:0 1:3 | 1:0 2:3 2:0 3:2 | 3:0 4:2 4:0 5:2 | 5:0 6:3 6:0*2' }] },
    { id: 'd-first', title: 'First changes: Em, G, D, C', level: 1, bpm: 60, beatsPerSlot: 4, note: 'One strum on beat one, then use the other three beats to move.',
      sections: [{ name: 'Round and round', type: 'chords', bars: ['Em', 'G', 'D', 'C'], repeat: 4 }] },
    { id: 'd-withf', title: 'Changes with a barre: C, Am, F, G', level: 2, bpm: 60, beatsPerSlot: 4, note: 'F is the first full barre. Roll the index finger slightly onto its bony edge.',
      sections: [{ name: 'Round and round', type: 'chords', bars: ['C', 'Am', 'F', 'G'], repeat: 4 }] },
    { id: 'd-ampent', title: 'A minor pentatonic, fifth position', level: 2, bpm: 70, note: 'Index finger stays on fret 5. The first lead shape most players learn.',
      sections: [{ name: 'Up and down', type: 'notes', step: 1, steps: '6:5 6:8 5:5 5:7 | 4:5 4:7 3:5 3:7 | 2:5 2:8 1:5 1:8 | 1:5 2:8 2:5 3:7 | 3:5 4:7 4:5 5:7 | 5:5 6:8 6:5*2' }] },
    { id: 'd-power', title: 'Power chords: E5, G5, A5, D5', level: 2, bpm: 80, beatsPerSlot: 4, note: 'Only the two or three lowest strings of each shape. Mute the rest with the side of your index finger.',
      shapes: { G5: '355xxx', A5: '577xxx', D5: 'x577xx' },
      sections: [{ name: 'Round and round', type: 'chords', bars: ['E5', 'G5', 'A5', 'D5'], repeat: 4 }] },
    { id: 'd-barre', title: 'Barre walk: F#m, G#m, A, B', level: 3, bpm: 60, beatsPerSlot: 4, note: 'The same two shapes moved up the neck. Release pressure, slide, press.',
      shapes: { A: '577655', B: '799877' },
      sections: [{ name: 'Up the neck', type: 'chords', bars: ['F#m', 'G#m', 'A', 'B'], repeat: 4 }] }
  ];
  DRILLS.forEach(function (d) { d.drill = true; d.origin = 'drill'; d.checked = true; });

  function songShapes(song) {
    var out = {};
    if (Array.isArray(song.shapes)) song.shapes.forEach(function (x) { if (x && x.n && x.s) out[x.n] = x.s; });
    else if (song.shapes && typeof song.shapes === 'object') Object.keys(song.shapes).forEach(function (k) { out[k] = song.shapes[k]; });
    return out;
  }
  var modelCache = {};
  function modelOf(song) {
    var key = song.id + ':' + (song.updatedAt || 0) + ':' + (song.capo || 0) + ':' + (song.bpm || 0) + ':' + (song.beatsPerSlot || 0) + ':' + JSON.stringify(song.tuning || '');
    if (modelCache[song.id] && modelCache[song.id].key === key) return modelCache[song.id].model;
    var copy = Object.assign({}, song, { shapes: songShapes(song) });
    var model;
    try { model = M.buildSong(copy); } catch (e) { model = { song: copy, targets: [], view: [], chords: [], timed: false, feats: { tabNotes: 0, chords: 0 }, kind: 'chords', broken: true }; }
    modelCache[song.id] = { key: key, model: model };
    return model;
  }
  function allSongs() {
    var list = Object.keys(S.songs).map(function (id) { return S.songs[id]; });
    list.sort(function (a, b) { return (a.level || 1) - (b.level || 1) || String(a.title).localeCompare(String(b.title)); });
    return list;
  }
  function findSong(id) {
    if (S.songs[id]) return S.songs[id];
    for (var i = 0; i < DRILLS.length; i++) if (DRILLS[i].id === id) return DRILLS[i];
    return null;
  }

  /* ---------- storage: the artifact's database when there is one, this browser otherwise ---------- */
  var LS = { songs: 'pr.songs.v1', sessions: 'pr.sessions.v1', settings: 'pr.settings.v1', pending: 'pr.pending.v1', starters: 'pr.starters.v1', diag: 'pr.diag.v1', device: 'pr.device.v1',
    gone: 'pr.gone.v1', setAt: 'pr.settingsAt.v1', account: 'pr.account.v1', accountHide: 'pr.account.hide.v1' };
  function lsGet(k) { try { var v = root.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be unavailable */ } }
  function isFramed() { try { return root.self !== root.top; } catch (e) { return true; } }

  /* ---------- a short technical log ----------
     What this device allowed and how recordings were read. It is saved next to the songs, one document per
     device, so that when something does not work Claude can be asked to look instead of guessing. */
  var Diag = App.diag = {
    log: [], timer: null, device: '', kept: 'none', merged: false,
    /* The same phone and browser should land in the same document on every visit. Browser storage cannot be
       relied on for that (inside a frame it is often emptied between visits), so the name is made from what
       the browser says it is. */
    load: function () {
      var l = lsGet(LS.diag); if (Array.isArray(l)) Diag.log = l.slice(-40);
      var nav = root.navigator || {}, scr = root.screen || {};
      var txt = String(nav.userAgent || '') + '|' + (scr.width || 0) + 'x' + (scr.height || 0) + '|' + (nav.language || ''), h = 2166136261, i;
      for (i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      Diag.device = 'dev' + ('0000000' + h.toString(36)).slice(-7);
      /* does this view keep anything between visits? "none": storage refused, "new": nothing from before, "kept" */
      try { root.localStorage.setItem('pr.probe', '1'); Diag.kept = root.localStorage.getItem('pr.probe') !== '1' ? 'none' : (lsGet(LS.device) ? 'kept' : 'new'); lsSet(LS.device, Diag.device); } catch (e) { Diag.kept = 'none'; }
    },
    add: function (kind, detail) {
      Diag.log.push({ t: Date.now(), k: String(kind), d: String(detail === undefined || detail === null ? '' : detail).slice(0, 300) });
      if (Diag.log.length > 40) Diag.log.splice(0, Diag.log.length - 40);
      lsSet(LS.diag, Diag.log);
      Diag.push();
    },
    /* earlier visits, read back once from the database, go in front of this visit's entries */
    merge: function (old) {
      if (!Array.isArray(old)) return;
      var seen = {}, all = [];
      old.concat(Diag.log).forEach(function (e) { if (!e || typeof e.t !== 'number') return; var key = e.t + '|' + e.k + '|' + e.d; if (!seen[key]) { seen[key] = 1; all.push({ t: e.t, k: String(e.k), d: String(e.d || '').slice(0, 300) }); } });
      all.sort(function (a, b) { return a.t - b.t; });
      Diag.log = all.slice(-40);
    },
    /* one write a few seconds after the last entry, never one per entry */
    push: function () {
      clearTimeout(Diag.timer);
      Diag.timer = setTimeout(function () {
        var db = App.Store && App.Store.db;
        if (!db || !S.canWrite || !Diag.device) return;
        var ref = db.doc('diag/' + Diag.device);
        var write = function () {
          var nav = root.navigator || {};
          ref.set({ at: Date.now(), ua: String(nav.userAgent || '').slice(0, 300), lang: String(nav.language || ''), view: (root.innerWidth || 0) + 'x' + (root.innerHeight || 0), framed: isFramed(), log: Diag.log.slice(-40) }).catch(function () { /* the log is a nicety */ });
        };
        if (Diag.merged) { write(); return; }
        Diag.merged = true;
        ref.get().then(function (snap) { if (snap && snap.exists) { var d = snap.data(); Diag.merge(d && d.log); } }).catch(function () {}).then(write);
      }, 2500);
    },
    lines: function (n) {
      return Diag.log.slice(-(n || 8)).reverse().map(function (e) { var d = new Date(e.t); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' ' + e.k + (e.d ? ': ' + e.d : ''); });
    }
  };

  var Store = App.Store = {
    db: null,
    /* Saved while the database could not be reached. Kept apart from the cached copy of the database, so a
       fresh snapshot cannot wipe it, and sent the next time the database answers. */
    pending: { songs: {}, gone: {}, sessions: [] },
    cloudSongs: null, cloudSessions: null, flushing: false,
    /* For the copy that saves to the player's own account (app-account.js): when each song was deleted and when
       the settings last changed, so two devices can tell which side is newer. */
    gone: {}, settingsAt: 0,
    /* how many sessions are kept on the device: the database hands over 500, a browser on its own keeps more */
    cap: function () { return Store.db ? 500 : 2000; },
    changed: function (what) { if (App.acct) App.acct.touch(what); },
    loadLocal: function () {
      var songs = lsGet(LS.songs), sessions = lsGet(LS.sessions), settings = lsGet(LS.settings), pend = lsGet(LS.pending), gone = lsGet(LS.gone);
      if (gone && typeof gone === 'object') Store.gone = gone;
      /* settings changed before changes were timed still count as changed, just long ago */
      Store.settingsAt = +lsGet(LS.setAt) || (settings && typeof settings === 'object' ? 1 : 0);
      if (songs && typeof songs === 'object') S.songs = songs;
      if (Array.isArray(sessions)) S.sessions = sessions;
      if (settings && typeof settings === 'object') Object.assign(S.settings, settings);
      if (pend && typeof pend === 'object') {
        if (pend.songs && typeof pend.songs === 'object') Store.pending.songs = pend.songs;
        if (pend.gone && typeof pend.gone === 'object') Store.pending.gone = pend.gone;
        if (Array.isArray(pend.sessions)) Store.pending.sessions = pend.sessions.filter(function (x) { return x && x.id; });
      }
    },
    keep: function () { lsSet(LS.pending, Store.pending); },
    /* No database in this view and nothing saved in this browser yet: start with the songs the page ships with. */
    starters: function () {
      if (Object.keys(S.songs).length || lsGet(LS.starters) || !PR.starters) return;
      Object.keys(PR.starters).forEach(function (id) { S.songs[id] = Object.assign({ id: id }, PR.starters[id]); });
      lsSet(LS.songs, S.songs); lsSet(LS.starters, 1);
    },
    /* what the database holds, plus what is still waiting to be sent */
    mergeSongs: function () {
      var next = Object.assign({}, Store.cloudSongs || {}), p = Store.pending;
      Object.keys(p.songs).forEach(function (id) { if (!next[id] || (next[id].updatedAt || 0) < (p.songs[id].updatedAt || 0)) next[id] = Object.assign({ id: id }, p.songs[id]); });
      Object.keys(p.gone).forEach(function (id) { delete next[id]; });
      S.songs = next; lsSet(LS.songs, next);
    },
    mergeSessions: function () {
      var list = (Store.cloudSessions || []).slice(), have = {};
      list.forEach(function (x) { have[x.id] = 1; });
      var extra = Store.pending.sessions.filter(function (x) { return !have[x.id]; });
      if (extra.length) { list = list.concat(extra); list.sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); }
      S.sessions = list.slice(0, 500); lsSet(LS.sessions, S.sessions);
    },
    /* Send what was saved offline, one write at a time. Runs once the database has shown what it holds. */
    flush: function () {
      var db = Store.db, p = Store.pending;
      if (!db || Store.flushing || !S.canWrite) return;
      var jobs = [];
      Object.keys(p.songs).forEach(function (id) {
        var mine = p.songs[id], theirs = Store.cloudSongs && Store.cloudSongs[id];
        if (theirs && (theirs.updatedAt || 0) >= (mine.updatedAt || 0)) { delete p.songs[id]; return; }
        jobs.push(function () { return db.doc('songs/' + id).set(mine).then(function () { if (p.songs[id] === mine) delete p.songs[id]; }); });
      });
      Object.keys(p.gone).forEach(function (id) {
        if (Store.cloudSongs && !Store.cloudSongs[id]) { delete p.gone[id]; return; }
        jobs.push(function () { return db.doc('songs/' + id).delete().then(function () { delete p.gone[id]; }); });
      });
      p.sessions.slice().forEach(function (sess) {
        jobs.push(function () {
          var doc = Object.assign({}, sess); delete doc.id;
          return db.doc('sessions/' + sess.id).set(doc).then(function () { p.sessions = p.sessions.filter(function (x) { return x.id !== sess.id; }); });
        });
      });
      Store.keep();
      if (!jobs.length) return;
      Store.flushing = true;
      var sent = 0;
      (function next() {
        var job = jobs.shift();
        if (!job || !Store.db) { Store.flushing = false; Store.keep(); if (sent) Diag.add('sync', sent + ' saved while offline, sent now'); return; }
        job().then(function () { sent++; Store.keep(); next(); }, function (e) {
          Store.flushing = false; Store.keep();
          Diag.add('sync', 'stopped after ' + sent + ': ' + ((e && (e.code || e.message)) || 'error'));
          if (e && e.code === 'invalid_argument') S.canWrite = false;
        });
      })();
    },
    init: function () {
      Store.loadLocal();
      Diag.load();
      var cl = root.claude;
      if (!cl || typeof cl.use !== 'function') { S.store = 'local'; Store.starters(); return Promise.resolve(); }
      var waitDb = cl.use('db').then(function (db) {
        if (!db) { S.store = 'local'; Store.starters(); App.render(); return; }
        Store.db = db;
        S.store = 'cloud';
        Diag.push();
        var first = true;
        db.collection('songs').onSnapshot(function (snap) {
          var next = {};
          snap.docs.forEach(function (d) { var v = d.data(); if (v) { v = Object.assign({}, v); v.id = d.id; next[d.id] = v; } });
          Store.cloudSongs = next;
          if (first) { first = false; Store.flush(); }
          Store.mergeSongs();
          App.render();
        }, function () { Store.fail(); });
        db.collection('sessions').orderBy('at', 'desc').limit(500).onSnapshot(function (snap) {
          Store.cloudSessions = snap.docs.map(function (d) { var v = Object.assign({}, d.data()); v.id = d.id; return v; });
          Store.mergeSessions();
          App.render();
        }, function () { Store.fail(); });
        db.doc('meta/settings').onSnapshot(function (snap) {
          if (snap.exists) { Object.assign(S.settings, snap.data()); lsSet(LS.settings, S.settings); App.render(); }
        }, function () { /* settings stay local */ });
        App.render();
      }).catch(function () { S.store = 'local'; Store.starters(); App.render(); });
      cl.use('sample').then(function (fn) { S.hasSample = !!fn; App.sample = fn || null; if (S.route.name === 'songs') App.render(); }).catch(function () {});
      cl.use('user').then(function (u) {
        if (!u) return;
        u.can('data.write').then(function (ok) { if (ok === false) { S.canWrite = false; App.render(); } });
      }).catch(function () {});
      return waitDb;
    },
    fail: function () { if (S.store === 'cloud') { S.store = 'local'; Store.db = null; Diag.add('data', 'lost the link to the database'); App.toast('Lost the link to your saved data. Changes stay on this device and are sent next time.'); App.render(); } },
    /* A write was refused. Rules and limits will refuse it again, so say so; anything else is kept and sent later. */
    writeErr: function (e, keep) {
      var code = e && e.code;
      Diag.add('save', 'refused: ' + (code || (e && e.message) || 'error'));
      if (code === 'invalid_argument') { S.canWrite = false; App.toast('This view cannot save changes.'); }
      else if (code === 'quota_exceeded') App.toast('Storage is full. Delete old songs to make room.');
      else { if (keep) { keep(); Store.keep(); } App.toast('Saved on this device. It is sent to your account next time.'); }
      App.render();
    },
    saveSong: function (song) {
      var id = song.id || uid('s');
      var doc = Object.assign({}, song);
      delete doc.id; delete doc.drill;
      doc.updatedAt = Date.now();
      if (!doc.createdAt) doc.createdAt = doc.updatedAt;
      S.songs[id] = Object.assign({ id: id }, doc);
      lsSet(LS.songs, S.songs);
      if (Store.gone[id]) { delete Store.gone[id]; lsSet(LS.gone, Store.gone); }
      var p = Store.pending, later = function () { p.songs[id] = doc; delete p.gone[id]; };
      if (Store.db) Store.db.doc('songs/' + id).set(doc).catch(function (e) { Store.writeErr(e, later); });
      else { later(); Store.keep(); }
      Store.changed('song');
      return id;
    },
    deleteSong: function (id) {
      delete S.songs[id];
      lsSet(LS.songs, S.songs);
      Store.gone[id] = Date.now(); lsSet(LS.gone, Store.gone);
      var p = Store.pending, later = function () { delete p.songs[id]; p.gone[id] = 1; };
      if (Store.db) Store.db.doc('songs/' + id).delete().catch(function (e) { Store.writeErr(e, later); });
      else { later(); Store.keep(); }
      Store.changed('song');
    },
    addSession: function (sess) {
      var id = uid('p');
      var doc = Object.assign({ at: Date.now() }, sess);
      var mine = Object.assign({ id: id }, doc);
      S.sessions.unshift(mine);
      if (S.sessions.length > Store.cap()) S.sessions.length = Store.cap();
      lsSet(LS.sessions, S.sessions);
      var p = Store.pending, later = function () { p.sessions.push(mine); if (p.sessions.length > 500) p.sessions.splice(0, p.sessions.length - 500); };
      if (Store.db) Store.db.doc('sessions/' + id).set(doc).catch(function (e) { Store.writeErr(e, later); });
      else { later(); Store.keep(); }
      Store.changed('session');
      return id;
    },
    saveSettings: function () {
      lsSet(LS.settings, S.settings);
      Store.settingsAt = Date.now(); lsSet(LS.setAt, Store.settingsAt);
      if (Store.db) Store.db.doc('meta/settings').set(Object.assign({}, S.settings)).catch(function () {});
      Store.changed('settings');
    }
  };

  /* ---------- statistics ---------- */
  function computeStats() {
    var now = Date.now(), day = 86400000;
    var days = {}, bySong = {}, pairs = {};
    var sessions = S.sessions;
    sessions.forEach(function (s) {
      var k = dayKey(s.at);
      var d = days[k] || (days[k] = { secs: 0, n: 0, acc: [] });
      d.secs += s.secs || 0; d.n++;
      if (typeof s.acc === 'number') d.acc.push(s.acc);
      var b = bySong[s.song] || (bySong[s.song] = { n: 0, last: 0, list: [], secs: 0 });
      b.n++; b.secs += s.secs || 0; if (s.at > b.last) b.last = s.at; b.list.push(s);
      (s.changes || []).forEach(function (c) {
        if (!c || !c.f || !c.t || typeof c.s !== 'number') return;
        var pk = c.f + ' → ' + c.t;
        var p = pairs[pk] || (pairs[pk] = { from: c.f, to: c.t, vals: [], song: s.song, at: 0, best: 0 });
        if (p.vals.length < 12) p.vals.push(c.s);
        if (s.at > p.at) { p.at = s.at; p.song = s.song; }
      });
      if (s.kind === 'omc' && s.pair && typeof s.count === 'number') {
        var ok = s.pair[0] + ' → ' + s.pair[1];
        var po = pairs[ok] || (pairs[ok] = { from: s.pair[0], to: s.pair[1], vals: [], song: s.song, at: s.at, best: 0 });
        if (s.count > po.best) po.best = s.count;
      }
    });
    /* streak: consecutive days with practice, counting back from today, or from yesterday if today is still empty */
    var streak = 0, cursor = now;
    if (!days[dayKey(cursor)]) cursor -= day;
    while (days[dayKey(cursor)]) { streak++; cursor -= day; }
    /* this week, from Monday */
    var d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    var monday = d0.getTime() - ((d0.getDay() + 6) % 7) * day;
    var weekSecs = 0, weekN = 0;
    sessions.forEach(function (s) { if (s.at >= monday) { weekSecs += s.secs || 0; weekN++; } });
    function meanAcc(from, to) {
      var vals = sessions.filter(function (s) { return s.at >= from && s.at < to && typeof s.acc === 'number'; }).map(function (s) { return s.acc; });
      if (!vals.length) return null;
      return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    }
    var acc7 = meanAcc(now - 7 * day, now + 1), accPrev = meanAcc(now - 14 * day, now - 7 * day);
    var last14 = [];
    for (var i = 13; i >= 0; i--) {
      var t = d0.getTime() - i * day, k = dayKey(t), dd = days[k];
      last14.push({ t: t, key: k, secs: dd ? dd.secs : 0, n: dd ? dd.n : 0 });
    }
    Object.keys(bySong).forEach(function (id) {
      var b = bySong[id];
      b.list.sort(function (x, y) { return y.at - x.at; });
      var scored = b.list.filter(function (s) { return typeof s.acc === 'number'; }).slice(0, 3);
      b.recent = scored.length ? scored.reduce(function (a, s) { return a + s.acc; }, 0) / scored.length : null;
      var strong = scored.filter(function (s) { return s.acc >= 0.9 && (s.pct || 100) >= 90; }).length;
      b.status = strong >= 2 ? 'solid' : 'learning';
    });
    var slow = Object.keys(pairs).map(function (k) {
      var p = pairs[k];
      p.key = k;
      p.mean = p.vals.length ? p.vals.reduce(function (a, b) { return a + b; }, 0) / p.vals.length : null;
      return p;
    }).filter(function (p) { return p.mean !== null && p.vals.length >= 2 && p.mean >= 0.6; }).sort(function (a, b) { return b.mean - a.mean; });
    return { days: days, bySong: bySong, pairs: pairs, slow: slow, streak: streak, weekSecs: weekSecs, weekN: weekN, acc7: acc7, accPrev: accPrev, last14: last14, total: sessions.length };
  }
  function songStatus(stats, id) {
    var b = stats.bySong[id];
    if (!b) return { key: 'new', label: 'New', cls: '' , recent: null, last: 0 };
    if (b.status === 'solid') return { key: 'solid', label: 'Solid', cls: 'pill-good', recent: b.recent, last: b.last };
    return { key: 'learning', label: 'Learning', cls: 'pill-accent', recent: b.recent, last: b.last };
  }

  /* ---------- the game layer ----------
     Everything here is worked out from the session log, so it is the same on every device and nothing
     extra has to be stored: experience points, the player's level, stars per song, daily quests, badges. */
  var TITLES = ['First Strings', 'Open-Chord Strummer', 'Rhythm Keeper', 'Barre Breaker', 'Riff Runner', 'Fretboard Explorer', 'Stage Ready', 'Headliner', 'Virtuoso', 'Legend'];
  function starsFor(acc, pct, self) {
    if (typeof acc !== 'number') return 0;
    var n = acc >= 0.95 && (pct || 100) >= 90 ? 3 : acc >= 0.8 ? 2 : acc >= 0.6 ? 1 : 0;
    return self ? Math.min(n, 2) : n;                    /* a run nobody listened to cannot earn the third star */
  }
  /* points for a list of results in playing order: 100 for a clean hit, 50 for a late one, times a
     multiplier that climbs one step for every 8 in a row (up to x4) and drops back on a miss */
  function scoreItems(items) {
    var score = 0, combo = 0, best = 0;
    items.forEach(function (it) {
      var ok = it.status === 'hit' || it.status === 'late';
      if (!ok) { combo = 0; return; }
      combo++; if (combo > best) best = combo;
      score += (it.status === 'hit' ? 100 : 50) * multOf(combo);
    });
    return { score: score, combo: best };
  }
  function multOf(combo) { return 1 + Math.min(3, Math.floor(combo / 8)); }
  function xpOfSession(x) {
    var xp = Math.round(Math.min(x.secs || 0, 1800) / 6);
    if (x.kind === 'omc') return xp + 20 + Math.min(60, x.count || 0);
    if (typeof x.acc === 'number') {
      if (x.total) xp += Math.min(300, (x.hits || 0) * 2);
      xp += x.acc >= 0.95 ? 60 : x.acc >= 0.8 ? 35 : x.acc >= 0.6 ? 15 : 0;
    }
    return xp;
  }
  function questsOf(day, t) {
    var goal = (S.settings.goal || 10) * 60, third = new Date(t).getDay() % 3;
    var list = day ? day.list : [];
    var songs = {}; list.forEach(function (x) { if (x.song) songs[x.song] = 1; });
    var q = [
      { id: 'time', label: 'Practise for ' + (S.settings.goal || 10) + ' minutes', done: !!day && day.secs >= goal, part: day ? Math.min(1, day.secs / goal) : 0 },
      { id: 'score', label: 'Score 80% or better on a run', done: list.some(function (x) { return !x.self && typeof x.acc === 'number' && x.acc >= 0.8 && x.kind !== 'omc'; }) },
      third === 0 ? { id: 'omc', label: 'Do a one-minute change drill', done: list.some(function (x) { return x.kind === 'omc'; }) } :
      third === 1 ? { id: 'two', label: 'Practise two different songs or drills', done: Object.keys(songs).length >= 2 } :
        { id: 'three', label: 'Finish three sessions', done: list.length >= 3 }
    ];
    q.forEach(function (x) { x.xp = 40; });
    return q;
  }
  var BADGES = [
    { id: 'first', name: 'First Session', desc: 'Log your first practice', icon: 'play' },
    { id: 'streak3', name: 'Three in a Row', desc: 'Practise 3 days running', icon: 'flame' },
    { id: 'streak7', name: 'Full Week', desc: 'Practise 7 days running', icon: 'flame' },
    { id: 'streak30', name: 'Habit', desc: 'Practise 30 days running', icon: 'flame' },
    { id: 'star1', name: 'First Star', desc: 'Earn a star on any song', icon: 'star' },
    { id: 'star3', name: 'Three Stars', desc: 'Earn all three on one song', icon: 'star' },
    { id: 'stars10', name: 'Collector', desc: 'Earn 10 stars in total', icon: 'star' },
    { id: 'perfect', name: 'Flawless', desc: 'A run of 8 or more with no misses', icon: 'target' },
    { id: 'combo25', name: 'On a Roll', desc: 'Hit 25 in a row', icon: 'bolt' },
    { id: 'omc30', name: 'Quick Change', desc: '30 chord changes in a minute', icon: 'swap' },
    { id: 'omc60', name: 'Lightning Hands', desc: '60 chord changes in a minute', icon: 'swap' },
    { id: 'hour1', name: 'An Hour In', desc: 'One hour of practice in all', icon: 'clock' },
    { id: 'hour10', name: 'Ten Hours', desc: 'Ten hours of practice in all', icon: 'clock' },
    { id: 'quests', name: 'Full House', desc: 'All three quests in one day', icon: 'check' },
    { id: 'level5', name: 'Level 5', desc: 'Reach player level 5', icon: 'crown' }
  ];
  function computeGame() {
    var now = Date.now(), dayMs = 86400000, sessions = S.sessions;
    var days = {}, songs = {}, xp = 0, total = 0, bestCombo = 0, perfect = false, omcBest = 0;
    sessions.forEach(function (x) {
      var k = dayKey(x.at), d = days[k] || (days[k] = { secs: 0, list: [], t: x.at });
      d.secs += x.secs || 0; d.list.push(x);
      total += x.secs || 0; xp += xpOfSession(x);
      if ((x.combo || 0) > bestCombo) bestCombo = x.combo;
      if (x.kind === 'omc') { if ((x.count || 0) > omcBest) omcBest = x.count; return; }
      if (!x.self && x.acc === 1 && (x.total || 0) >= 8) perfect = true;
      if (!x.song) return;
      var g = songs[x.song] || (songs[x.song] = { stars: 0, best: null, score: 0, plays: 0 });
      g.plays++;
      var st = starsFor(x.acc, x.pct, x.self); if (st > g.stars) g.stars = st;
      if (typeof x.acc === 'number' && (g.best === null || x.acc > g.best)) g.best = x.acc;
      if ((x.score || 0) > g.score) g.score = x.score;
    });
    var fullDay = false;
    Object.keys(days).forEach(function (k) {
      var q = questsOf(days[k], days[k].t), n = q.filter(function (x) { return x.done; }).length;
      xp += n * 40 + (n === 3 ? 60 : 0); if (n === 3) fullDay = true;
    });
    /* level: 250 points for the first, 250 more for each one after */
    var level = 1, into = xp, need = 250;
    while (into >= need) { into -= need; level++; need = 250 * level; }
    /* streaks */
    var streak = 0, cur = now; if (!days[dayKey(cur)]) cur -= dayMs;
    while (days[dayKey(cur)]) { streak++; cur -= dayMs; }
    var keys = Object.keys(days).sort(), bestStreak = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      var t = new Date(k + 'T12:00:00').getTime();
      run = prev !== null && Math.round((t - prev) / dayMs) === 1 ? run + 1 : 1; prev = t;
      if (run > bestStreak) bestStreak = run;
    });
    var starsTotal = 0, three = false; Object.keys(songs).forEach(function (id) { starsTotal += songs[id].stars; if (songs[id].stars === 3) three = true; });
    var today = days[dayKey(now)] || null, quests = questsOf(today, now), qDone = quests.filter(function (x) { return x.done; }).length;
    /* this week, Monday first */
    var d0 = new Date(now); d0.setHours(12, 0, 0, 0);
    var monday = d0.getTime() - ((d0.getDay() + 6) % 7) * dayMs, week = [];
    for (var i = 0; i < 7; i++) { var t = monday + i * dayMs, k = dayKey(t); week.push({ label: 'MTWTFSS'.charAt(i), done: !!days[k], today: k === dayKey(now), future: t > now && k !== dayKey(now) }); }
    var got = { first: sessions.length > 0, streak3: bestStreak >= 3, streak7: bestStreak >= 7, streak30: bestStreak >= 30, star1: starsTotal >= 1, star3: three, stars10: starsTotal >= 10,
      perfect: perfect, combo25: bestCombo >= 25, omc30: omcBest >= 30, omc60: omcBest >= 60, hour1: total >= 3600, hour10: total >= 36000, quests: fullDay, level5: level >= 5 };
    return { xp: xp, level: level, title: TITLES[Math.min(level, TITLES.length) - 1], into: into, need: need, songs: songs, starsTotal: starsTotal,
      streak: streak, bestStreak: bestStreak, week: week, totalSecs: total, sessions: sessions.length,
      today: { secs: today ? today.secs : 0, goal: (S.settings.goal || 10) * 60, quests: quests, done: qDone },
      badges: BADGES.map(function (b) { return { id: b.id, name: b.name, desc: b.desc, icon: b.icon, got: !!got[b.id] }; }) };
  }
  function starsHtml(n, cls) {
    var h = '<span class="stars' + (cls ? ' ' + cls : '') + '" role="img" aria-label="' + n + ' of 3 stars">';
    for (var i = 0; i < 3; i++) h += IC.star.replace('<svg', '<svg' + (i < n ? ' class="on"' : ''));
    return h + '</span>';
  }
  /* a short burst of paper for the big moments */
  App.confetti = function () {
    var cv = $('#fx'); if (!cv || !cv.getContext) return;
    try { if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { /* ignore */ }
    var dpr = Math.min(2, root.devicePixelRatio || 1), W = root.innerWidth, H = root.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.hidden = false;
    var g = cv.getContext('2d'), cols = ['#ffd60a', '#ff9f0a', '#30d158', '#0a84ff', '#bf5af2', '#ff375f'], bits = [], i;
    for (i = 0; i < 110; i++) bits.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.5, y: H * 0.32, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 13 - 3, r: Math.random() * 6 + 4, a: Math.random() * 6.3, va: (Math.random() - 0.5) * 0.5, c: cols[i % cols.length] });
    var t0 = Date.now();
    (function frame() {
      var age = Date.now() - t0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      if (age > 2600) { cv.hidden = true; return; }
      g.globalAlpha = age > 2000 ? 1 - (age - 2000) / 600 : 1;
      bits.forEach(function (b) { b.vy += 0.42; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.a += b.va; g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.fillStyle = b.c; g.fillRect(-b.r / 2, -b.r / 3, b.r, b.r * 0.66); g.restore(); });
      (root.requestAnimationFrame || setTimeout)(frame, 16);
    })();
  };

  /* ---------- toast and sheet ---------- */
  var toastTimer = null;
  App.toast = function (msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3600);
  };
  App.sheet = {
    open: function (html, onClose) {
      var wrap = $('#sheet');
      $('#sheetBody').innerHTML = html;
      wrap.hidden = false;
      App.sheet.onClose = onClose || null;
      var f = $('#sheetBody [autofocus]'); if (f) { try { f.focus(); } catch (e) { /* ignore */ } }
    },
    close: function () {
      var wrap = $('#sheet');
      if (wrap.hidden) return;
      wrap.hidden = true;
      $('#sheetBody').innerHTML = '';
      var cb = App.sheet.onClose; App.sheet.onClose = null;
      if (cb) cb();
    },
    isOpen: function () { return !$('#sheet').hidden; }
  };

  App.esc = esc; App.$ = $; App.$all = $all; App.clamp = clamp; App.uid = uid; App.IC = IC; App.ls = { get: lsGet, set: lsSet }; App.LS = LS; App.isFramed = isFramed; App.pad2 = pad2; App.MONTH = MONTH;
  App.fmtDur = fmtDur; App.fmtMin = fmtMin; App.pct = pct; App.fmtDay = fmtDay; App.ago = ago; App.dayKey = dayKey; App.WEEKDAY = WEEKDAY;
  App.DRILLS = DRILLS; App.modelOf = modelOf; App.allSongs = allSongs; App.findSong = findSong; App.songShapes = songShapes;
  App.computeStats = computeStats; App.songStatus = songStatus;
  App.computeGame = computeGame; App.starsFor = starsFor; App.scoreItems = scoreItems; App.multOf = multOf; App.starsHtml = starsHtml; App.xpOfSession = xpOfSession;
})(typeof window !== 'undefined' ? window : globalThis);

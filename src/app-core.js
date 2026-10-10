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
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
  };

  /* ---------- state ---------- */
  var S = App.S = {
    route: { name: 'today' },
    songs: {},
    sessions: [],
    settings: { a4: 440, tuning: 'standard', tones: true, countIn: true, click: true, trim: 0 },
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
  var LS = { songs: 'pr.songs.v1', sessions: 'pr.sessions.v1', settings: 'pr.settings.v1', pending: 'pr.pending.v1', starters: 'pr.starters.v1', diag: 'pr.diag.v1', device: 'pr.device.v1' };
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
    loadLocal: function () {
      var songs = lsGet(LS.songs), sessions = lsGet(LS.sessions), settings = lsGet(LS.settings), pend = lsGet(LS.pending);
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
      var p = Store.pending, later = function () { p.songs[id] = doc; delete p.gone[id]; };
      if (Store.db) Store.db.doc('songs/' + id).set(doc).catch(function (e) { Store.writeErr(e, later); });
      else { later(); Store.keep(); }
      return id;
    },
    deleteSong: function (id) {
      delete S.songs[id];
      lsSet(LS.songs, S.songs);
      var p = Store.pending, later = function () { delete p.songs[id]; p.gone[id] = 1; };
      if (Store.db) Store.db.doc('songs/' + id).delete().catch(function (e) { Store.writeErr(e, later); });
      else { later(); Store.keep(); }
    },
    addSession: function (sess) {
      var id = uid('p');
      var doc = Object.assign({ at: Date.now() }, sess);
      var mine = Object.assign({ id: id }, doc);
      S.sessions.unshift(mine);
      if (S.sessions.length > 500) S.sessions.length = 500;
      lsSet(LS.sessions, S.sessions);
      var p = Store.pending, later = function () { p.sessions.push(mine); if (p.sessions.length > 500) p.sessions.splice(0, p.sessions.length - 500); };
      if (Store.db) Store.db.doc('sessions/' + id).set(doc).catch(function (e) { Store.writeErr(e, later); });
      else { later(); Store.keep(); }
      return id;
    },
    saveSettings: function () {
      lsSet(LS.settings, S.settings);
      if (Store.db) Store.db.doc('meta/settings').set(Object.assign({}, S.settings)).catch(function () {});
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

  App.esc = esc; App.$ = $; App.$all = $all; App.clamp = clamp; App.uid = uid; App.IC = IC; App.ls = { get: lsGet, set: lsSet }; App.isFramed = isFramed;
  App.fmtDur = fmtDur; App.fmtMin = fmtMin; App.pct = pct; App.fmtDay = fmtDay; App.ago = ago; App.dayKey = dayKey; App.WEEKDAY = WEEKDAY;
  App.DRILLS = DRILLS; App.modelOf = modelOf; App.allSongs = allSongs; App.findSong = findSong; App.songShapes = songShapes;
  App.computeStats = computeStats; App.songStatus = songStatus;
})(typeof window !== 'undefined' ? window : globalThis);

/* app-library.js: the Songs tab (artists, genres, levels), pictures, the path card and its steps,
   the goal on Today, and the metronome. */
(function (root) {
  'use strict';
  var PR = root.PR, M = PR.music, App = PR.app, S = App.S, esc = App.esc, IC = App.IC, $ = App.$, $all = App.$all;
  var LEVELS = M.LEVELS, PICS = PR.pictures || {};

  /* ---------- pictures ----------
     Every song and artist has a drawn tile. Where a freely licensed photograph of the artist is known
     (seed/pictures.json, all from Wikimedia Commons, credited in Settings), it is laid over the tile.
     If the photograph cannot be loaded the tile underneath is what shows. */
  var failed = {};
  function tone(str) { var h = 7, i; for (i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }
  function initials(name) {
    var w = String(name).replace(/^the\s+/i, '').split(/[\s-]+/).filter(Boolean);
    return (w.length === 1 ? w[0].slice(0, 2) : w.slice(0, 3).map(function (x) { return x.charAt(0); }).join('')).toUpperCase();
  }
  var TRI = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M24 7.5 32.2 21.7H15.8zM15.2 23 23.4 37.2H7zM32.8 23 41 37.2H24.6z"/></svg>';
  function isGame(x) { return x.genre === 'Game music' || /zelda/i.test(x.artist || ''); }
  function picUrl(artist, w) {
    var p = PICS[artist];
    if (!p || !p.file) return '';
    return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(p.file) + '?width=' + (w || 320);
  }
  App.art = function (x, cls, w) {
    var artist = x.artist || '', game = isGame(x), own = x.exercise || x.drill;
    var hue = game ? 150 : own ? 248 : tone(artist || x.title || 'song');
    var inner = game ? TRI : own ? IC.hand : artist ? '<b>' + esc(initials(artist)) + '</b>' : IC.note;
    var url = w === 0 ? '' : picUrl(artist, w), pos = url && PICS[artist].pos ? ' style="object-position:' + esc(PICS[artist].pos) + '"' : '';
    return '<span class="art' + (cls ? ' ' + cls : '') + (game ? ' art-game' : '') + '" style="--h:' + hue + '" aria-hidden="true">' + inner +
      (url && !failed[url] ? '<img class="art-img" src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer"' + pos + '>' : '') + '</span>';
  };
  App.artFailed = function (img) { var u = img.getAttribute('src'); if (u) failed[u] = 1; if (img.parentNode) img.parentNode.removeChild(img); };
  App.pictures = PICS;

  /* ---------- small pieces ---------- */
  function ringHtml(p) {
    var r = 17, c = 2 * Math.PI * r, part = p ? p.pct / 100 : 0;
    return '<span class="pring' + (p && p.mastered ? ' is-done' : '') + '" role="img" aria-label="' + (p ? p.done + ' of ' + p.total + ' steps' : 'No steps') + '"><svg viewBox="0 0 40 40"><circle class="track" cx="20" cy="20" r="' + r + '"/><circle class="arc" cx="20" cy="20" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - part)).toFixed(1) + '"/></svg>' +
      (p && p.mastered ? IC.trophy : '<b>' + (p ? p.pct : 0) + '</b>') + '</span>';
  }
  function stepValue(st) {
    if (st.kind === 'change') return st.count ? st.count + ' a min' : '';
    return typeof st.best === 'number' ? App.pct(st.best) + '%' : '';
  }
  function stepRow(songId, st, isNext) {
    return '<button class="item step' + (st.done ? ' is-done' : '') + (isNext ? ' is-next' : '') + '" data-act="path-step" data-id="' + esc(songId) + '" data-step="' + esc(st.id) + '">' +
      '<span class="q-check">' + IC.check + '</span><div class="item-main"><span class="item-title">' + esc(st.title) + '</span><span class="item-sub">' + esc(st.done ? 'Done' + (st.at ? ', ' + App.ago(st.at) : '') : st.sub) + '</span></div>' +
      (stepValue(st) ? '<span class="small num muted">' + esc(stepValue(st)) + '</span>' : '') + IC.chev + '</button>';
  }
  App.stepRow = stepRow;

  /* ---------- the path card on a song's page ---------- */
  App.pathCard = function (song, open) {
    var p = App.path.of(song); if (!p) return '';
    var goal = S.settings.focus === song.id;
    var html = '<section class="card stack path-card" id="pathCard"><div class="spread"><span class="eyebrow">Path to this song</span>' +
      (goal ? '<span class="pill pill-accent">' + IC.flag + 'Your goal</span>' : '<button class="link" data-act="goal-set" data-id="' + esc(song.id) + '">Make it my goal</button>') + '</div>' +
      '<div class="path-num"><b>' + p.done + '</b><span>of ' + p.total + ' steps' + (p.mastered ? ', finished' : '') + '</span></div>' +
      '<div class="meter' + (p.mastered ? ' is-good' : '') + '" role="img" aria-label="' + p.pct + ' percent of the way"><i style="width:' + p.pct + '%"></i></div>';
    if (p.mastered) html += '<div class="unlock"><i>' + IC.trophy + '</i><div><b>You can play this song.</b><div class="small muted">Finished ' + esc(App.ago(p.masteredAt)) + '. Play it again for three stars, or pick the next one.</div></div></div>';
    else if (p.next) html += '<div class="stack-sm"><span class="small muted" style="padding-left:4px">Next step</span><div class="group group-in">' + stepRow(song.id, p.next, true) + '</div></div>';
    html += '<button class="link" data-act="path-toggle" style="align-self:flex-start;min-height:32px">' + (open ? 'Hide the steps' : 'Show all ' + p.total + ' steps') + '</button>';
    if (open) {
      p.stages.forEach(function (sg) {
        var d = sg.steps.filter(function (s) { return s.done; }).length;
        html += '<div class="stack-sm"><div class="sec-head"><span class="h3">' + esc(sg.title) + '</span><span class="small muted num">' + d + ' of ' + sg.steps.length + '</span></div><div class="group group-in">' +
          sg.steps.map(function (s) { return stepRow(song.id, s, p.next === s); }).join('') + '</div></div>';
      });
      if (p.bonus.length) {
        var bd = p.bonus.filter(function (s) { return s.done; }).length;
        html += '<div class="stack-sm"><div class="sec-head"><span class="h3">Go further</span><span class="small muted num">' + bd + ' of ' + p.bonus.length + '</span></div><div class="group group-in">' +
          p.bonus.map(function (s) { return stepRow(song.id, s, false); }).join('') + '</div><span class="small muted" style="padding-inline:4px">Not needed to finish the song. Each one is the same song played another way, or the part from your own tab.</span></div>';
      }
      html += '<p class="small muted">Shapes, changes and techniques count for every song that uses them, so the next song starts with some of its steps already done.</p>';
    }
    return html + '</section>';
  };
  /* start a step: an exercise, the one-minute change drill, or a part of the song set up and running */
  App.pathRun = function (songId, stepId) {
    var song = App.findSong(songId), p = song ? App.path.of(song) : null; if (!p) return;
    var st = stepId ? p.steps.concat(p.bonus).filter(function (s) { return s.id === stepId; })[0] : p.next;
    if (!st) { App.go({ name: 'practice', id: songId }); return; }
    var P = App.practice;
    if (App.sheet.isOpen()) App.sheet.close();
    if (st.ex) { App.go({ name: 'practice', id: st.ex, from: songId }); return; }
    if (st.kind === 'change') { if (!(S.route.name === 'practice' && P.st && P.st.id === songId)) App.go({ name: 'practice', id: songId }); App.omc.open(st.a, st.b, songId); return; }
    if (!(S.route.name === 'practice' && P.st && P.st.id === songId)) App.go({ name: 'practice', id: songId });
    var ps = P.st; if (!ps || ps.run) return;
    if (st.kind === 'tab' && st.missing) { App.lead.open(songId); return; }
    /* parts are found in the chord chart; the step may then ask for another way of playing them */
    P.setWay('chords'); ps.section = st.view; ps.marks = {};
    if (st.way && st.way !== 'chords') P.setWay(st.way);
    if (st.kind === 'song' || ps.pct < st.pct) ps.pct = st.pct;
    if (ps.mode === 'live') ps.live = ps.model.timed ? 'tempo' : 'wait';
    App.render(true);
    if (ps.mode === 'take') { App.toast('Record ' + (st.view < 0 ? 'the whole song' : 'this part') + ', then pick the file.'); var a = $('#pAction'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'center' }); return; }
    P.start();
  };

  /* ---------- the riff, solo or melody: pasted by the player, kept with the song ---------- */
  var leadDraft = null;
  function leadHtml() {
    var d = leadDraft, song = App.findSong(d.id), q = ((song.artist || '') + ' ' + song.title).trim();
    return '<div class="sheet-head"><div><div class="eyebrow">' + esc(song.title) + '</div><h2 class="title">Paste a tab</h2></div><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + IC.x + '</button></div>' +
      '<p class="small muted">Find a tab of the ' + (song.melody ? 'melody' : 'riff, solo or intro') + ' on a tab site, copy the six-line tab, and paste it here. It is kept with this song, on your own account.</p>' +
      '<div class="row-tight"><span class="small muted">Find it:</span>' + App.findLinks(q + ' tab').map(function (l) { return '<a class="btn btn-sm btn-tinted" href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(l[0]) + IC.ext + '</a>'; }).join('') + '</div>' +
      '<label class="field"><span>The tab</span><textarea class="textarea" id="lText" spellcheck="false" placeholder="e|-----0-----|&#10;B|---1---1---|&#10;G|-0-------0-|&#10;D|-----------|&#10;A|-----------|&#10;E|-----------|">' + esc(d.text) + '</textarea></label>' +
      (d.err ? '<div class="notice notice-bad">' + IC.warn + '<div>' + esc(d.err) + '</div></div>' : '') +
      (d.sections ? '<div class="notice notice-good">' + IC.check + '<div><b>' + d.count + ' notes read</b> in ' + d.sections.length + (d.sections.length === 1 ? ' part' : ' parts') + (d.capo ? ', capo ' + d.capo : '') + '.</div></div><button class="btn btn-primary btn-block" data-act="lead-save">' + IC.check + 'Add it to this song</button>'
        : '<button class="btn btn-tinted btn-block" data-act="lead-read">Read it</button>');
  }
  App.lead = {
    open: function (id) { if (!App.findSong(id)) return; leadDraft = { id: id, text: '', err: '', sections: null, count: 0 }; App.sheet.open(leadHtml()); },
    read: function () {
      var d = leadDraft; if (!d) return;
      d.text = ($('#lText') || {}).value || ''; d.err = ''; d.sections = null;
      if (!d.text.trim()) d.err = 'Paste the tab first.';
      else {
        var p = M.parseSheet(d.text), tabs = p.sections.filter(function (s) { return s.type === 'tab' || s.systems; });
        if (!tabs.length) d.err = 'No six-line tab found in that text. It needs six lines of dashes and fret numbers, one for each string.';
        else {
          var model = M.buildSong({ sections: tabs, capo: p.meta.capo || 0, tuning: p.meta.tuning || 'standard' });
          if (model.targets.length < 3) d.err = 'The tab was recognised, but there were no notes to play in it.';
          else { d.sections = tabs.slice(0, 24); d.count = model.targets.length; d.capo = p.meta.capo || 0; d.tuning = p.meta.tuning || 'standard'; }
        }
      }
      $('#sheetBody').innerHTML = leadHtml();
    },
    save: function () {
      var d = leadDraft, song = d && App.findSong(d.id); if (!song || !d.sections) return;
      App.Store.saveSong(Object.assign({}, song, { lead: { sections: d.sections, capo: d.capo || 0, tuning: d.tuning || 'standard', at: Date.now() } }));
      leadDraft = null; App.sheet.close();
      var P = App.practice; P.st = null; App.go({ name: 'practice', id: d.id }); if (P.st) { P.setWay('tab'); App.render(true); }
      App.toast('Added. It is now one of the ways to play this song.');
    },
    remove: function (id) {
      var song = App.findSong(id); if (!song || !song.lead) return;
      var copy = Object.assign({}, song); delete copy.lead;
      App.Store.saveSong(copy);
      var P = App.practice; P.st = null; App.go({ name: 'practice', id: id });
      App.toast('Removed your tab from this song.');
    }
  };

  /* ---------- the goal on Today ---------- */
  function suggest() {
    var songs = App.allSongs().filter(function (x) { var p = App.path.of(x); return p && !p.mastered; });
    if (!songs.length) return null;
    var played = {}; S.sessions.forEach(function (x) { if (x.song) played[x.song] = 1; });
    var started = songs.filter(function (x) { return played[x.id]; });
    return started[0] || songs[0];
  }
  App.goalCard = function () {
    var id = S.settings.focus, song = id ? App.findSong(id) : null, p = song ? App.path.of(song) : null;
    var head = function (x, eyebrow, right) {
      return '<div class="spread"><span class="eyebrow">' + eyebrow + '</span>' + (right || '') + '</div>' +
        '<button class="goal-song" data-act="open" data-id="' + esc(x.id) + '">' + App.art(x, 'art-lg', 240) + '<span class="grow"><span class="item-title" style="font-size:20px;display:block">' + esc(x.title) + '</span><span class="item-sub">' + esc(x.artist || 'Your song') + ' · level ' + (x.level || 1) + '</span></span>' + IC.chev + '</button>';
    };
    if (song && p && !p.mastered) {
      return '<section class="card stack goal">' + head(song, 'Your goal', App.starsHtml((App.computeGame().songs[song.id] || { stars: 0 }).stars)) +
        '<div class="row" style="flex-wrap:nowrap"><div class="meter grow" role="img" aria-label="' + p.done + ' of ' + p.total + ' steps done"><i style="width:' + p.pct + '%"></i></div><span class="small num muted">' + p.done + ' of ' + p.total + ' steps</span></div>' +
        '<div class="panel-flat stack-sm"><span class="small muted">Next step</span><b>' + esc(p.next.title) + '</b><span class="small muted">' + esc(p.next.sub) + '</span></div>' +
        '<div class="row" style="flex-wrap:nowrap"><button class="btn btn-primary btn-play grow" data-act="path-next" data-id="' + esc(song.id) + '">' + IC.play + 'Continue</button><button class="btn btn-play" data-act="go" data-to="tuner" aria-label="Tune first">' + IC.gauge + 'Tune</button></div></section>';
    }
    if (song && p && p.mastered) {
      return '<section class="card stack goal">' + head(song, 'Goal reached', App.starsHtml((App.computeGame().songs[song.id] || { stars: 0 }).stars)) +
        '<div class="unlock"><i>' + IC.trophy + '</i><div><b>You can play this song.</b><div class="small muted">All ' + p.total + ' steps done. Time for the next one.</div></div></div>' +
        '<button class="btn btn-primary btn-block" data-act="go" data-to="songs">Pick the next song</button></section>';
    }
    var sug = suggest();
    if (!sug) return '';
    var sp = App.path.of(sug);
    return '<section class="card stack goal">' + head(sug, 'Pick a song to work toward') +
      '<p class="small muted">A goal song gets a path: ' + sp.total + ' steps for this one' + (sp.done ? ', ' + sp.done + ' already done' : '') + ', each a short exercise, ending with playing the song.</p>' +
      '<div class="row" style="flex-wrap:nowrap"><button class="btn btn-primary grow" data-act="goal-set" data-id="' + esc(sug.id) + '">' + IC.flag + 'Make it my goal</button><button class="btn" data-act="go" data-to="songs">Browse</button></div></section>';
  };

  /* ---------- SONGS ---------- */
  function kindLabel(model) { return model.kind === 'tab' ? 'Tab' : (model.kind === 'mixed' ? 'Chords and tab' : 'Chords'); }
  function songRow(x, st, gm, showArtist) {
    var p = App.path.of(x), gs = gm.songs[x.id] || { stars: 0 };
    var meta = [showArtist ? (x.artist || '') : '', 'Level ' + (x.level || 1), p ? (p.mastered ? 'finished' : p.done + ' of ' + p.total + ' steps') : kindLabel(App.modelOf(x)), x.checked === false ? 'not checked' : ''].filter(Boolean).join(' · ');
    return '<button class="item song-row" data-act="open" data-id="' + esc(x.id) + '">' + (p ? ringHtml(p) : App.lvlBadge(x.level || 1)) + '<div class="item-main"><span class="item-title">' + esc(x.title) + (S.settings.focus === x.id ? ' <span class="goal-flag" aria-label="your goal">' + IC.flag + '</span>' : '') + '</span>' +
      '<span class="item-sub">' + esc(meta) + '</span></div><div class="item-side">' + App.starsHtml(gs.stars) + '</div>' + IC.chev + '</button>';
  }
  function viewSongs() {
    var st = App.computeStats(), gm = App.computeGame(), f = S.filter;
    var q = f.q.trim().toLowerCase(), lv = f.level, all = App.allSongs();
    var artists = {}, genres = {}, order = [];
    all.forEach(function (x) {
      var a = x.artist || 'My songs';
      if (!artists[a]) { artists[a] = { name: a, n: 0, done: 0, sample: x }; order.push(a); }
      artists[a].n++; var p = App.path.of(x); if (p && p.mastered) artists[a].done++;
      if (x.genre) genres[x.genre] = (genres[x.genre] || 0) + 1;
    });
    order.sort(function (a, b) { return (a === 'My songs') - (b === 'My songs') || artists[b].n - artists[a].n || a.localeCompare(b); });
    if (f.artist && !artists[f.artist]) f.artist = '';
    if (f.genre && !genres[f.genre]) f.genre = '';
    var match = function (x) {
      if (lv && (x.level || 1) !== lv) return false;
      if (f.artist && (x.artist || 'My songs') !== f.artist) return false;
      if (f.genre && x.genre !== f.genre) return false;
      if (!q) return true;
      if ((x.title + ' ' + (x.artist || '') + ' ' + (x.album || '') + ' ' + (x.genre || '')).toLowerCase().indexOf(q) >= 0) return true;
      return App.modelOf(x).chords.some(function (c) { return c.name.toLowerCase() === q; });
    };
    var list = all.filter(match), drills = (f.artist || f.genre) ? [] : App.DRILLS.filter(match);
    var html = '<section class="stack">' +
      '<div class="head"><h2 class="large-title">Songs</h2><button class="btn btn-sm btn-primary" data-act="add">' + IC.plus + 'Add a song</button></div>' +
      '<div class="search"><label class="vh" for="q">Search your songs</label>' + IC.search + '<input class="input" id="q" type="search" placeholder="Title, artist, genre or a chord" value="' + esc(f.q) + '" data-in="q" autocomplete="off"></div></section>';
    if (S.store === 'loading') html += '<p class="empty"><span class="row"><span class="spinner"></span>Loading your library…</span></p>';
    if (f.artist) {
      var a = artists[f.artist];
      html += '<section class="artist-head">' + App.art(a.sample, 'art-banner', 800) + '<div class="artist-over"><button class="btn btn-sm artist-back" data-act="artist" data-name="">' + IC.back + 'All artists</button><div><h3 class="h2">' + esc(a.name) + '</h3><span class="small">' + a.n + (a.n === 1 ? ' song' : ' songs') + (a.done ? ' · ' + a.done + ' finished' : '') + '</span></div></div></section>';
    } else if (!q && order.length > 1) {
      html += '<section class="stack"><div class="sec-head"><h3 class="h2">Artists</h3><span class="small muted num">' + order.length + '</span></div><div class="artists">' + order.map(function (n) {
        var a = artists[n];
        return '<button class="artist-card" data-act="artist" data-name="' + esc(n) + '">' + App.art(n === 'My songs' ? { title: 'My songs' } : a.sample, 'art-card', 320) + '<b>' + esc(n) + '</b><span>' + a.n + (a.n === 1 ? ' song' : ' songs') + (a.done ? ' · ' + a.done + ' done' : '') + '</span></button>';
      }).join('') + '</div></section>';
    }
    var gk = Object.keys(genres).sort();
    html += '<section class="stack-sm">' +
      (gk.length > 1 && !f.artist ? '<div class="chips" role="group" aria-label="Filter by genre"><button class="chip" data-act="genre" data-name="" aria-pressed="' + (!f.genre) + '">All genres</button>' + gk.map(function (g) { return '<button class="chip" data-act="genre" data-name="' + esc(g) + '" aria-pressed="' + (f.genre === g) + '">' + esc(g) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="chips" role="group" aria-label="Filter by level"><button class="chip" data-act="level" data-level="0" aria-pressed="' + (lv === 0) + '">All levels</button>' +
      [1, 2, 3, 4, 5].map(function (n) { return '<button class="chip" data-act="level" data-level="' + n + '" aria-pressed="' + (lv === n) + '">Level ' + n + '</button>'; }).join('') + '</div></section>';
    var shown = 0;
    order.forEach(function (n) {
      var inA = list.filter(function (x) { return (x.artist || 'My songs') === n; });
      if (!inA.length) return;
      shown += inA.length;
      html += '<section class="stack">' + (f.artist ? '' : '<div class="sec-head"><h3 class="h2">' + esc(n) + '</h3><span class="small muted num">' + inA.length + '</span></div>') +
        '<div class="group">' + inA.map(function (x) { return songRow(x, st, gm, false); }).join('') + '</div></section>';
    });
    if (drills.length) {
      shown += drills.length;
      html += '<section class="stack"><div class="sec-head"><h3 class="h2">Warm-up drills</h3><span class="small muted num">' + drills.length + '</span></div><div class="group">' + drills.map(function (x) {
        var gs = gm.songs[x.id] || { stars: 0 };
        return '<button class="item song-row" data-act="open" data-id="' + esc(x.id) + '">' + App.lvlBadge(x.level || 1) + '<div class="item-main"><span class="item-title">' + esc(x.title) + '</span><span class="item-sub">' + esc(kindLabel(App.modelOf(x)) + (x.bpm ? ' · ' + x.bpm + ' BPM' : '')) + '</span></div><div class="item-side">' + App.starsHtml(gs.stars) + '</div>' + IC.chev + '</button>';
      }).join('') + '</div></section>';
    }
    if (!shown && S.store !== 'loading') html += '<p class="empty">Nothing matches that. Clear the search or pick another filter.</p>';
    html += '<div class="panel-flat stack-sm"><b>Want a song that is not here?</b><span class="small">Add a song takes a pasted tab or chord sheet from any tab site and builds a path for it. Or tell Claude in the chat which song you want.</span></div>';
    return html;
  }
  App.views.songs = viewSongs;

  /* ---------- METRONOME ---------- */
  var Met = App.met = { on: false, bpm: 90, per: 4, sub: 1, accent: true, timer: null, nextT: 0, n: 0, began: 0, taps: [] };
  (function () { var k = App.ls.get('pr.metro.v1'); if (k && typeof k === 'object') { if (k.bpm >= 30 && k.bpm <= 240) Met.bpm = Math.round(k.bpm); if ([2, 3, 4, 6].indexOf(k.per) >= 0) Met.per = k.per; if ([1, 2, 3, 4].indexOf(k.sub) >= 0) Met.sub = k.sub; if (typeof k.accent === 'boolean') Met.accent = k.accent; } })();
  function metKeep() { App.ls.set('pr.metro.v1', { bpm: Met.bpm, per: Met.per, sub: Met.sub, accent: Met.accent }); }
  function tempoWord(b) { return b < 60 ? 'Largo' : b < 76 ? 'Adagio' : b < 108 ? 'Andante' : b < 120 ? 'Moderato' : b < 168 ? 'Allegro' : 'Presto'; }
  function dotsHtml() { var h = ''; for (var i = 0; i < Met.per; i++) h += '<i' + (i === 0 && Met.accent ? ' class="is-one"' : '') + '></i>'; return h; }
  App.metroHtml = function () {
    var seg = function (act, vals, cur, label) {
      return '<div class="seg" role="group" aria-label="' + label + '">' + vals.map(function (v) { return '<button data-act="' + act + '" data-v="' + v[0] + '" aria-pressed="' + (cur === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</div>';
    };
    return '<div class="metro"><div class="metro-dots" id="mDots">' + dotsHtml() + '</div>' +
      '<div class="metro-bpm"><button class="icon-btn" data-act="met-step" data-d="-1" aria-label="One slower">−</button><div class="metro-num"><b id="mBpm">' + Met.bpm + '</b><span id="mWord">BPM · ' + tempoWord(Met.bpm) + '</span></div><button class="icon-btn" data-act="met-step" data-d="1" aria-label="One faster">+</button></div>' +
      '<input class="range" type="range" min="30" max="240" step="1" value="' + Met.bpm + '" id="mRange" data-in="met-bpm" aria-label="Tempo in beats per minute"></div>' +
      (Met.on ? '<button class="btn btn-stop btn-play btn-block" data-act="met-toggle">' + IC.stop + 'Stop</button>' : '<button class="btn btn-primary btn-play btn-block" data-act="met-toggle">' + IC.play + 'Start</button>') +
      '<div class="stack-sm"><span class="eyebrow" style="padding-left:4px">Beats in a bar</span>' + seg('met-per', [[2, '2'], [3, '3'], [4, '4'], [6, '6']], Met.per, 'Beats in a bar') + '</div>' +
      '<div class="stack-sm"><span class="eyebrow" style="padding-left:4px">Clicks per beat</span>' + seg('met-sub', [[1, 'One'], [2, 'Two'], [3, 'Three'], [4, 'Four']], Met.sub, 'Clicks per beat') + '</div>' +
      '<div class="group"><label class="item toggle"><input type="checkbox" data-in="met-accent"' + (Met.accent ? ' checked' : '') + '><span>Louder click on beat one</span></label>' +
      '<button class="item" data-act="met-tap"><span class="grow">Tap the tempo</span><span class="small muted" id="mTap">tap four times</span></button></div>' +
      '<p class="small muted" style="padding-inline:4px">A minute or more with the metronome is logged as practice. No sound on an iPhone? Flip the ring switch on the side to ring.</p>';
  };
  function metPaint() {
    var b = $('#mBpm'); if (b) b.textContent = Met.bpm;
    var w = $('#mWord'); if (w) w.textContent = 'BPM · ' + tempoWord(Met.bpm);
    var r = $('#mRange'); if (r && +r.value !== Met.bpm) r.value = Met.bpm;
  }
  Met.set = function (bpm) { Met.bpm = App.clamp(Math.round(bpm), 30, 240); metKeep(); metPaint(); };
  Met.start = function () {
    var A = App.audio, ctx = A.ensure();
    if (!ctx || Met.on) return;
    A.hush();
    Met.on = true; Met.n = 0; Met.nextT = ctx.currentTime + 0.12; Met.began = Date.now();
    var pump = function () {
      var horizon = ctx.currentTime + 0.14;
      while (Met.nextT < horizon) {
        var n = Met.n, onBeat = n % Met.sub === 0, beat = Math.floor(n / Met.sub) % Met.per, t = Math.max(Met.nextT, ctx.currentTime);
        A.click(t, onBeat && beat === 0 && Met.accent, !onBeat);
        if (onBeat) (function (bt, when) { setTimeout(function () { if (Met.on) Met.flash(bt); }, Math.max(0, (when - ctx.currentTime) * 1000)); })(beat, t);
        Met.n++; Met.nextT += 60 / Met.bpm / Met.sub;
      }
    };
    Met.timer = setInterval(pump, 25); pump();
    App.wake.on();
  };
  Met.flash = function (beat) {
    var d = $('#mDots'); if (!d) return;
    for (var i = 0; i < d.children.length; i++) d.children[i].classList.toggle('is-on', i === beat);
  };
  /* stopping logs the time when it was a minute or more */
  Met.stop = function (quiet) {
    if (!Met.on) return;
    Met.on = false; clearInterval(Met.timer); Met.timer = null; App.wake.off();
    var secs = Math.round((Date.now() - Met.began) / 1000);
    if (secs >= 60 && S.canWrite) {
      App.Store.addSession({ song: '', title: 'Metronome at ' + Met.bpm + ' BPM', kind: 'metro', secs: Math.min(secs, 3600), bpm: Met.bpm });
      if (!quiet) App.toast('Logged ' + Math.round(secs / 60) + ' min with the metronome.');
    }
  };
  Met.tap = function () {
    var now = Date.now(), t = Met.taps;
    if (t.length && now - t[t.length - 1] > 2500) t.length = 0;
    t.push(now); if (t.length > 6) t.shift();
    var el = $('#mTap');
    if (t.length < 2) { if (el) el.textContent = 'keep tapping'; return; }
    var gaps = []; for (var i = 1; i < t.length; i++) gaps.push(t[i] - t[i - 1]);
    Met.set(60000 / (gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length));
    if (el) el.textContent = Met.bpm + ' BPM';
  };

  /* ---------- who took the pictures ---------- */
  App.creditsHtml = function () {
    var names = Object.keys(PICS).filter(function (n) { return PICS[n] && PICS[n].file; });
    if (!names.length) return '';
    return '<div class="stack-sm"><span class="eyebrow" style="padding-left:4px">Pictures</span><div class="panel stack-sm"><p class="small muted">Artist photographs come from Wikimedia Commons under free licences.</p>' + names.map(function (n) {
      var p = PICS[n];
      return '<span class="small"><b>' + esc(n) + '</b>: ' + esc(p.author || 'unknown') + ', ' + esc(p.license || '') + (/^https:\/\/commons\.wikimedia\.org\//.test(p.page || '') ? ' · <a href="' + esc(p.page) + '" target="_blank" rel="noopener">source</a>' : '') + '</span>';
    }).join('') + '</div></div>';
  };
  App.ringHtml = ringHtml;
})(typeof window !== 'undefined' ? window : globalThis);

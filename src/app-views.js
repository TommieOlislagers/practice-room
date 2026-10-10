/* app-views.js: Today, Songs, the add and edit sheets, Settings, Tuner. */
(function (root) {
  'use strict';
  var PR = root.PR, M = PR.music, App = PR.app, S = App.S, esc = App.esc, IC = App.IC, $ = App.$, $all = App.$all;
  var LEVELS = M.LEVELS;

  function lvlBadge(n) { return '<span class="lvl" title="Level ' + n + ': ' + esc(LEVELS[n].name) + '" aria-label="Level ' + n + '">' + n + '</span>'; }
  function kindLabel(model) { return model.kind === 'tab' ? 'Tab' : (model.kind === 'mixed' ? 'Chords and tab' : 'Chords'); }
  function songChips(song, model) {
    var out = [];
    if (song.drill) out.push('<span class="pill">Drill</span>');
    out.push('<span class="chip">' + kindLabel(model) + '</span>');
    if (song.bpm) out.push('<span class="chip num">' + song.bpm + ' BPM</span>');
    if (song.capo) out.push('<span class="chip">Capo ' + song.capo + '</span>');
    if (song.tuning && song.tuning !== 'standard') out.push('<span class="chip">' + esc(M.tuningName(song.tuning)) + '</span>');
    return out.join('');
  }
  App.songChips = songChips; App.lvlBadge = lvlBadge;

  /* A link to this page outside the frame it is shown in, where a browser can ask about the microphone itself. */
  function ownLink(primary) {
    var u = App.audio.ownUrl();
    return u ? '<a class="btn btn-sm' + (primary ? ' btn-primary' : '') + '" href="' + esc(u) + '" target="_blank" rel="noopener" data-act="own-open">' + IC.ext + 'Open the page on its own</a>' : '';
  }
  function micNotice(compact) {
    var m = S.mic;
    if (m.state === 'live' || m.state === 'asking') return '';
    var own = '', head, body = '', cls = 'notice', icon = IC.info, ask = askButton();
    if (m.state === 'none') { cls += ' notice-warn'; icon = IC.warn; head = 'No microphone found.'; body = 'Plug one in, or check a recording instead.'; }
    else if (m.state === 'error') { cls += ' notice-warn'; icon = IC.warn; head = 'The microphone did not start' + (m.detail ? ' (' + esc(m.detail) + ')' : '') + '.'; body = 'Close other apps that use it and ask again, or check a recording.'; }
    else if (m.state === 'blocked' || m.pre === 'blocked') {
      if (m.why === 'frame' || (m.framed && (m.why === 'no-api' || m.why === 'insecure'))) {
        /* nothing the player can switch on from here: say whose decision it is, and offer what does work */
        own = ownLink(true);
        head = 'Claude\'s viewer does not pass the microphone on to this page.';
        body = (m.tried ? 'The request was refused inside the viewer, before your phone was asked. ' : 'The page sits in a frame, and the frame is not given the microphone. ') + 'Nothing on your phone is set wrong. ' +
          (own ? 'Opened on its own, the page can ask your browser directly. ' : '') + 'Checking a recording works right here.';
        ask = '<button class="link" data-act="mic-ask">' + (m.tried ? 'Ask again anyway' : 'Ask anyway') + '</button>';
      } else if (m.why === 'denied') {
        head = 'Your browser has the microphone set to blocked for this page.';
        body = 'Allow it in the site settings (the icon next to the address), then ask again.';
      } else if (m.why === 'no-api' || m.why === 'insecure') {
        head = 'This browser gives the page no microphone.'; body = 'Checking a recording works right here.'; ask = '';
      } else {
        head = 'The microphone was refused' + (m.detail ? ' (' + esc(m.detail) + ')' : '') + '.';
        body = 'Ask again, or check a recording instead.';
      }
    } else {
      if (compact || m.pre === 'ok') return '';
      head = 'Live listening needs the microphone.'; body = 'Allow it once and the page follows your playing as you go.';
    }
    return '<div class="' + cls + '">' + icon + '<div class="notice-body"><div><b>' + head + '</b>' + (compact ? '' : ' ' + body) + '</div>' +
      '<div class="row">' + own + ask + '</div></div></div>';
  }
  function askButton() {
    var m = S.mic;
    return '<button class="btn btn-sm" data-act="mic-ask">' + IC.mic + (m.pre === 'ok' ? 'Test it again' : m.tried ? 'Ask again' : m.pre === 'blocked' ? 'Ask anyway' : 'Allow the microphone') + '</button>';
  }
  App.ownLink = ownLink;
  App.micNotice = micNotice;

  /* ================= TODAY ================= */
  function niceMax(v) {
    var steps = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 60) * 60;
  }
  function chartHtml(last14) {
    var main = $('#main'), avail = main ? main.clientWidth - 34 : 320;
    var W = App.clamp(Math.round(avail) || 320, 280, 690), H = 150, x0 = 30, x1 = W - 4, yTop = 12, yBase = 118;
    var mins = last14.map(function (d) { return d.secs / 60; });
    var mx = Math.max.apply(null, mins);
    var top = niceMax(Math.max(mx, 5));
    var slot = (x1 - x0) / 14, bw = Math.min(22, Math.max(8, slot - 8));
    var maxIdx = mins.indexOf(mx), todayIdx = 13;
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Minutes practised per day over the last 14 days">';
    [0, top / 2, top].forEach(function (v) {
      var y = yBase - (v / top) * (yBase - yTop);
      out += '<line class="grid-line" x1="' + x0 + '" x2="' + x1 + '" y1="' + y + '" y2="' + y + '"/>';
      out += '<text class="axis-text" x="' + (x0 - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (Math.round(v * 10) / 10) + '</text>';
    });
    last14.forEach(function (d, i) {
      var cx = x0 + slot * i + slot / 2, m = mins[i];
      var h = m > 0 ? Math.max(3, (m / top) * (yBase - yTop)) : 0;
      var x = cx - bw / 2, y = yBase - h, r = Math.min(4, h);
      out += '<rect class="bar-hit" data-bar="' + i + '" x="' + (cx - slot / 2) + '" y="' + yTop + '" width="' + slot + '" height="' + (yBase - yTop + 26) + '" tabindex="0" role="img" aria-label="' + esc(App.fmtDay(d.t)) + ': ' + App.fmtMin(d.secs) + ' minutes"/>';
      if (h > 0) out += '<path class="bar-rect" data-barmark="' + i + '" d="M' + x + ' ' + yBase + 'V' + (y + r) + 'q0 -' + r + ' ' + r + ' -' + r + 'h' + (bw - 2 * r) + 'q' + r + ' 0 ' + r + ' ' + r + 'V' + yBase + 'z"/>';
      if (h > 0 && (i === maxIdx || i === todayIdx)) out += '<text class="val-text" x="' + cx + '" y="' + (y - 5) + '" text-anchor="middle">' + App.fmtMin(d.secs) + '</text>';
      var wd = App.WEEKDAY[new Date(d.t).getDay()].charAt(0);
      out += '<text class="axis-text" x="' + cx + '" y="' + (yBase + 16) + '" text-anchor="middle"' + (i === todayIdx ? ' style="font-weight:700;fill:var(--ink)"' : '') + '>' + wd + '</text>';
    });
    out += '<text class="axis-text" x="' + (x0 + slot * 13 + slot / 2) + '" y="' + (yBase + 29) + '" text-anchor="middle" style="fill:var(--ink)">today</text>';
    out += '</svg>';
    var rows = last14.slice().reverse().map(function (d) { return '<tr><td>' + esc(App.fmtDay(d.t)) + '</td><td class="n">' + App.fmtMin(d.secs) + '</td><td class="n">' + d.n + '</td></tr>'; }).join('');
    return '<div class="chart" id="chart14">' + out + '<div class="tip" id="chartTip" hidden></div></div>' +
      '<details><summary>Show as a table</summary><table class="data"><thead><tr><th>Day</th><th class="n">Minutes</th><th class="n">Sessions</th></tr></thead><tbody>' + rows + '</tbody></table></details>';
  }
  function pickNext(stats) {
    var songs = App.allSongs();
    if (!songs.length) return App.DRILLS[0];
    var withStat = songs.map(function (s) { return { s: s, st: App.songStatus(stats, s.id) }; });
    var learning = withStat.filter(function (x) { return x.st.key === 'learning'; }).sort(function (a, b) { return b.st.last - a.st.last; });
    if (learning.length) return learning[0].s;
    var fresh = withStat.filter(function (x) { return x.st.key === 'new'; });
    if (fresh.length) return fresh[0].s;
    withStat.sort(function (a, b) { return a.st.last - b.st.last; });
    return withStat[0].s;
  }
  var KIND_LABEL = { wait: 'Live, wait for me', tempo: 'Live, in time', take: 'Recording', self: 'Play along', omc: 'One-minute changes' };
  function viewToday() {
    var st = App.computeStats();
    var songs = App.allSongs();
    var next = pickNext(st);
    var nm = App.modelOf(next), ns = App.songStatus(st, next.id);
    var solid = songs.filter(function (s) { return App.songStatus(st, s.id).key === 'solid'; }).length;
    var today = App.dayKey(Date.now());
    var playedToday = !!st.days[today];
    var d = new Date();
    var html = '<section class="stack">' +
      '<div><div class="eyebrow">' + esc(App.WEEKDAY[d.getDay()] + ' ' + d.getDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]) + '</div>' +
      '<h2 class="title">' + (playedToday ? 'Good work today.' : (st.total ? 'Ready when you are.' : 'Pick up the guitar.')) + '</h2></div>';
    /* up next */
    html += '<div class="panel stack">' +
      '<div class="spread"><span class="eyebrow">' + (ns.key === 'new' ? 'Start here' : 'Up next') + '</span>' + (ns.key !== 'new' ? '<span class="pill ' + ns.cls + '">' + ns.label + '</span>' : '') + '</div>' +
      '<div class="row" style="align-items:flex-start">' + lvlBadge(next.level || 1) + '<div class="grow"><div class="item-title" style="font-size:19px">' + esc(next.title) + '</div>' +
      '<div class="item-sub">' + esc(next.artist || (next.drill ? 'Built-in drill' : '')) + (ns.last ? ' · last played ' + esc(App.ago(ns.last)) : '') + '</div></div></div>' +
      (ns.recent !== null ? '<div class="row"><div class="meter grow" role="img" aria-label="Recent accuracy ' + App.pct(ns.recent) + ' percent"><i style="width:' + App.pct(ns.recent) + '%"></i></div><span class="small num muted">' + App.pct(ns.recent) + '% recent</span></div>' : '') +
      '<div class="row"><button class="btn btn-primary grow" data-act="open" data-id="' + esc(next.id) + '">' + IC.play + 'Practise</button><button class="btn" data-act="go" data-to="tuner">' + IC.gauge + 'Tune first</button></div>' +
      '</div>';
    html += micNotice(false);
    /* KPI row */
    var delta = '';
    if (st.acc7 !== null && st.accPrev !== null) {
      var pts = Math.round((st.acc7 - st.accPrev) * 100);
      delta = pts === 0 ? '<div class="kpi-delta">same as the week before</div>' :
        '<div class="kpi-delta ' + (pts > 0 ? 'up' : 'down') + '">' + (pts > 0 ? IC.up : IC.down) + Math.abs(pts) + ' points ' + (pts > 0 ? 'up' : 'down') + ' on the week before</div>';
    } else delta = '<div class="kpi-delta">' + (st.acc7 === null ? 'no scored sessions yet' : 'first scored week') + '</div>';
    html += '<div class="kpis">' +
      '<div class="kpi"><span class="kpi-label">Day streak</span><span class="kpi-value">' + st.streak + '<small>' + (st.streak === 1 ? 'day' : 'days') + '</small></span><div class="kpi-delta">' + (playedToday ? 'today counted' : (st.streak ? 'play today to keep it' : 'starts with one session')) + '</div></div>' +
      '<div class="kpi"><span class="kpi-label">This week</span><span class="kpi-value">' + App.fmtMin(st.weekSecs) + '<small>min</small></span><div class="kpi-delta">' + st.weekN + (st.weekN === 1 ? ' session' : ' sessions') + ' since Monday</div></div>' +
      '<div class="kpi"><span class="kpi-label">Accuracy, last 7 days</span><span class="kpi-value">' + (st.acc7 === null ? '–' : App.pct(st.acc7) + '<small>%</small>') + '</span>' + delta + '</div>' +
      '<div class="kpi"><span class="kpi-label">Songs solid</span><span class="kpi-value">' + solid + '<small>of ' + songs.length + '</small></span><div class="kpi-delta">90% or better, twice running</div></div>' +
      '</div>';
    html += '</section>';
    /* chart */
    html += '<section class="panel stack"><div class="spread"><h3 class="h2">Minutes practised</h3><span class="small muted">last 14 days</span></div>' +
      (st.total ? '' : '<p class="small muted">Nothing logged yet. Your first session shows up as a bar on the right.</p>') + chartHtml(st.last14) + '</section>';
    /* slowest changes */
    html += '<section class="stack"><h3 class="h2">Slowest chord changes</h3>';
    if (st.slow.length) {
      html += '<div class="list">' + st.slow.slice(0, 4).map(function (p) {
        return '<div class="item"><div class="item-main"><span class="item-title mono">' + esc(p.from) + ' → ' + esc(p.to) + '</span><span class="item-sub">' + (Math.round(p.mean * 10) / 10) + ' s to get it sounding, over ' + p.vals.length + ' tries' + (p.best ? ' · best ' + p.best + ' a minute' : '') + '</span></div>' +
          '<button class="btn btn-sm" data-act="omc" data-a="' + esc(p.from) + '" data-b="' + esc(p.to) + '" data-id="' + esc(p.song || '') + '">Drill</button></div>';
      }).join('') + '</div>';
    } else html += '<p class="empty">' + (Object.keys(st.pairs).length ? 'No change is taking you longer than about half a second right now.' : 'After two scored sessions of a chord song, the changes that take you longest are listed here, with a one-minute drill for each.') + '</p>';
    html += '</section>';
    /* levels */
    html += '<section class="stack"><h3 class="h2">Levels</h3><div class="list">';
    for (var L = 1; L <= 5; L++) {
      var inL = songs.concat(App.DRILLS).filter(function (s) { return (s.level || 1) === L; });
      var sol = inL.filter(function (s) { return App.songStatus(st, s.id).key === 'solid'; }).length;
      html += '<button class="item" data-act="level" data-level="' + L + '">' + lvlBadge(L) + '<div class="item-main"><span class="item-title">' + esc(LEVELS[L].name) + '</span><span class="item-sub">' + esc(LEVELS[L].blurb) + '</span></div>' +
        '<div class="item-side"><span class="small num muted">' + (inL.length ? sol + ' of ' + inL.length + ' solid' : 'nothing here yet') + '</span>' + (inL.length ? '<div class="meter is-good"><i style="width:' + Math.round(sol / inL.length * 100) + '%"></i></div>' : '') + '</div></button>';
    }
    html += '</div></section>';
    /* recent */
    html += '<section class="stack"><h3 class="h2">Recent sessions</h3>';
    if (S.sessions.length) {
      html += '<div class="list">' + S.sessions.slice(0, 6).map(function (s) {
        var right = s.kind === 'omc' ? (s.count + ' changes') : (typeof s.acc === 'number' ? App.pct(s.acc) + '%' : '–');
        return '<div class="item"><div class="item-main"><span class="item-title">' + esc(s.title || 'Session') + '</span><span class="item-sub">' + esc(KIND_LABEL[s.kind] || 'Session') + (s.self ? ', self-rated' : '') + ' · ' + App.fmtDur(s.secs || 0) + ' · ' + esc(App.ago(s.at)) + '</span></div><span class="num" style="font-weight:600;font-size:17px">' + right + '</span></div>';
      }).join('') + '</div>';
    } else html += '<p class="empty">Each session you finish is logged here with its score.</p>';
    html += '</section>';
    if (!S.canWrite) html += '<div class="notice notice-warn">' + IC.warn + '<div>You are viewing this page without edit rights, so new sessions are not saved.</div></div>';
    return html;
  }
  function wireChart() {
    var box = $('#chart14'); if (!box) return;
    var tip = $('#chartTip'), st = App.computeStats();
    function show(i, el) {
      var d = st.last14[i]; if (!d) return;
      var r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      tip.innerHTML = '<b>' + App.fmtMin(d.secs) + ' min</b><br>' + esc(App.fmtDay(d.t)) + ' · ' + d.n + (d.n === 1 ? ' session' : ' sessions');
      tip.hidden = false;
      var x = r.left - b.left + r.width / 2;
      tip.style.left = App.clamp(x, 70, b.width - 70) + 'px';
      tip.style.top = Math.max(34, (r.top - b.top) + 6) + 'px';
      $all('.bar-rect', box).forEach(function (p) { p.classList.toggle('is-on', p.getAttribute('data-barmark') === String(i)); });
    }
    function hide() { tip.hidden = true; $all('.bar-rect', box).forEach(function (p) { p.classList.remove('is-on'); }); }
    $all('.bar-hit', box).forEach(function (el) {
      var i = +el.getAttribute('data-bar');
      el.addEventListener('pointerenter', function () { show(i, el); });
      el.addEventListener('focus', function () { show(i, el); });
      el.addEventListener('click', function () { show(i, el); });
      el.addEventListener('pointerleave', hide);
      el.addEventListener('blur', hide);
    });
  }

  /* ================= SONGS ================= */
  function viewSongs() {
    var st = App.computeStats();
    var q = S.filter.q.trim().toLowerCase(), lv = S.filter.level;
    var all = App.allSongs().concat(App.DRILLS);
    var list = all.filter(function (s) {
      if (lv && (s.level || 1) !== lv) return false;
      if (!q) return true;
      var hay = (s.title + ' ' + (s.artist || '')).toLowerCase();
      if (hay.indexOf(q) >= 0) return true;
      var model = App.modelOf(s);
      return model.chords.some(function (c) { return c.name.toLowerCase() === q; });
    });
    var html = '<section class="stack">' +
      '<div class="spread"><h2 class="title">Songs</h2><button class="btn btn-primary" data-act="add">' + IC.plus + 'Add a song</button></div>' +
      '<div class="search"><label class="vh" for="q">Search your songs</label>' + IC.search + '<input class="input" id="q" type="search" placeholder="Search title, artist or a chord" value="' + esc(S.filter.q) + '" data-in="q" autocomplete="off"></div>' +
      '<div class="row-tight" role="group" aria-label="Filter by level"><button class="chip" data-act="level" data-level="0" aria-pressed="' + (lv === 0) + '">All levels</button>' +
      [1, 2, 3, 4, 5].map(function (n) { return '<button class="chip" data-act="level" data-level="' + n + '" aria-pressed="' + (lv === n) + '">Level ' + n + '</button>'; }).join('') + '</div></section>';
    if (S.store === 'loading') html += '<p class="empty"><span class="row"><span class="spinner"></span>Loading your library…</span></p>';
    var shown = 0;
    for (var L = 1; L <= 5; L++) {
      var inL = list.filter(function (s) { return (s.level || 1) === L; });
      if (!inL.length) continue;
      shown += inL.length;
      html += '<section class="stack"><div class="group-head">' + lvlBadge(L) + '<h3 class="h2">' + esc(LEVELS[L].name) + '</h3><span class="small muted">' + inL.length + '</span></div><div class="list">' +
        inL.map(function (s) {
          var model = App.modelOf(s), ss = App.songStatus(st, s.id);
          return '<button class="item" data-act="open" data-id="' + esc(s.id) + '"><div class="item-main"><span class="item-title">' + esc(s.title) + '</span>' +
            '<span class="item-sub">' + esc(s.artist || (s.drill ? 'Built-in drill' : '')) + (s.checked === false ? ' · draft, not checked' : '') + '</span>' +
            '<span class="row-tight">' + songChips(s, model) + '</span></div>' +
            '<div class="item-side"><span class="pill ' + ss.cls + '">' + ss.label + '</span>' + (ss.recent !== null ? '<div class="meter" role="img" aria-label="Recent accuracy ' + App.pct(ss.recent) + ' percent"><i style="width:' + App.pct(ss.recent) + '%"></i></div>' : '') + '</div></button>';
        }).join('') + '</div></section>';
    }
    if (!shown && S.store !== 'loading') html += '<p class="empty">' + (q || lv ? 'Nothing matches that. Clear the search or pick another level.' : 'Your library is empty. Add a song to get going.') + '</p>';
    if (!Object.keys(S.songs).length && S.store !== 'loading' && !q) {
      html += '<div class="panel-flat stack"><b>Your own songs go here.</b><span class="small">Paste a tab or chord sheet from any tab site, have a chord chart drafted, or tell Claude in the chat which song you want and it loads a researched version.</span></div>';
    }
    return html;
  }

  /* ----- add a song ----- */
  var draft = null;
  function newDraft() { draft = { mode: 'paste', title: '', artist: '', text: '', song: null, info: null, busy: false, err: '', warn: [] }; }
  function findLinks(q) {
    var e = encodeURIComponent(q);
    return [
      ['Songsterr', 'https://www.songsterr.com/?pattern=' + e],
      ['Ultimate Guitar', 'https://www.ultimate-guitar.com/search.php?search_type=title&value=' + e],
      ['Web search', 'https://duckduckgo.com/?q=' + e + '+guitar+tab+OR+chords']
    ];
  }
  function previewHtml() {
    if (!draft.song) return '';
    var model = M.buildSong(Object.assign({}, draft.song, { shapes: App.songShapes(draft.song) }));
    var secs = model.view.map(function (v) {
      var body = v.type === 'tab' ? v.systems.length + (v.systems.length === 1 ? ' tab line' : ' tab lines') : v.cells.map(function (c) { return c.chords.map(function (x) { return x.name; }).join(' '); }).slice(0, 16).join(' | ') + (v.cells.length > 16 ? ' …' : '');
      return '<div class="item"><div class="item-main"><span class="item-title" style="font-size:15px">' + esc(v.name || 'Part') + (v.repeat > 1 ? ' ×' + v.repeat : '') + '</span><span class="item-sub mono">' + esc(body) + '</span></div></div>';
    }).join('');
    var lv = draft.info;
    return '<div class="stack">' +
      (draft.song.origin === 'draft' ? '<div class="notice notice-warn">' + IC.warn + '<div><b>Drafted from memory, not checked against a tab.</b> Chords can be wrong, especially in bridges. Compare it with a tab before you trust it.</div></div>' : '') +
      (draft.warn.length ? '<div class="notice notice-warn">' + IC.warn + '<div>' + draft.warn.map(esc).join(' ') + '</div></div>' : '') +
      '<div class="panel stack"><div class="spread"><span class="eyebrow">What was read</span><span class="small muted num">' + model.targets.length + ' targets to play</span></div><div class="list">' + secs + '</div></div>' +
      '<div class="panel-flat row">' + lvlBadge(lv.level) + '<div class="grow"><b>Suggested level ' + lv.level + ': ' + esc(LEVELS[lv.level].name) + '</b><div class="small muted">' + esc(lv.reasons.join(', ')) + '</div></div></div>' +
      '<div class="fields-3">' +
      '<label class="field"><span>Level</span><select class="select" id="dLevel">' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (n === lv.level ? ' selected' : '') + '>' + n + ' ' + esc(LEVELS[n].name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Tempo, BPM</span><input class="input" id="dBpm" type="number" inputmode="numeric" min="30" max="260" value="' + esc(draft.song.bpm || '') + '" placeholder="e.g. 90"></label>' +
      '<label class="field"><span>Capo fret</span><input class="input" id="dCapo" type="number" inputmode="numeric" min="0" max="12" value="' + esc(draft.song.capo || 0) + '"></label>' +
      '</div>' +
      '<button class="btn btn-primary btn-block" data-act="draft-save">' + IC.check + 'Save to my songs</button></div>';
  }
  function addSheetHtml() {
    var d = draft, q = (d.title + ' ' + d.artist).trim();
    var head = '<div class="sheet-head"><h2 class="title">Add a song</h2><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + IC.x + '</button></div>' +
      '<div class="seg" role="group" aria-label="How to add">' +
      '<button data-act="draft-mode" data-mode="paste" aria-pressed="' + (d.mode === 'paste') + '">Paste a tab</button>' +
      '<button data-act="draft-mode" data-mode="ask" aria-pressed="' + (d.mode === 'ask') + '">Draft chords</button>' +
      '<button data-act="draft-mode" data-mode="chat" aria-pressed="' + (d.mode === 'chat') + '">Ask in chat</button></div>';
    var names = '<div class="fields"><label class="field"><span>Song title</span><input class="input" id="dTitle" value="' + esc(d.title) + '" data-in="dtitle" autocomplete="off"' + (d.title ? '' : ' autofocus') + '></label>' +
      '<label class="field"><span>Artist</span><input class="input" id="dArtist" value="' + esc(d.artist) + '" data-in="dartist" autocomplete="off"></label></div>';
    var body = '';
    if (d.mode === 'paste') {
      body = names +
        '<div class="stack" id="findBox">' + findBoxHtml(q) + '</div>' +
        '<label class="field"><span>Paste the tab or chord sheet here</span><textarea class="textarea" id="dText" data-in="dtext" spellcheck="false" placeholder="[Verse]&#10;G        D&#10;words under the chords&#10;&#10;e|-----0-----|&#10;B|---1---1---|&#10;G|-0-------0-|">' + esc(d.text) + '</textarea></label>' +
        '<p class="small muted">Reads chords written over words, bar lines like | C | G |, ChordPro, and six-line tab with hammer-ons, slides and bends. The text stays in your own library.</p>' +
        (d.err ? '<div class="notice notice-bad">' + IC.warn + '<div>' + esc(d.err) + '</div></div>' : '') +
        '<button class="btn btn-block" data-act="draft-read">Read it</button>' + previewHtml();
    } else if (d.mode === 'ask') {
      body = names +
        (S.hasSample
          ? '<p class="small muted">Claude drafts a chord chart from what it remembers of the song: sections, chords, capo, tempo and level. It does not look anything up, so treat the result as a first draft.</p>' +
            (d.err ? '<div class="notice notice-bad">' + IC.warn + '<div>' + esc(d.err) + '</div></div>' : '') +
            (d.busy ? '<div class="panel-flat row"><span class="spinner"></span><span>Thinking. This can take up to a minute.</span></div>' : '<button class="btn btn-block" data-act="draft-ask">' + IC.spark + 'Draft the chords</button>') + previewHtml()
          : '<div class="notice">' + IC.info + '<div>Drafting needs Claude to be reachable from this page, and it is not in this view. Paste a tab instead, or ask in the chat.</div></div>');
    } else {
      body = '<div class="panel-flat stack"><b>Let Claude fetch it for you.</b><span>In the chat where you got this page, write something like:</span>' +
        '<span class="mono small" style="user-select:all">Add ' + esc(d.title || 'Wonderwall') + (d.artist ? ' by ' + esc(d.artist) : (d.title ? '' : ' by Oasis')) + ' to my practice room</span>' +
        '<span class="small muted">Claude can search tab sites, compare versions, set the level, and put the song straight into this library. It appears here by itself.</span></div>';
    }
    return head + body;
  }
  function findBoxHtml(q) {
    if (!q) return '<p class="small muted">Type the title to get search links for the usual tab sites.</p>';
    return '<div class="row-tight"><span class="small muted">Find it:</span>' + findLinks(q).map(function (l) { return '<a class="btn btn-sm" href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(l[0]) + IC.ext + '</a>'; }).join('') + '</div>';
  }
  function refreshAdd() { $('#sheetBody').innerHTML = addSheetHtml(); }
  function setDraftSong(song, warn) {
    draft.song = song; draft.warn = warn || [];
    var model = M.buildSong(Object.assign({}, song, { shapes: App.songShapes(song) }));
    draft.info = M.suggestLevel(model);
    draft.count = model.targets.length;
  }
  function readDraft() {
    draft.title = ($('#dTitle') || {}).value || draft.title; draft.artist = ($('#dArtist') || {}).value || draft.artist; draft.text = ($('#dText') || {}).value || '';
    draft.err = ''; draft.song = null;
    if (!draft.text.trim()) { draft.err = 'Paste a tab or chord sheet first.'; refreshAdd(); return; }
    var p = M.parseSheet(draft.text);
    if (!p.sections.length) { draft.err = 'No chords or six-line tab found in that text. Check that the chord names sit on their own lines, or that the tab has six lines of dashes.'; refreshAdd(); return; }
    var song = {
      title: draft.title.trim() || p.meta.title || 'Untitled song', artist: draft.artist.trim() || p.meta.artist || '',
      sections: p.sections, capo: p.meta.capo || 0, bpm: p.meta.bpm || null, tuning: p.meta.tuning || 'standard', key: p.meta.key || '',
      origin: 'paste', checked: true, raw: draft.text.length > 60000 ? draft.text.slice(0, 60000) : draft.text
    };
    setDraftSong(song, p.warnings);
    if (!draft.count) { draft.song = null; draft.err = 'The text was recognised, but no playable chords or notes came out of it.'; }
    refreshAdd();
    var b = $('[data-act="draft-save"]'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function askDraft() {
    draft.title = ($('#dTitle') || {}).value || ''; draft.artist = ($('#dArtist') || {}).value || '';
    draft.err = ''; draft.song = null;
    if (!draft.title.trim()) { draft.err = 'Type the song title first.'; refreshAdd(); return; }
    if (!App.sample) { draft.err = 'Claude is not reachable from this view.'; refreshAdd(); return; }
    draft.busy = true; refreshAdd();
    var prompt = 'You are helping a guitar student add a song to a practice app.\n' +
      'Song title: ' + JSON.stringify(draft.title.trim().slice(0, 120)) + '\nArtist: ' + JSON.stringify(draft.artist.trim().slice(0, 120)) + '\n\n' +
      'Reply with only one JSON object and no other text, in this shape:\n' +
      '{"found": true, "title": "...", "artist": "...", "key": "E", "bpm": 85, "capo": 0, "level": 3, "confidence": "high", "note": "one practical playing tip, under 20 words",\n' +
      ' "sections": [{"name": "Verse", "bars": ["Emaj7", "C#m", "G#m", "B"], "repeat": 3}],\n' +
      ' "shapes": {"Emaj7": "x79897"}}\n\n' +
      'Rules:\n- Chords only. Never include lyrics or any words of the song.\n- One array item per bar. A bar with two chords is written "A B".\n' +
      '- Use the way guitarists most commonly play it. If that uses a capo, set "capo" and write chord names as the shapes played relative to the capo.\n' +
      '- "repeat" is how many times the section\'s bars repeat in a row. List sections in song order; repeat a section name when it returns.\n' +
      '- "shapes" maps a chord name to six fret characters from the low E string to the high E string, x for a muted string. Include it only for chords not played as the standard open shape. Use dashes between frets if any fret is above 9.\n' +
      '- "level" is 1 (a few open chords) to 5 (advanced). "confidence" is high, medium or low.\n' +
      '- If you do not know this song\'s chords well, reply {"found": false} instead of guessing.';
    App.sample.json(prompt, { cache: { gcTime: 3600000 } }).then(function (res) {
      draft.busy = false;
      if (!res || res.found === false || !Array.isArray(res.sections)) { draft.err = 'Claude does not know this song well enough to draft it. Paste a tab instead, or ask in the chat so it can look the song up.'; refreshAdd(); return; }
      var sections = [];
      res.sections.forEach(function (sec) {
        if (!sec || !Array.isArray(sec.bars)) return;
        var bars = sec.bars.map(function (b) { return String(b || '').trim(); }).filter(function (b) {
          var toks = M.splitBar(b); return toks.length > 0 && toks.length <= 4 && toks.every(function (t) { return !!M.parseChord(t); });
        });
        if (bars.length) sections.push({ name: String(sec.name || 'Part').slice(0, 40), type: 'chords', bars: bars.slice(0, 64), repeat: App.clamp(parseInt(sec.repeat, 10) || 1, 1, 8) });
      });
      if (!sections.length) { draft.err = 'The draft came back without usable chords. Try again, or paste a tab.'; refreshAdd(); return; }
      var shapes = [];
      if (res.shapes && typeof res.shapes === 'object') Object.keys(res.shapes).slice(0, 30).forEach(function (k) { if (M.parseChord(k) && M.parseShape(String(res.shapes[k]))) shapes.push({ n: k, s: String(res.shapes[k]) }); });
      var bpm = parseInt(res.bpm, 10);
      var song = {
        title: String(res.title || draft.title).slice(0, 120), artist: String(res.artist || draft.artist).slice(0, 120),
        sections: sections.slice(0, 24), shapes: shapes, capo: App.clamp(parseInt(res.capo, 10) || 0, 0, 12), bpm: bpm >= 30 && bpm <= 260 ? bpm : null, tuning: 'standard',
        key: String(res.key || '').slice(0, 8), note: String(res.note || '').slice(0, 160), origin: 'draft', checked: false, confidence: String(res.confidence || '').slice(0, 10)
      };
      setDraftSong(song, res.confidence === 'low' ? ['Claude marked this draft as low confidence.'] : []);
      refreshAdd();
    }).catch(function (e) {
      draft.busy = false;
      var code = e && e.code;
      draft.err = code === 'not_granted' ? 'Drafting was not allowed for this page. Paste a tab instead.' :
        code === 'rate_limited' ? 'Claude is busy or your usage limit is reached. Try again later.' :
        code === 'refused' ? 'Claude declined that request. Paste a tab instead.' :
        code === 'invalid_json' ? 'The draft came back garbled. Try once more.' : 'The draft did not come through. Try again, or paste a tab.';
      refreshAdd();
    });
  }
  function saveDraft() {
    if (!draft || !draft.song) return;
    var song = Object.assign({}, draft.song);
    song.level = App.clamp(parseInt(($('#dLevel') || {}).value, 10) || draft.info.level, 1, 5);
    song.levelAuto = draft.info.level;
    var bpm = parseInt(($('#dBpm') || {}).value, 10); song.bpm = bpm >= 30 && bpm <= 260 ? bpm : (song.bpm || null);
    song.capo = App.clamp(parseInt(($('#dCapo') || {}).value, 10) || 0, 0, 12);
    var id = App.Store.saveSong(song);
    App.sheet.close();
    App.toast('Saved to level ' + song.level + '.');
    App.go({ name: 'practice', id: id });
  }

  /* ----- edit a song ----- */
  function editSheet(id) {
    var s = App.findSong(id); if (!s || s.drill) return;
    var model = App.modelOf(s);
    var tun = typeof s.tuning === 'string' ? s.tuning : 'custom';
    App.sheet.open('<div class="sheet-head"><h2 class="title">Edit song</h2><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + IC.x + '</button></div>' +
      '<label class="field"><span>Title</span><input class="input" id="eTitle" value="' + esc(s.title) + '"></label>' +
      '<label class="field"><span>Artist</span><input class="input" id="eArtist" value="' + esc(s.artist || '') + '"></label>' +
      '<div class="fields"><label class="field"><span>Level</span><select class="select" id="eLevel">' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (n === (s.level || 1) ? ' selected' : '') + '>' + n + ' ' + esc(LEVELS[n].name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Tempo, BPM</span><input class="input" id="eBpm" type="number" inputmode="numeric" min="30" max="260" value="' + esc(s.bpm || '') + '"></label>' +
      '<label class="field"><span>Capo fret</span><input class="input" id="eCapo" type="number" inputmode="numeric" min="0" max="12" value="' + esc(s.capo || 0) + '"></label>' +
      (model.chords.length ? '<label class="field"><span>Beats per chord</span><select class="select" id="eBeats">' + [1, 2, 3, 4, 6, 8].map(function (n) { return '<option value="' + n + '"' + (n === (s.beatsPerSlot || 4) ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' : '') +
      '<label class="field"><span>Tuning</span><select class="select" id="eTuning">' + Object.keys(M.TUNINGS).map(function (k) { return '<option value="' + k + '"' + (k === tun ? ' selected' : '') + '>' + esc(M.TUNINGS[k].name) + '</option>'; }).join('') + (tun === 'custom' ? '<option value="custom" selected>As written in the tab</option>' : '') + '</select></label></div>' +
      (s.checked === false ? '<label class="toggle"><input type="checkbox" id="eChecked">I checked this draft against a tab</label>' : '') +
      '<button class="btn btn-primary btn-block" data-act="edit-save" data-id="' + esc(id) + '">Save changes</button>' +
      '<div class="row" id="delRow"><button class="btn btn-ghost" data-act="del-ask" data-id="' + esc(id) + '" style="color:var(--bad)">' + IC.trash + 'Delete this song</button></div>');
  }
  function saveEdit(id) {
    var s = App.findSong(id); if (!s) return;
    var next = Object.assign({}, s);
    next.title = ($('#eTitle').value || '').trim() || s.title;
    next.artist = ($('#eArtist').value || '').trim();
    next.level = App.clamp(parseInt($('#eLevel').value, 10) || 1, 1, 5);
    var bpm = parseInt($('#eBpm').value, 10); next.bpm = bpm >= 30 && bpm <= 260 ? bpm : null;
    next.capo = App.clamp(parseInt($('#eCapo').value, 10) || 0, 0, 12);
    if ($('#eBeats')) next.beatsPerSlot = parseInt($('#eBeats').value, 10) || 4;
    var tv = $('#eTuning').value; if (tv !== 'custom') next.tuning = tv;
    if ($('#eChecked') && $('#eChecked').checked) next.checked = true;
    App.Store.saveSong(next);
    App.sheet.close();
    App.toast('Saved.');
    App.render();
  }

  /* ----- settings ----- */
  function settingsSheet() {
    var st = S.settings, m = S.mic;
    var micText = m.state === 'live' ? 'The microphone is live.' :
      (m.state === 'blocked' || m.pre === 'blocked') ? (m.why === 'frame' ? 'Not passed on by Claude\'s viewer' : m.why === 'denied' ? 'Set to blocked in your browser' : m.why === 'no-api' || m.why === 'insecure' ? 'Not available in this view' : 'Refused') + (m.detail && m.detail !== 'no-api' ? ' (' + esc(m.detail) + ')' : '') + '.' :
      m.state === 'none' ? 'No microphone found.' : m.state === 'error' ? 'It did not start (' + esc(m.detail) + ').' : m.pre === 'ok' ? 'Allowed. Live listening works in this view.' : 'Not asked yet.';
    var own = App.audio.ownUrl();
    var logLines = App.diag.lines(10);
    App.sheet.open('<div class="sheet-head"><h2 class="title">Settings</h2><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + IC.x + '</button></div>' +
      '<div class="panel stack"><span class="eyebrow">Listening</span>' +
      '<div class="spread"><span>Live microphone</span><span class="small muted" id="micText" style="text-align:right">' + micText + '</span></div>' +
      '<div class="row">' + (m.state === 'live' ? '<button class="btn btn-sm" data-act="mic-off">Turn it off</button>' : askButton()) + ownLink() + '</div>' +
      (own ? '<p class="small muted">Inside Claude\'s viewer the page sits in a frame, and a frame only gets the microphone when the viewer passes it on. Opened on its own, the page can ask your browser directly. If the button does nothing, copy this address into the browser:</p><input class="input mono small" readonly value="' + esc(own) + '" aria-label="Address of this page on its own" data-select>' : '') +
      '<div class="spread"><span>Timing trim<br><span class="small muted">If "in time" scores read late or early for you</span></span><span class="stepper"><button data-act="set-step" data-key="trim" data-d="-10" aria-label="Earlier">−</button><output id="oTrim">' + (st.trim > 0 ? '+' : '') + st.trim + ' ms</output><button data-act="set-step" data-key="trim" data-d="10" aria-label="Later">+</button></span></div>' +
      '</div>' +
      '<div class="panel stack"><span class="eyebrow">Sound</span>' +
      '<div class="spread"><span>Concert pitch, A4</span><span class="stepper"><button data-act="set-step" data-key="a4" data-d="-1" aria-label="Lower">−</button><output id="oA4">' + st.a4 + ' Hz</output><button data-act="set-step" data-key="a4" data-d="1" aria-label="Higher">+</button></span></div>' +
      '<label class="toggle"><input type="checkbox" data-in="set-click"' + (st.click ? ' checked' : '') + '>Metronome click</label>' +
      '<label class="toggle"><input type="checkbox" data-in="set-countin"' + (st.countIn ? ' checked' : '') + '>Count in one bar before starting</label>' +
      '<label class="toggle"><input type="checkbox" data-in="set-tones"' + (st.tones ? ' checked' : '') + '>Play a tone when I tap a string in the tuner</label>' +
      '<p class="small muted">No sound on an iPhone? Flip the ring switch on the side to ring, and turn the volume up.</p></div>' +
      '<div class="panel stack"><span class="eyebrow">Your data</span><p class="small">' +
      (S.store === 'cloud' ? 'Songs and sessions are saved with this page in your Claude account, so they follow you to any device and Claude can read them when you ask for coaching.' : 'Songs and sessions are saved in this browser only.') + '</p>' +
      '<p class="small muted num">' + Object.keys(S.songs).length + ' songs · ' + S.sessions.length + ' sessions logged</p></div>' +
      '<div class="panel stack"><span class="eyebrow">Technical log</span><p class="small muted">What this device allowed and how recordings were read. It is saved with your data, so when something does not work you can ask Claude to look at it.</p>' +
      (logLines.length ? '<div class="logbox mono">' + logLines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' : '<p class="small muted">Nothing logged yet.</p>') + '</div>' +
      '<div class="panel stack"><span class="eyebrow">How scoring works</span><p class="small">Single notes are read with a period detector and checked against the spectrum, so a note counts when it starts, also over ringing strings. Chords are compared with the shape in the chart, including whether the third is major or minor. A note an octave off still counts. Scores were tuned on sampled acoustic and clean electric guitar through a simulated phone microphone; a real room is messier, so read them as a guide.</p></div>');
  }

  /* ================= TUNER ================= */
  var T = App.tuner = { on: false, sel: -1, hist: [], last: null, lastT: 0, tuned: {}, mode: 'live', timer: null, gate: null, hold: 0, clip: null, busy: '' };
  function tuningNow() { return M.tuningMidi(S.settings.tuning); }
  function dialSvg() {
    var cx = 160, cy = 170, r = 132, out = '<svg viewBox="0 0 320 186" aria-hidden="true">';
    function pt(cents, rad) { var a = (cents / 50) * 58 * Math.PI / 180; return [cx + rad * Math.sin(a), cy - rad * Math.cos(a)]; }
    var z1 = pt(-5, r + 6), z2 = pt(5, r + 6), z3 = pt(5, r - 22), z4 = pt(-5, r - 22);
    out += '<path class="zone" id="dialZone" d="M' + z1[0] + ' ' + z1[1] + 'A' + (r + 6) + ' ' + (r + 6) + ' 0 0 1 ' + z2[0] + ' ' + z2[1] + 'L' + z3[0] + ' ' + z3[1] + 'A' + (r - 22) + ' ' + (r - 22) + ' 0 0 0 ' + z4[0] + ' ' + z4[1] + 'z"/>';
    for (var c = -50; c <= 50; c += 5) {
      var major = c % 10 === 0, a = pt(c, r), b = pt(c, r - (major ? 16 : 9));
      out += '<line class="' + (major ? 'tick tick-major' : 'tick') + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
    }
    [[-50, '−50'], [-25, '−25'], [25, '+25'], [50, '+50']].forEach(function (l) { var p = pt(l[0], r - 30); out += '<text class="dial-text" x="' + p[0] + '" y="' + (p[1] + 4) + '" text-anchor="middle">' + l[1] + '</text>'; });
    var f1 = pt(-50, r + 18), f2 = pt(50, r + 18);
    out += '<text class="dial-text" x="' + (f1[0] + 4) + '" y="' + (f1[1] + 2) + '" text-anchor="middle">LOW</text><text class="dial-text" x="' + (f2[0] - 4) + '" y="' + (f2[1] + 2) + '" text-anchor="middle">HIGH</text>';
    out += '<line class="needle is-idle" id="dialNeedle" x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - r + 4) + '"/><circle class="hub" cx="' + cx + '" cy="' + cy + '" r="6"/></svg>';
    return out;
  }
  function viewTuner() {
    var tun = tuningNow();
    var html = '<section class="stack"><div class="spread"><h2 class="title">Tuner</h2>' +
      '<label class="field" style="flex:0 1 190px"><span class="vh">Tuning</span><select class="select" data-in="tuning" aria-label="Tuning">' + Object.keys(M.TUNINGS).map(function (k) { return '<option value="' + k + '"' + (k === S.settings.tuning ? ' selected' : '') + '>' + esc(M.TUNINGS[k].name) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="dial">' + dialSvg() +
      '<div class="readout"><span class="note-name" id="tNote">–</span><span class="note-oct" id="tOct"></span></div>' +
      '<div class="readout-sub" id="tSub">' + (T.on ? 'Pluck one string and let it ring' : 'A4 = ' + S.settings.a4 + ' Hz') + '</div>' +
      '<div class="verdict" id="tVerdict"></div></div>';
    html += '<div class="strings" role="group" aria-label="Strings, low to high">' + tun.map(function (m, i) {
      var thick = [5, 4, 3, 2.4, 1.8, 1.2][i];
      return '<button class="string-btn' + (T.tuned[i] ? ' is-tuned' : '') + '" data-act="string" data-i="' + i + '" aria-pressed="' + (T.sel === i) + '" aria-label="String ' + (6 - i) + ', ' + M.midiName(m) + '"><b>' + M.pcName(m) + '</b><i style="height:' + thick + 'px"></i><small>' + (Math.round(M.midiToFreq(m, S.settings.a4) * 10) / 10) + '</small></button>';
    }).join('') + '</div>' +
      '<p class="small muted">' + (T.sel >= 0 ? 'Tuning string ' + (6 - T.sel) + ' to ' + M.midiName(tun[T.sel]) + '. <button class="link" data-act="string" data-i="-1">Pick the string for me</button>' : 'Tap a string to hear it' + (S.settings.tones ? '' : ' (tones are off in Settings)') + ' and lock the needle to it. Otherwise the nearest string is used.') + '</p>';
    html += '<div class="seg" role="group" aria-label="How to listen"><button data-act="tuner-mode" data-mode="live" aria-pressed="' + (T.mode === 'live') + '">Listen live</button><button data-act="tuner-mode" data-mode="clip" aria-pressed="' + (T.mode === 'clip') + '">Check a clip</button></div>';
    if (T.mode === 'live') {
      html += T.on ? '<button class="btn btn-stop btn-block" data-act="tuner-stop">' + IC.stop + 'Stop listening</button>'
        : '<button class="btn btn-primary btn-block" data-act="tuner-start">' + IC.mic + 'Start listening</button>';
      html += micNotice(false);
    } else {
      html += '<div class="drop"><b>Record one string ringing for two or three seconds.</b><span class="small muted">Tap a string above first so the page knows which one you mean, then record or pick the clip.</span>' +
        '<div class="row"><label class="btn grow">' + IC.video + 'Record a clip<input class="vh" type="file" accept="video/*" capture="environment" data-file="tuner"></label>' +
        '<label class="btn grow">' + IC.file + 'Pick a recording<input class="vh" type="file" accept="audio/*,video/*" data-file="tuner"></label></div>' +
        (T.busy ? '<div class="row"><span class="spinner"></span><span class="small">' + esc(T.busy) + '</span></div>' : '') +
        '<div id="tapBox"></div></div>';
    }
    html += '</section>';
    return html;
  }
  function showReading(midi, live) {
    var tun = tuningNow(), a4 = S.settings.a4;
    var target, si = T.sel;
    if (si < 0) {
      var best = 0, bd = 99;
      tun.forEach(function (m, i) { var dd = Math.abs(midi - m); if (dd < bd) { bd = dd; best = i; } });
      si = bd <= 2.5 ? best : -1;
    }
    target = si >= 0 ? tun[si] : Math.round(midi);
    var cents = (midi - target) * 100;
    var noteEl = $('#tNote'); if (!noteEl) return;
    noteEl.textContent = M.pcName(target);
    $('#tOct').textContent = String(Math.floor(target / 12) - 1);
    var shown = App.clamp(cents, -50, 50);
    var needle = $('#dialNeedle');
    needle.classList.remove('is-idle');
    needle.style.transform = 'rotate(' + (shown / 50 * 58) + 'deg)';
    var inTune = Math.abs(cents) <= 5;
    $('#dialZone').classList.toggle('is-on', inTune);
    var hz = M.midiToFreq(midi, a4);
    $('#tSub').textContent = (cents >= 0 ? '+' : '−') + Math.abs(Math.round(cents)) + ' cents · ' + (Math.round(hz * 10) / 10) + ' Hz' + (si >= 0 ? ' · string ' + (6 - si) : ' · not a string of this tuning');
    var v = $('#tVerdict');
    if (inTune) v.innerHTML = '<span class="pill pill-good">' + IC.check + 'In tune</span>';
    else if (Math.abs(cents) > 250) v.innerHTML = '<span class="pill pill-bad">' + (cents < 0 ? IC.up : IC.down) + (cents < 0 ? 'Far too low, tighten' : 'Far too high, loosen') + '</span>';
    else v.innerHTML = '<span class="pill pill-adjust">' + (cents < 0 ? IC.up : IC.down) + (cents < 0 ? 'Too low, tighten' : 'Too high, loosen') + '</span>';
    if (live && si >= 0) {
      if (inTune) { T.hold++; if (T.hold >= 10 && !T.tuned[si]) { T.tuned[si] = true; var b = $all('.string-btn')[si]; if (b) b.classList.add('is-tuned'); } }
      else T.hold = 0;
    } else if (!live && si >= 0 && inTune) { T.tuned[si] = true; var b2 = $all('.string-btn')[si]; if (b2) b2.classList.add('is-tuned'); }
  }
  function tunerIdle() {
    var needle = $('#dialNeedle'); if (!needle) return;
    needle.classList.add('is-idle'); needle.style.transform = 'rotate(0deg)';
    $('#dialZone').classList.remove('is-on');
    $('#tNote').textContent = '–'; $('#tOct').textContent = '';
    $('#tSub').textContent = T.on ? 'Pluck one string and let it ring' : 'A4 = ' + S.settings.a4 + ' Hz';
    $('#tVerdict').innerHTML = '';
  }
  function tunerTick() {
    if (!T.on || S.route.name !== 'tuner') return;
    var f = App.audio.frame(true, false); if (!f) return;
    var t = App.audio.now(), g = T.gate.push(f.rms, t, f.hf);
    if (g.voiced && f.clarity >= 0.9 && f.midi === f.midi) {
      T.hist.push(f.midi); if (T.hist.length > 5) T.hist.shift();
      /* drop readings that jump away from the recent ones (the pluck itself, an octave slip) */
      var med = PR.dsp.median(T.hist);
      if (Math.abs(f.midi - med) < 0.6 || T.hist.length < 3) { showReading(med, true); T.lastT = t; }
    } else if (t - T.lastT > 1.6 && T.lastT) { T.hist = []; T.lastT = 0; T.hold = 0; tunerIdle(); }
  }
  T.start = function () {
    App.audio.hush();
    App.audio.askMic().then(function (ok) {
      if (!ok) { T.mode = 'clip'; App.render(true); App.toast(App.micSaid() + ' Check a clip instead.'); return; }
      T.on = true; T.hist = []; T.gate = new PR.track.Gate(); T.hold = 0;
      App.audio.an.setA4(S.settings.a4);
      clearInterval(T.timer); T.timer = setInterval(tunerTick, 45);
      App.wake.on();
      App.render(true);
    });
  };
  T.stop = function (keepMic) {
    T.on = false; clearInterval(T.timer); T.timer = null;
    if (!keepMic) App.audio.micStop();
    App.wake.off();
  };
  T.clipFile = function (file) {
    if (!file) return;
    T.busy = 'Reading the clip…'; App.render(true);
    var note = App.fileNote(file);
    App.readTake(file, function (p, what) { T.busy = what === 'listening' ? 'Listening to the clip, ' + Math.round(p * 100) + '%' : 'Reading the clip…'; var el = $('.drop .small:last-of-type'); if (el && T.busy) el.textContent = T.busy; }, function (resume) {
      var box = $('#tapBox'); if (box) { box.innerHTML = '<button class="btn btn-primary btn-block" id="tapGo">Tap to listen to the clip</button>'; $('#tapGo').onclick = function () { box.innerHTML = ''; resume(); }; }
    }).then(function (take) {
      App.diag.add('clip', note + ' -> ' + take.how + (take.wrap ? ' (' + take.wrap + ')' : '') + ' in ' + (take.ms / 1000).toFixed(1) + ' s' + (take.trail.length ? ' (after ' + take.trail.join('; ') + ')' : ''));
      var max = Math.min(take.pcm.length, Math.round(take.sr * 12));
      return App.framesOf({ pcm: take.pcm.subarray(0, max), sr: take.sr }, { chroma: false });
    }).then(function (frames) {
      T.busy = ''; App.render(true);
      var cp = PR.take.clipPitch(frames);
      if (!cp) { App.diag.add('clip', 'no clear note found'); App.toast('No clear note in that clip. Record one string, close to the phone.'); return; }
      showReading(cp.midi, false);
    }).catch(function (e) {
      T.busy = ''; App.render(true);
      App.diag.add('clip', note + ' -> could not be read: ' + (e && e.trail ? e.trail.join('; ') : ((e && e.message) || 'error')));
      App.toast(e && e.message === 'empty' ? 'That file had no sound in it.' : 'That file could not be read here. Try a sound recording (a voice memo) instead of a video.');
    });
  };

  App.views = { today: viewToday, songs: viewSongs, tuner: viewTuner, wireChart: wireChart };
  App.addSong = { open: function () { if (!draft) newDraft(); draft.err = ''; App.sheet.open(addSheetHtml(), null); }, refresh: refreshAdd, read: readDraft, ask: askDraft, save: saveDraft, draft: function () { return draft; }, reset: newDraft, findBoxHtml: findBoxHtml };
  App.editSong = { open: editSheet, save: saveEdit };
  App.settingsSheet = settingsSheet;
  App.tunerIdle = tunerIdle;
})(typeof window !== 'undefined' ? window : globalThis);

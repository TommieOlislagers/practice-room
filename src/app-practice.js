/* app-practice.js: the song page, live listening, play-along, take scoring, the one-minute change drill. */
(function (root) {
  'use strict';
  var PR = root.PR, M = PR.music, App = PR.app, S = App.S, esc = App.esc, IC = App.IC, $ = App.$, $all = App.$all, A = App.audio;

  var P = App.practice = { st: null }, Stage = PR.stage;

  /* ---------- chord diagram ---------- */
  function shapeSvg(frets) {
    if (!frets) return '<svg viewBox="0 0 66 78"></svg>';
    var fretted = frets.filter(function (f) { return f !== null && f > 0; });
    var max = fretted.length ? Math.max.apply(null, fretted) : 0, min = fretted.length ? Math.min.apply(null, fretted) : 0;
    var base = max <= 5 ? 1 : min;
    var x0 = 15, dx = 8.8, y0 = 17, dy = 11.4, rows = 5, out = '<svg viewBox="0 0 66 78" aria-hidden="true">';
    for (var r = 0; r <= rows; r++) out += '<line class="' + (r === 0 && base === 1 ? 'fb-nut' : 'fb-line') + '" x1="' + x0 + '" x2="' + (x0 + dx * 5) + '" y1="' + (y0 + r * dy) + '" y2="' + (y0 + r * dy) + '"/>';
    for (var s = 0; s < 6; s++) out += '<line class="fb-line" x1="' + (x0 + s * dx) + '" x2="' + (x0 + s * dx) + '" y1="' + y0 + '" y2="' + (y0 + rows * dy) + '"/>';
    frets.forEach(function (f, i) {
      var x = x0 + i * dx;
      if (f === null) out += '<path class="fb-x" d="M' + (x - 2.6) + ' 6.4l5.2 5.2M' + (x + 2.6) + ' 6.4l-5.2 5.2"/>';
      else if (f === 0) out += '<circle class="fb-open" cx="' + x + '" cy="9" r="2.7"/>';
      else { var row = f - base; if (row >= 0 && row < rows) out += '<circle class="fb-dot" cx="' + x + '" cy="' + (y0 + row * dy + dy / 2) + '" r="3.5"/>'; }
    });
    if (base > 1) out += '<text class="fb-text" x="' + (x0 - 5.5) + '" y="' + (y0 + dy / 2 + 3) + '" text-anchor="end">' + base + '</text>';
    return out + '</svg>';
  }

  /* ---------- the chart ---------- */
  function chartHtml(model) {
    var html = '';
    model.view.forEach(function (v, vi) {
      html += '<section class="stack" data-sec="' + vi + '"><div class="sec-head"><h3 class="h3">' + esc(v.name || 'Part') + '</h3>' + (v.type === 'chords' && v.repeat > 1 ? '<span class="small muted">played ' + v.repeat + ' times</span>' : '') + '</div>';
      if (v.type === 'chords') {
        html += '<div class="cells">' + v.cells.map(function (c) {
          return '<div class="cell' + (c.chords.length > 1 ? ' is-two' : '') + '">' + c.chords.map(function (ch) {
            return ch.target < 0 ? '<span class="is-rest">' + esc(ch.name) + '</span>' : '<span data-t="' + ch.target + '">' + esc(ch.name) + '</span>';
          }).join('') + '</div>';
        }).join('') + '</div>';
      } else {
        v.systems.forEach(function (sys) {
          var lines = sys.lines.map(function (text, li) {
            var spans = sys.spans.filter(function (sp) { return sp.line === li; }).sort(function (a, b) { return a.col - b.col; });
            var out = '<span class="tl">' + esc((sys.labels[li] + ' ').slice(0, 2)) + '|</span>', pos = 0;
            var body = text.charAt(0) === '|' ? text : text;
            spans.forEach(function (sp) {
              if (sp.col < pos) return;
              out += esc(body.slice(pos, sp.col)) + '<span class="tn" data-t="' + sp.target + '">' + esc(body.substr(sp.col, sp.len)) + '</span>';
              pos = sp.col + sp.len;
            });
            return out + esc(body.slice(pos));
          });
          html += '<div class="tabsys"><pre>' + lines.join('\n') + '</pre></div>';
        });
      }
      html += '</section>';
    });
    return html;
  }

  /* ---------- selection and timing ---------- */
  function selection() {
    var st = P.st, all = st.model.targets, from = 0, to = all.length - 1;
    if (st.section >= 0 && st.model.view[st.section]) { from = st.model.view[st.section].first; to = st.model.view[st.section].last; }
    var out = [];
    for (var i = from; i <= to; i++) { var t = Object.assign({}, all[i]); t.orig = all[i].index; t.index = out.length; out.push(t); }
    return out;
  }
  function selTimed(sel) { return sel.length > 0 && sel.every(function (t) { return t.beat !== null && t.beat !== undefined && t.beats > 0; }); }
  function bpmNow() { var st = P.st; return Math.max(20, Math.round((st.song.bpm || 80) * st.pct / 100)); }
  function sectionName() { var st = P.st; return st.section >= 0 && st.model.view[st.section] ? (st.model.view[st.section].name || 'Part') : 'Whole song'; }

  /* ---------- view ---------- */
  function modeDefault() { return (S.mic.pre === 'blocked' || S.mic.state === 'blocked') ? 'take' : 'live'; }
  P.open = function (id) {
    var song = App.findSong(id);
    if (!song) { App.go({ name: 'songs' }); return; }
    P.stopAll(true);
    var model = App.modelOf(song);
    P.st = { id: id, song: song, model: model, base: model, way: 'chords', mode: song.exercise && modeDefault() === 'take' ? 'along' : modeDefault(), live: 'wait', section: -1, pct: 100, loop: false, run: null, take: null, busy: '', report: null, from: '', showPath: false };
  };
  /* play the same bars another way (app-ways.js): the part being practised stays the same part */
  P.setWay = function (way) {
    var st = P.st; if (!st || st.run) return;
    var ids = App.ways.list(st.song).map(function (w) { return w.id; });
    if (ids.indexOf(way) < 0) way = 'chords';
    var si = st.section >= 0 && st.model.view[st.section] ? st.model.view[st.section].index : -1;
    st.way = way; st.model = way === 'chords' ? st.base : App.modelOf(App.ways.song(st.song, way)); st.marks = {};
    st.section = -1;
    if (si >= 0 && way !== 'tab') st.model.view.forEach(function (v, i) { if (v.index === si) st.section = i; });
    if (st.mode === 'live' && st.live === 'tempo' && !st.model.timed) st.live = 'wait';
  };
  function slotCount(n, per) { return per === 4 ? ['', 'e', '&', 'a'][n % 4] : per === 3 ? ['', '&', 'a'][n % 3] : per === 2 ? ['', '&'][n % 2] : ''; }
  /* the strumming pattern as a row of arrows over the count */
  function strumHtml(song) {
    var B = App.ways.barBeats(song), pat = App.ways.pattern(song), slots = M.strumSlots(pat, B);
    if (!slots) return '';
    var per = slots.length / B, cells = slots.map(function (s, i) {
      var beat = i % per === 0;
      return '<span class="sp-cell' + (beat ? ' is-beat' : '') + (s ? '' : ' is-miss') + '"><i class="' + (s === 'U' ? 'up' : s === 'D' ? 'down' : '') + '">' + (s === 'D' ? '↓' : s === 'U' ? '↑' : '·') + '</i><small>' + (beat ? (i / per + 1) : slotCount(i, per)) + '</small></span>';
    }).join('');
    return '<div class="strum-pat" role="img" aria-label="Strumming pattern ' + esc(pat) + '">' + cells + '</div>';
  }
  P.strumHtml = strumHtml;
  /* two bars of the pattern on the song's first chord, with the click */
  P.hearStrum = function () {
    var st = P.st; if (!st || st.run) return;
    var B = App.ways.barBeats(st.song), slots = M.strumSlots(App.ways.pattern(st.song), B), c = st.base.chords[0];
    if (!slots || !c) return;
    A.ensure(); A.hush();
    var dur = 60 / bpmNow() * B / slots.length, per = slots.length / B, t0 = A.ctx.currentTime + 0.15;
    clearTimeout(P.hearT); (P.hearTs || []).forEach(clearTimeout); P.hearTs = [];
    for (var bar = 0; bar < 2; bar++) slots.forEach(function (s, i) {
      var at = (bar * slots.length + i) * dur;
      if (i % per === 0) A.click(t0 + at, i === 0);
      if (!s) return;
      P.hearTs.push(setTimeout(function () { var m = s === 'U' ? c.midis.slice(-3).reverse() : c.midis; A.hush(); m.forEach(function (x, k) { setTimeout(function () { A.pluck(M.midiToFreq(x, S.settings.a4), 1.6); }, k * 14); }); }, (0.15 + at) * 1000));
    });
  };
  function waysHtml() {
    var st = P.st, song = st.song, ways = App.ways.list(song);
    if (ways.length < 2 && !ways.length) return '';
    var cur = App.ways.by[st.way] || App.ways.by.chords, main = App.ways.main(song), has = !!(song.lead && song.lead.sections && song.lead.sections.length);
    var what = song.melody ? 'melody' : 'riff or solo';
    var html = '<section class="stack" id="pWays"><div class="sec-head"><h3 class="h2">Ways to play it</h3><span class="small muted num">' + ways.length + '</span></div>' +
      '<div class="chips" role="group" aria-label="Way to play">' + ways.map(function (w) { return '<button class="chip" data-act="p-way" data-way="' + w.id + '" aria-pressed="' + (st.way === w.id) + '">' + esc(w.name) + (w.id === main ? ' ★' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="panel stack-sm"><div class="spread"><b>' + esc(cur.name) + '</b>' + (cur.id === main ? '<span class="small muted">the way this song is finished</span>' : '') + '</div><span class="small">' + esc(cur.blurb) + '</span>' +
      (cur.id === 'strum' || cur.id === 'chords' ? (cur.id === 'chords' ? '<span class="small muted">Once the changes land, this is the pattern the song is strummed with:</span>' : '') + strumHtml(song) + '<div class="row"><button class="btn btn-sm btn-tinted" data-act="strum-hear">' + IC.play + 'Hear the pattern</button>' + (cur.id === 'chords' ? '<button class="btn btn-sm" data-act="p-way" data-way="strum">Play it this way</button>' : '') + '</div>' : '') +
      (cur.id !== 'chords' && cur.id !== 'tab' && App.videoButton(App.videoKeyOf(cur.id), 'Watch a lesson on this') ? '<div class="row">' + App.videoButton(App.videoKeyOf(cur.id), 'Watch a lesson on this') + '</div>' : '') + '</div>' +
      '<div class="panel stack-sm"><b>The ' + what + ' itself</b>' + (has
        ? '<span class="small">Your tab is attached to this song' + (st.way === 'tab' ? ' and selected' : '') + '.</span><div class="row">' + (st.way === 'tab' ? '' : '<button class="btn btn-sm btn-tinted" data-act="p-way" data-way="tab">Play it</button>') + '<button class="btn btn-sm" data-act="lead-add" data-id="' + esc(song.id) + '">Replace</button><button class="btn btn-sm" data-act="lead-remove" data-id="' + esc(song.id) + '" style="color:var(--bad)">Remove</button></div>'
        : '<span class="small">' + (App.videoButton(song.id, 'x', ['riff', 'intro', 'solo', 'melody']) ? 'A teacher shows it in the video. To practise it on the highway as well, find a tab of it and paste it in: it becomes a part of this song with its own step on the path.' : 'The recorded ' + what + ' is not written out here. Find a tab of it, paste it in, and it becomes a part of this song with its own notes on the highway and its own step on the path.') + '</span><div class="row">' + App.videoButton(song.id, 'Watch how it is played', ['riff', 'intro', 'solo', 'melody']) + '<button class="btn btn-sm' + (App.videoButton(song.id, 'x', ['riff', 'intro', 'solo', 'melody']) ? '' : ' btn-tinted') + '" data-act="lead-add" data-id="' + esc(song.id) + '">' + IC.plus + 'Paste a tab</button></div>') + '</div></section>';
    return html;
  }
  function controlsHtml() {
    var st = P.st, model = st.model, sel = selection(), timed = selTimed(sel);
    var secOpts = '<option value="-1"' + (st.section < 0 ? ' selected' : '') + '>Whole song</option>' + model.view.map(function (v, i) { return '<option value="' + i + '"' + (st.section === i ? ' selected' : '') + '>' + esc(v.name || 'Part ' + (i + 1)) + '</option>'; }).join('');
    var what = model.kind === 'chords' ? 'chord' : 'note';
    var html = '<div class="seg" role="group" aria-label="How to practise">' +
      '<button data-act="p-mode" data-mode="live" aria-pressed="' + (st.mode === 'live') + '">Listen live</button>' +
      '<button data-act="p-mode" data-mode="take" aria-pressed="' + (st.mode === 'take') + '">Check a take</button>' +
      '<button data-act="p-mode" data-mode="along" aria-pressed="' + (st.mode === 'along') + '">Play along</button></div>';
    if (st.mode === 'live') {
      html += '<div class="seg" role="group" aria-label="Live mode"><button data-act="p-live" data-live="wait" aria-pressed="' + (st.live === 'wait') + '">Wait for me</button><button data-act="p-live" data-live="tempo" aria-pressed="' + (st.live === 'tempo') + '"' + (timed ? '' : ' disabled') + '>Keep time</button></div>';
    }
    html += '<div class="group">' +
      (model.view.length > 1 ? '<div class="item"><span class="grow">Part</span><select class="select" data-in="p-section" aria-label="Part to practise" style="width:auto;max-width:62%;background-color:var(--fill);min-height:36px;font-size:15px">' + secOpts + '</select></div>' : '') +
      (st.mode === 'take' ? '' : '<div class="item"><span class="grow">Tempo</span><span class="stepper"><button data-act="p-tempo" data-d="-5" aria-label="Slower">−</button><output id="oTempo">' + bpmNow() + ' BPM</output><button data-act="p-tempo" data-d="5" aria-label="Faster">+</button></span></div>') +
      '<label class="item toggle"><input type="checkbox" data-in="p-loop"' + (st.loop ? ' checked' : '') + '><span>' + (st.mode === 'take' ? 'I go round it more than once' : 'Loop') + '</span></label></div>';
    html += '<p class="small muted" style="padding-inline:4px">' + (
      st.mode === 'live' ? (st.live === 'wait' ? 'The highway waits at each ' + what + ' until it hears the right one. Take as long as you need.' : 'The highway runs with the click at ' + bpmNow() + ' BPM. Each ' + what + ' has to sound as it crosses the line.') + (timed ? '' : ' This tab has no rhythm written in it, so keeping time is not available.') :
      st.mode === 'along' ? 'No microphone. The highway runs with the click at ' + bpmNow() + ' BPM' + (timed ? '' : ', one note a beat because this tab has no rhythm written in it') + (S.settings.guide !== false ? ', the page plays each ' + what + ' as a guide' : '') + ', and you rate yourself at the end.' :
      'Play at your own speed and record it. The recording is scored the same way as live playing.') + '</p>';
    return html;
  }
  function actionHtml() {
    var st = P.st;
    if (st.mode === 'take') {
      return '<div class="drop"><b>Record yourself playing ' + esc(sectionName() === 'Whole song' ? 'the song' : 'this part') + ', then pick the file.</b>' +
        '<span class="small muted">Phone about an arm’s length from the guitar, up to five minutes. Record a take opens the camera: film yourself, then keep the video. Only the sound is read, and nothing leaves your phone.</span>' +
        '<label class="btn btn-primary btn-play btn-block">' + IC.video + 'Record a take<input class="vh" type="file" accept="video/*" capture="environment" data-file="take"></label>' +
        '<label class="btn btn-tinted btn-block">' + IC.file + 'Pick a recording<input class="vh" type="file" accept="audio/*,video/*" data-file="take"></label>' +
        (st.busy ? '<div class="row"><span class="spinner"></span><span class="small" id="takeBusy">' + esc(st.busy) + '</span></div><div class="progress"><i id="takeProg"></i></div>' : '') +
        '<div id="tapBox"></div></div>';
    }
    if (st.run) return '';
    return '<button class="btn btn-primary btn-play btn-block" data-act="p-start">' + (st.mode === 'live' ? IC.mic + 'Start listening' : IC.play + 'Start') + '</button>';
  }
  function fmtScore(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function viewPractice() {
    var st = P.st; if (!st) return '';
    var song = st.song, model = st.model;
    var stats = App.computeStats(), ss = App.songStatus(stats, song.id), game = App.computeGame(), gs = game.songs[song.id] || { stars: 0, best: null, score: 0 };
    var own = song.drill || song.exercise, parent = st.from ? App.findSong(st.from) : null, path = own ? null : App.path.of(song);
    var exPass = song.exercise ? App.path.passed(song.id) : null;
    var listen = own || !song.artist ? '' : '<a class="chip" href="https://www.youtube.com/results?search_query=' + encodeURIComponent(song.artist + ' ' + song.title) + '" target="_blank" rel="noopener noreferrer" style="color:var(--tint-text)">Listen' + IC.ext + '</a>';
    var html = '<section class="stack">' +
      '<div class="spread">' + (parent ? '<button class="btn btn-ghost back" data-act="open" data-id="' + esc(parent.id) + '">' + IC.back + esc(parent.title.length > 22 ? parent.title.slice(0, 21) + '…' : parent.title) + '</button>' : '<button class="btn btn-ghost back" data-act="go" data-to="' + (song.exercise ? 'today' : 'songs') + '">' + IC.back + (song.exercise ? 'Today' : 'Songs') + '</button>') + (own ? '' : '<button class="btn btn-ghost" data-act="edit" data-id="' + esc(song.id) + '">Edit</button>') + '</div>' +
      '<div class="title-row">' + (own ? App.lvlBadge(song.level || 1) : App.art(song, 'art-md', 160)) + '<div class="grow"><h2 class="title">' + esc(song.title) + '</h2><div class="item-sub" style="font-size:16px">' + esc(song.artist ? song.artist + (song.album ? ' · ' + song.album : '') + (song.year ? ', ' + song.year : '') : (song.drill ? 'Built-in drill' : song.exercise ? (song.kind === 'shape' ? 'Chord shape' : song.kind === 'scale' ? 'Scale' : 'Technique drill') : '')) + '</div></div>' + (own ? '' : '<span class="pill ' + (path && path.mastered ? 'pill-good' : ss.cls) + '" style="margin-top:8px">' + (path && path.mastered ? 'Finished' : ss.label) + '</span>') + '</div>' +
      (song.exercise ? '<div class="notice' + (exPass && exPass.at ? ' notice-good' : '') + '">' + (exPass && exPass.at ? IC.check : IC.target) + '<div>' + (exPass && exPass.at ? '<b>Passed.</b> Best so far ' + App.pct(exPass.best) + '%. Play it again any time to keep it fresh.' : '<b>Pass this at 80% to tick the step.</b>' + (exPass && exPass.best !== null ? ' Best so far ' + App.pct(exPass.best) + '%.' : '')) + (parent ? ' It is a step toward ' + esc(parent.title) + '.' : '') + '</div></div>' : '') +
      '<div class="row-tight">' + (own ? '' : '<span class="chip">Level ' + (song.level || 1) + '</span>') + App.songChips(song, model) + (song.key ? '<span class="chip">Key ' + esc(song.key) + '</span>' : '') + (song.genre ? '<span class="chip">' + esc(song.genre) + '</span>' : '') + listen +
      (song.source && song.source.url && /^https?:\/\//.test(song.source.url) ? '<a class="chip" href="' + esc(song.source.url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--tint-text)">' + esc(song.source.label || 'Source') + IC.ext + '</a>' : '') + '</div>' +
      '<div class="best"><div><span>Stars</span>' + App.starsHtml(gs.stars) + '</div><div><span>Best</span><b>' + (gs.best === null ? '–' : App.pct(gs.best) + '%') + '</b></div><div><span>High score</span><b>' + (gs.score ? fmtScore(gs.score) : '–') + '</b></div></div>' +
      (song.checked === false ? '<div class="notice notice-warn">' + IC.warn + '<div>' + (song.builtin ? '<b>Not fully checked.</b> Only one source could be found for this harmony, so some bars are a best reading. Trust your ears, and fix it under Edit if it sounds wrong.' : '<b>Draft, not checked.</b> These chords came from memory. Compare them with a tab, then mark the song as checked under Edit.') + '</div></div>' : '') +
      (song.note ? '<p class="note">' + esc(song.note) + '</p>' : '') +

      (model.broken || !model.targets.length ? '<div class="notice notice-bad">' + IC.warn + '<div>This song has nothing playable in it. Delete it and add it again.</div></div>' : '') +
      '</section>';
    if (!model.targets.length) return html;
    if (path) html += App.pathCard(song, st.showPath);
    if (song.exercise) html += App.videosHtml(App.videoKeyOf(song.id), 'Watch it first');
    else if (!song.drill) html += App.videosHtml(song.id, 'Video lessons', song.artist ? song.artist + ' ' + song.title + ' guitar lesson' : (song.title + ' guitar lesson'), !!song.melody);
    if (!own) html += waysHtml();
    if (path) html += '<div class="sec-head"><h3 class="h2">Free play</h3><span class="small muted">' + esc((App.ways.by[st.way] || {}).name || 'Chords') + ' · any part, any tempo</span></div>';
    html += '<section class="stack" id="pControls">' + controlsHtml() + '</section>';
    html += '<section class="stack" id="pAction">' + actionHtml() + (st.mode === 'live' ? App.micNotice(true) : '') + '</section>';
    if (st.base.chords.length) {
      html += '<section class="stack"><div class="sec-head"><h3 class="h2">Shapes</h3><span class="small muted">tap to hear' + (song.capo ? ' · frets count from the capo' : '') + '</span></div><div class="shapes">' + st.base.chords.map(function (c, i) {
        return '<button class="shape" data-act="p-hear" data-i="' + i + '" aria-label="Hear ' + esc(c.name) + '"><b>' + esc(c.name) + '</b>' + shapeSvg(c.shape) + '<small>' + (c.shape ? esc(M.shapeToString(c.shape)) : 'no shape') + '</small></button>';
      }).join('') + '</div>' +
      (st.base.chords.length >= 2 ? '<button class="btn btn-tinted btn-block" data-act="omc-pick">' + IC.swap + 'One-minute change drill</button>' : '') + '</section>';
    }
    html += '<section class="stack"><div class="sec-head"><h3 class="h2">Chart</h3></div><div class="stack-lg" id="pChart">' + chartHtml(model) + '</div></section>';
    return html;
  }
  P.view = viewPractice;

  /* ---------- chart state ---------- */
  function elsOf(orig) { return $all('#pChart [data-t="' + orig + '"]'); }
  function mark(orig, cls) {
    if (P.st) { if (!P.st.marks) P.st.marks = {}; P.st.marks[orig] = cls; }
    elsOf(orig).forEach(function (el) { el.classList.remove('is-hit', 'is-late', 'is-miss', 'is-now'); if (cls) el.classList.add(cls); });
  }
  function clearMarks() { if (P.st) P.st.marks = {}; $all('#pChart [data-t]').forEach(function (el) { el.classList.remove('is-hit', 'is-late', 'is-miss', 'is-now'); }); $all('#pChart .cell.is-cur').forEach(function (c) { c.classList.remove('is-cur'); }); }
  /* the page is redrawn when a result sheet closes: put the last run's marks back on the chart */
  P.applyMarks = function () {
    var m = P.st && P.st.marks; if (!m) return;
    Object.keys(m).forEach(function (k) { if (m[k]) elsOf(k).forEach(function (el) { el.classList.add(m[k]); }); });
  };
  var nowOrig = -1;
  function setNow(sel, i) {
    var cur = sel[i], nxt = sel[i + 1] || (P.st.loop ? sel[0] : null);
    if (nowOrig >= 0) elsOf(nowOrig).forEach(function (el) { el.classList.remove('is-now'); var c = el.closest('.cell'); if (c) c.classList.remove('is-cur'); });
    nowOrig = cur ? cur.orig : -1;
    var hn = $('#hudNow'); if (!hn) return;
    hn.textContent = cur ? cur.label : 'Done';
    hn.classList.toggle('is-note', !!cur && cur.kind === 'note');
    $('#hudDetail').textContent = cur && cur.detail ? cur.detail : '';
    $('#hudNext').textContent = nxt ? nxt.label : '–';
    if (!cur) return;
    var els = elsOf(cur.orig);
    els.forEach(function (el) { el.classList.add('is-now'); var c = el.closest('.cell'); if (c) c.classList.add('is-cur'); });
    if (els[0]) keepInView(els[0]);
  }
  function keepInView(el) {
    if (Stage.on) return;
    try {
      var sys = el.closest('.tabsys');
      if (sys) { var er = el.getBoundingClientRect(), sr = sys.getBoundingClientRect(); if (er.left < sr.left + 30 || er.right > sr.right - 30) sys.scrollLeft += er.left - sr.left - sr.width / 2; }
      var r = el.getBoundingClientRect(), hud = $('#hud'), top = hud ? hud.getBoundingClientRect().bottom + 12 : 80, vh = root.innerHeight || 700;
      if (r.top < top || r.bottom > vh - 24) root.scrollBy({ top: r.top - top - 40, behavior: 'smooth' });
    } catch (e) { /* scrolling is a nicety */ }
  }
  function setText(id, v) { var el = $(id); if (el && el.textContent !== v) el.textContent = v; }
  function beatsDots(n, on) {
    var el = $('#hudBeats'); if (!el) return;
    if (el.children.length !== n) { var h = ''; for (var i = 0; i < n; i++) h += '<i></i>'; el.innerHTML = h; }
    for (var j = 0; j < el.children.length; j++) el.children[j].classList.toggle('is-on', j === on);
  }

  /* ---------- running ---------- */
  function refreshAction() { var a = $('#pAction'); if (a) a.innerHTML = actionHtml() + (P.st.mode === 'live' ? App.micNotice(true) : ''); }
  function refreshControls() { var c = $('#pControls'); if (c) c.innerHTML = controlsHtml(); }
  P.start = function () {
    var st = P.st; if (!st || st.run) return;
    var sel = selection();
    if (!sel.length) return;
    A.hush();
    if (st.mode === 'live') {
      A.askMic().then(function (ok) {
        if (!ok) {
          st.mode = 'take'; App.render(true);
          App.toast(App.micSaid() + ' Record a take instead.');
          return;
        }
        A.an.setA4(S.settings.a4);
        PR.track.prepareTargets(sel, S.settings.a4);
        if (st.live === 'tempo' && selTimed(sel)) startTempo(sel, true); else startWait(sel);
      });
    } else if (st.mode === 'along') {
      A.ensure();
      /* a tab with no rhythm written in it is laid out one note to a beat */
      if (!selTimed(sel)) sel.forEach(function (t, i) { t.beat = i; t.beats = 1; });
      startTempo(sel, false);
    }
  };
  function beginRun(run, stage) {
    var st = P.st;
    st.run = run; st.report = null;
    run.score = 0; run.combo = 0; run.maxCombo = 0;
    clearMarks();
    App.wake.on();
    Stage.open(Object.assign({ title: st.song.title, sub: (st.way && st.way !== 'chords' ? App.ways.by[st.way].name + ' · ' : '') + sectionName() + ' · ' + (run.kind === 'wait' ? 'at your own pace' : bpmNow() + ' BPM'), sel: run.sel }, stage));
    refreshAction();
    run.timer = setInterval(run.tick, 40);
  }
  /* one result in: points, the multiplier, what the stage shows. acc is the run's accuracy so far. */
  function award(run, index, kind, acc, judged) {
    var pts = 0;
    if (kind === 'miss') run.combo = 0;
    else { run.combo++; if (run.combo > run.maxCombo) run.maxCombo = run.combo; pts = (kind === 'hit' ? 100 : 50) * App.multOf(run.combo); run.score += pts; }
    Stage.result(index, kind, pts, run.combo);
    Stage.hud({ score: run.score, mult: App.multOf(run.combo), combo: run.combo, stars: judged >= 3 ? App.starsFor(acc, P.st.pct) : 0 });
  }
  function startWait(sel) {
    var st = P.st, tracker = new PR.track.WaitTracker(sel, { loop: st.loop });
    var hasNotes = sel.some(function (t) { return t.kind === 'note'; });
    var run = { kind: 'wait', sel: sel, tracker: tracker, t0: A.now(), n: 0, clean: 0, hits: 0, skipped: 0, wrongs: 0, lastLoop: 0, flashUntil: 0 };
    run.tick = function () {
      var f = A.frame(hasNotes, (run.n++ % 2) === 0); if (!f) return;
      var now = A.now();
      var ev = tracker.push(f, now);
      liveReadout(f, sel[tracker.i], run, now);
      if (ev && ev.type === 'hit') {
        run.hits++; if (ev.clean) run.clean++;
        mark(sel[ev.index].orig, ev.clean ? 'is-hit' : 'is-late');
        award(run, ev.index, ev.clean ? 'hit' : 'late', run.clean / (run.hits + run.skipped), run.hits + run.skipped);
        afterStep(run);
      } else if (ev && ev.type === 'wrong') {
        run.wrongs++; run.flashUntil = now + 1.2;
        var hh = $('#hudHeard'); if (hh) { hh.textContent = ev.heard + ', not ' + sel[ev.index].label; hh.style.color = '#ff8a82'; }
      }
      setText('#hudTime', App.fmtDur(now - run.t0));
    };
    run.skip = function () {
      var i = tracker.i; tracker.skip(A.now()); run.skipped++; mark(sel[i].orig, 'is-miss');
      award(run, i, 'miss', run.clean / (run.hits + run.skipped), run.hits + run.skipped);
      afterStep(run);
    };
    function afterStep(r) {
      var done = r.hits + r.skipped;
      setText('#hudHits', String(r.clean));
      setText('#hudAcc', done ? App.pct(r.clean / done) + '%' : '–');
      if (tracker.done) { P.finish(); return; }
      if (tracker.loops !== r.lastLoop) { r.lastLoop = tracker.loops; clearMarks(); Stage.reset(); }
      var pr = $('#hudProg'); if (pr) pr.style.width = Math.round(tracker.i / sel.length * 100) + '%';
      Stage.cursor(tracker.i);
      setNow(sel, tracker.i);
    }
    beginRun(run, { mode: 'wait', listen: true, skip: true });
    setNow(sel, 0);
  }
  function liveReadout(f, target, run, now) {
    var lv = $('#hudLevel'); if (lv) lv.style.width = App.clamp(Math.round(Math.sqrt(f.rms) * 260), 0, 100) + '%';
    if (now < run.flashUntil) return;
    var hh = $('#hudHeard'); if (!hh) return;
    hh.style.color = '';
    var txt = null;
    if (f.rms < 0.004) txt = '–';
    else if (target && target.kind === 'note') { if (f.clarity >= 0.85 && f.midi === f.midi) txt = M.midiName(f.midi); }
    else if (f.chroma) { var nm = PR.dsp.nameChord(f.chroma); if (nm && nm.score >= 0.8) txt = nm.name; }
    if (txt !== null && hh.textContent !== txt) hh.textContent = txt;
  }
  function timeline(sel, t0) {
    var spb = 60 / bpmNow(), b0 = sel[0].beat;
    sel.forEach(function (t) { t.start = t0 + (t.beat - b0) * spb; t.end = t.start + t.beats * spb; });
    return { spb: spb, end: sel[sel.length - 1].end, beats: (sel[sel.length - 1].beat + sel[sel.length - 1].beats - b0) };
  }
  function startTempo(sel, listen) {
    var st = P.st, ctx = A.ctx, per = st.song.beatsPerBar || 4;
    var spb = 60 / bpmNow();
    var lead = S.settings.countIn ? per * spb : 0.4;
    var t0 = ctx.currentTime + 0.25 + lead;
    var tl = timeline(sel, t0);
    var run = { kind: listen ? 'tempo' : 'self', sel: sel, t0: t0, begun: ctx.currentTime, n: 0, hits: 0, on: 0, done: 0, cur: -1, loops: 0, results: [], tracker: null, metro: null, tl: tl };
    if (listen) run.tracker = new PR.track.TempoTracker(sel, { chromaDt: 0.08, frameDt: 0.04 });
    var hasNotes = sel.some(function (t) { return t.kind === 'note'; });
    var trim = (S.settings.trim || 0) / 1000 + (ctx.outputLatency || 0);
    var lag = listen ? trim : (ctx.outputLatency || 0);
    var stage = { mode: 'time', listen: listen, look: App.clamp(spb * 8, 3.2, 8), spb: spb, per: per, t0: t0, now: function () { return ctx.currentTime - lag; } };
    run.metro = new App.Metro({ bpm: bpmNow(), beatsPerBar: per, t0: t0 - (S.settings.countIn ? per * spb : 0), sound: S.settings.click, onBeat: function (n) {
      var inCount = S.settings.countIn && n < per;
      beatsDots(per, n % per);
      Stage.beat(n % per === 0);
      Stage.count(inCount ? per - n : 0);
      if (inCount) setText('#hudDetail', 'count in');
    } });
    run.metro.start();
    run.tick = function () {
      var now = ctx.currentTime, f = null;
      if (listen) {
        f = A.frame(hasNotes, (run.n++ % 2) === 0);
        if (f) {
          var res = run.tracker.push(f, now - trim);
          res.forEach(function (r) { applyResult(run, r); });
          liveReadout(f, sel[Math.max(0, run.cur)], run, now);
        }
      }
      var te = now - lag;
      if (te >= t0) {
        var i = run.cur < 0 ? 0 : run.cur;
        while (i < sel.length - 1 && te >= sel[i].end) i++;
        if (i !== run.cur && te < sel[sel.length - 1].end) {
          run.cur = i; setNow(sel, i);
          if (!listen && S.settings.guide !== false) { A.hush(); if (sel[i].midis.length > 1) A.strum(sel[i].stroke === 'U' ? sel[i].midis.slice().reverse() : sel[i].midis, 0, sel[i].stroke ? 12 : 28); else A.pluck(M.midiToFreq(sel[i].midis[0], S.settings.a4), 1.4); }
          if (!listen) { Stage.result(i, 'pass'); setText('#hudAcc', String(Math.floor((sel[i].beat - sel[0].beat) / per) + 1)); setText('#hudHits', String(i + 1 + run.loops * sel.length)); }
        }
        var pr = $('#hudProg'); if (pr) pr.style.width = App.clamp(Math.round((te - t0) / (run.tl.end - t0) * 100), 0, 100) + '%';
        setText('#hudTime', App.fmtDur(now - run.t0));
      }
      var over = listen ? (run.tracker.done || te > run.tl.end + 0.6) : te >= run.tl.end;
      if (over) {
        if (st.loop) {
          /* go straight round again, on the beat */
          run.loops++;
          var nt0 = run.tl.end;
          run.results = run.results.concat(listen ? run.tracker.results.map(function (r) { return Object.assign({ label: sel[r.index].label, kind: sel[r.index].kind }, r); }) : []);
          run.tl = timeline(sel, nt0); t0 = nt0; run.t0loop = nt0; stage.t0 = nt0;
          if (listen) run.tracker = new PR.track.TempoTracker(sel, { chromaDt: 0.08, frameDt: 0.04 });
          run.cur = -1; clearMarks(); Stage.reset();
        } else P.finish();
      }
    };
    function applyResult(r2, res) {
      r2.done++;
      if (res.hit) { r2.hits++; if (res.grade === 'on') r2.on++; }
      mark(sel[res.index].orig, res.hit ? (res.grade === 'on' ? 'is-hit' : 'is-late') : 'is-miss');
      award(r2, res.index, res.hit ? (res.grade === 'on' ? 'hit' : 'late') : 'miss', r2.hits / r2.done, r2.done);
      setText('#hudHits', String(r2.hits));
      setText('#hudAcc', App.pct(r2.hits / r2.done) + '%');
      if (!res.hit && res.wrong) { r2.flashUntil = A.now() + 1.0; var hh = $('#hudHeard'); if (hh) { hh.textContent = res.wrong + ', not ' + sel[res.index].label; hh.style.color = '#ff8a82'; } }
    }
    run.flashUntil = 0;
    beginRun(run, stage);
    setText('#hudNow', sel[0].label); setText('#hudNext', sel[1] ? sel[1].label : '–');
    if (!listen) setText('#hudHits', '0');
  }
  P.skip = function () { var r = P.st && P.st.run; if (r && r.skip) r.skip(); };
  P.stopAll = function (silent) {
    var st = P.st; if (!st) return;
    var run = st.run;
    if (run) { clearInterval(run.timer); if (run.metro) run.metro.stop(); st.run = null; }
    Stage.close();
    A.micStop(); A.hush(); App.wake.off();
    nowOrig = -1;
    if (!silent) refreshAction();
    return run;
  };
  /* stop, score, save, show the result */
  P.finish = function () {
    var st = P.st; if (!st || !st.run) return;
    var run = st.run, now = A.now();
    clearInterval(run.timer); if (run.metro) run.metro.stop(); st.run = null;
    Stage.close();
    A.micStop(); App.wake.off(); nowOrig = -1;
    $all('#pChart .is-now').forEach(function (el) { el.classList.remove('is-now'); }); $all('#pChart .cell.is-cur').forEach(function (c) { c.classList.remove('is-cur'); });
    refreshAction();
    var sel = run.sel, rep = { kind: run.kind, secs: Math.max(0, now - (run.kind === 'wait' ? run.t0 : Math.min(now, run.t0))), items: [], changes: [] };
    if (run.kind === 'wait') {
      var res = run.tracker.results, prev = null;
      res.forEach(function (r) {
        var t = sel[r.index];
        rep.items.push({ label: t.label, status: r.hit ? (r.clean ? 'hit' : 'late') : 'missed', heard: r.wrong || null });
        if (r.hit && prev && prev.hit && t.kind === 'chord' && sel[prev.index].kind === 'chord' && sel[prev.index].label !== t.label) rep.changes.push({ f: sel[prev.index].label, t: t.label, s: Math.round(Math.max(0, r.time - 0.3) * 100) / 100 });
        prev = r;
      });
      rep.total = res.length; rep.hits = res.filter(function (r) { return r.hit && r.clean; }).length;
      rep.second = res.filter(function (r) { return r.hit && !r.clean; }).length; rep.missed = res.filter(function (r) { return !r.hit; }).length;
      rep.acc = rep.total ? rep.hits / rep.total : null;
      var cents = res.filter(function (r) { return r.hit && typeof r.cents === 'number'; }).map(function (r) { return Math.abs(r.cents); });
      rep.cents = cents.length ? PR.dsp.median(cents) : null;
    } else if (run.kind === 'tempo') {
      var all = run.results.concat(run.tracker.results.map(function (r) { return Object.assign({ label: sel[r.index].label, kind: sel[r.index].kind }, r); }));
      var prevT = null;
      all.forEach(function (r) {
        rep.items.push({ label: r.label, status: r.hit ? (r.grade === 'on' ? 'hit' : 'late') : 'missed', heard: r.wrong || null });
        if (r.hit && r.kind === 'chord' && prevT && prevT.kind === 'chord' && prevT.label !== r.label) rep.changes.push({ f: prevT.label, t: r.label, s: Math.round(Math.max(0, r.offset) * 100) / 100 });
        prevT = r;
      });
      rep.total = all.length; rep.hits = all.filter(function (r) { return r.hit; }).length;
      rep.onTime = all.filter(function (r) { return r.hit && r.grade === 'on'; }).length;
      rep.second = rep.hits - rep.onTime; rep.missed = rep.total - rep.hits;
      rep.acc = rep.total ? rep.hits / rep.total : null;
      var offs = all.filter(function (r) { return r.hit; }).map(function (r) { return r.offset; });
      rep.offset = offs.length ? PR.dsp.median(offs) : null;
    } else {
      rep.total = 0; rep.acc = null; rep.self = true;
      if (!run.untimed) rep.secs = Math.max(0, now - run.t0);
    }
    rep.score = run.score || 0; rep.combo = run.maxCombo || 0;
    if (run.kind === 'wait' || run.kind === 'tempo') App.diag.add('run', run.kind + ' on ' + st.id + ': ' + rep.hits + ' of ' + rep.total + ' in ' + Math.round(rep.secs) + ' s' + (S.mic.pre === 'ok' ? ', microphone' : ''));
    st.report = rep;
    P.showReport(rep);
  };
  var STATUS_CLS = { hit: '', late: 'l', wrong: 'w', missed: 'm' };
  function itemsHtml(items) {
    if (!items.length) return '';
    var shown = items.slice(0, 96);
    return '<div class="runs" aria-label="Each ' + 'target in order">' + shown.map(function (it) { return '<i class="' + (STATUS_CLS[it.status] || '') + '" title="' + esc(it.status + (it.heard ? ', heard ' + it.heard : '')) + '">' + esc(it.label) + '</i>'; }).join('') + (items.length > 96 ? '<span class="small muted">+' + (items.length - 96) + ' more</span>' : '') + '</div>';
  }
  function slowest(changes) {
    var by = {};
    changes.forEach(function (c) { var k = c.f + ' → ' + c.t; (by[k] = by[k] || { f: c.f, t: c.t, v: [] }).v.push(c.s); });
    var list = Object.keys(by).map(function (k) { var b = by[k]; b.key = k; b.mean = b.v.reduce(function (a, x) { return a + x; }, 0) / b.v.length; return b; });
    list.sort(function (a, b) { return b.mean - a.mean; });
    return list[0] || null;
  }
  function saveSession(rep, extra) {
    var st = P.st;
    var worth = rep.secs >= 15 || (rep.total || 0) >= 4;
    if (!worth || !S.canWrite) return false;
    var doc = { song: st.id, title: st.song.title, kind: rep.kind, secs: Math.round(rep.secs), pct: st.pct, bpm: bpmNow(), section: sectionName(), level: st.song.level || 1 };
    if (typeof rep.acc === 'number') { doc.acc = Math.round(rep.acc * 1000) / 1000; doc.hits = rep.hits; doc.total = rep.total; }
    if (rep.changes && rep.changes.length) doc.changes = rep.changes.slice(0, 60);
    if (typeof rep.cents === 'number') doc.cents = Math.round(rep.cents);
    if (st.way && st.way !== 'chords') doc.way = st.way;
    Object.assign(doc, extra || {});
    App.Store.addSession(doc);
    return true;
  }
  /* what the game layer gained from a session that was just saved */
  /* which song's path a run on this page can move: the song itself, or the song an exercise was opened from */
  function pathId() { var st = P.st; return st.from || (st.song.drill || st.song.exercise ? '' : st.id); }
  function gains(before, after, songId, score, snap) {
    var b = before.songs[songId] || { stars: 0, score: 0 }, a = after.songs[songId] || { stars: 0, score: 0 };
    return { path: snap ? App.path.diff(snap) : null, xp: after.xp - before.xp, levelUp: after.level > before.level, game: after,
      newBest: !!score && score > (b.score || 0) && (b.score || 0) > 0, firstScore: !!score && !(b.score > 0),
      newStars: a.stars > b.stars, badges: after.badges.filter(function (x, i) { return x.got && !before.badges[i].got; }),
      quests: after.today.quests.filter(function (q, i) { return q.done && !before.today.quests[i].done; }) };
  }
  function gainsHtml(gn) {
    if (!gn) return '';
    var gm = gn.game;
    var html = '<div class="xp-card"><div class="spread"><b>+' + gn.xp + ' XP</b><span class="small">Level ' + gm.level + ' · ' + esc(gm.title) + '</span></div>' +
      '<div class="xpbar"><i style="width:' + Math.round(gm.into / gm.need * 100) + '%"></i></div>' +
      '<span class="small">' + (gn.levelUp ? 'Level up! ' : '') + (gm.need - gm.into) + ' XP to level ' + (gm.level + 1) + '</span></div>';
    gn.quests.forEach(function (q) { html += '<div class="unlock"><i>' + IC.check + '</i><div><b>Quest done</b><div class="small muted">' + esc(q.label) + ' · +' + q.xp + ' XP</div></div></div>'; });
    gn.badges.forEach(function (b) { html += '<div class="unlock"><i>' + (IC[b.icon] || IC.star) + '</i><div><b>Badge: ' + esc(b.name) + '</b><div class="small muted">' + esc(b.desc) + '</div></div></div>'; });
    return pathGainHtml(gn.path) + html;
  }
  function pathGainHtml(pd) {
    if (!pd || !(pd.steps.length || pd.mastered)) return '';
    var p = pd.path, html = '';
    if (pd.mastered) html += '<div class="unlock unlock-big"><i>' + IC.trophy + '</i><div><b>Song finished: ' + esc(pd.song.title) + '</b><div class="small muted">Every step of the path is done. You can play this song.</div></div></div>';
    pd.steps.forEach(function (s) { if (!(pd.mastered && s.final)) html += '<div class="unlock"><i>' + IC.check + '</i><div><b>Step done: ' + esc(s.title) + '</b><div class="small muted">' + esc(s.skill ? 'Counts for every song that needs it' : s.sub) + '</div></div></div>'; });
    html += '<div class="panel stack-sm"><div class="spread"><b>' + esc(pd.song.title) + '</b><span class="small num muted">' + p.done + ' of ' + p.total + ' steps</span></div><div class="meter' + (p.mastered ? ' is-good' : '') + '"><i style="width:' + p.pct + '%"></i></div></div>';
    return html;
  }
  function nextBtn(pd, primary) {
    if (!pd || !pd.path.next) return '';
    return '<button class="btn ' + (primary ? 'btn-primary ' : '') + 'btn-block" data-act="path-next" data-id="' + esc(pd.song.id) + '">Next step: ' + esc(pd.path.next.title) + '</button>';
  }
  P.showReport = function (rep) {
    var st = P.st, html = '<div class="sheet-head"><div><div class="eyebrow">' + esc(st.song.title) + ' · ' + esc(sectionName()) + '</div><h2 class="title">' + (rep.self ? 'How did that go?' : 'Result') + '</h2></div><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + IC.x + '</button></div>';
    if (rep.self) {
      html += '<p class="muted">' + App.fmtDur(rep.secs) + ' at ' + bpmNow() + ' BPM. Nothing was listening, so you are the judge.</p>' +
        '<div class="stack"><button class="btn btn-block" data-act="p-rate" data-v="0.95">' + IC.check + 'Clean: every change on time</button><button class="btn btn-block" data-act="p-rate" data-v="0.75">A few slips</button><button class="btn btn-block" data-act="p-rate" data-v="0.5">Rough: lost my place</button><button class="btn btn-ghost btn-block" data-act="sheet-close">Do not log this one</button></div>';
      App.sheet.open(html);
      return;
    }
    if (!rep.total) { App.toast('Stopped before anything was scored.'); return; }
    var stars = App.starsFor(rep.acc, st.pct, false);
    var before = App.computeGame(), snap = pathId() ? App.path.snap(pathId()) : null;
    var saved = saveSession(rep, { score: rep.score || 0, combo: rep.combo || 0, stars: stars });
    var gn = saved ? gains(before, App.computeGame(), st.id, rep.score, snap) : null;
    var moved = gn && gn.path && (gn.path.steps.length || gn.path.mastered) ? gn.path : null;
    var acc = App.pct(rep.acc);
    var verdict = acc >= 90 ? 'Solid. ' + (st.pct < 100 ? 'Raise the tempo next.' : 'Play it again tomorrow to lock it in.') : acc >= 70 ? 'Close. Loop the part that tripped you and go again.' : 'Slow it down and take one part at a time.';
    html += App.starsHtml(stars, 'stars-lg') +
      '<div class="result-score"><b>' + fmtScore(rep.score || 0) + '</b><span>Score' + (gn && gn.newBest ? ' · new best' : '') + (rep.combo ? ' · best run ' + rep.combo : '') + '</span></div>' +
      '<div class="panel stack"><div class="row" style="align-items:baseline"><span class="result-big">' + acc + '<small>%</small></span><span class="muted">' + rep.hits + ' of ' + rep.total + (rep.kind === 'wait' ? ' right first time' : (rep.kind === 'take' ? ' right' : ' right in their slot')) + '</span></div>' +
      '<div class="meter' + (acc >= 90 ? ' is-good' : '') + '"><i style="width:' + acc + '%"></i></div><p>' + verdict + '</p></div>';
    html += gainsHtml(gn);
    html += '<div class="tally">' +
      (rep.kind === 'take'
        ? '<div><span>Wrong</span><b>' + rep.wrong + '</b></div><div><span>Missed</span><b>' + rep.missed + '</b></div><div><span>Extra</span><b>' + rep.extras + '</b></div>'
        : '<div><span>' + (rep.kind === 'wait' ? 'Second try' : 'Late or early') + '</span><b>' + rep.second + '</b></div><div><span>' + (rep.kind === 'wait' ? 'Skipped' : 'Missed') + '</span><b>' + rep.missed + '</b></div><div><span>Time</span><b>' + App.fmtDur(rep.secs) + '</b></div>') +
      '</div>';
    var lines = [];
    if (rep.kind === 'take') {
      if (rep.coverage && rep.coverage.played < rep.coverage.of && rep.coverage.loops === 1) lines.push('You played ' + rep.coverage.played + ' of ' + rep.coverage.of + ' steps of this part' + (rep.coverage.first ? ', starting at step ' + (rep.coverage.first + 1) : '') + '.');
      if (rep.coverage && rep.coverage.loops > 1) lines.push(rep.coverage.loops + ' times round the part.');
      if (rep.bpm) lines.push('Your tempo was about ' + Math.round(rep.bpm) + ' BPM' + (st.song.bpm ? ' (the song is ' + st.song.bpm + ')' : '') + (rep.steadiness !== null ? ', ' + (rep.steadiness >= 0.85 ? 'and steady' : rep.steadiness >= 0.6 ? 'a little uneven' : 'and uneven') : '') + '.');
      if (rep.extraLabels && rep.extraLabels.length) lines.push('Extra: ' + rep.extraLabels.join(', ') + '.');
      if (rep.read && rep.read.clipped) lines.push('Only the first ' + (App.MAX_TAKE >= 120 ? Math.round(App.MAX_TAKE / 60) + ' minutes' : App.MAX_TAKE + ' seconds') + ' of the recording were scored.');
    }
    if (rep.kind === 'tempo' && rep.offset !== null) lines.push('On average you landed ' + Math.abs(Math.round(rep.offset * 1000)) + ' ms ' + (rep.offset >= 0 ? 'after' : 'before') + ' the beat' + (Math.abs(rep.offset) <= 0.08 ? ', which is on it' : '') + '.');
    if (typeof rep.cents === 'number' && rep.cents > 12) lines.push('Notes were about ' + Math.round(rep.cents) + ' cents off on average. Check your tuning.');
    var slow = rep.changes.length >= 2 ? slowest(rep.changes) : null;
    if (slow && slow.mean >= 0.6) lines.push('Slowest change: ' + slow.key + ', ' + (Math.round(slow.mean * 10) / 10) + ' s.');
    var wrongs = rep.items.filter(function (it) { return it.heard; }).slice(0, 4).map(function (it) { return it.heard + ' for ' + it.label; });
    if (wrongs.length) lines.push('Heard ' + wrongs.join(', ') + '.');
    if (lines.length) html += '<div class="panel-flat stack-sm">' + lines.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('') + '</div>';
    html += itemsHtml(rep.items);
    if (!saved) html += '<p class="small muted">' + (S.canWrite ? 'Too short to log.' : 'Not saved: this view cannot write.') + '</p>';
    if (rep.read) html += '<p class="small muted">' + (rep.read.how === 'track' ? 'Read from the recording\'s sound track' : rep.read.how === 'decode' ? 'Decoded by the browser' : 'Played through to read it') + ' in ' + (rep.read.ms / 1000).toFixed(1) + ' s.</p>';
    html += '<div class="stack">' + nextBtn(moved, true) + '<button class="btn ' + (moved && moved.path.next ? '' : 'btn-primary ') + 'btn-block" data-act="p-again">' + (rep.kind === 'take' ? 'Done' : 'Play again') + '</button><div class="row">' +
      (slow && slow.mean >= 0.6 ? '<button class="btn grow" data-act="omc" data-a="' + esc(slow.f) + '" data-b="' + esc(slow.t) + '" data-id="' + esc(st.id) + '">Drill ' + esc(slow.key) + '</button>' : (acc < 90 && st.pct > 60 && rep.kind !== 'take' ? '<button class="btn grow" data-act="p-slower">Slower</button>' : '')) +
      (rep.kind === 'take' ? '' : '<button class="btn grow" data-act="sheet-close">Done</button>') + '</div></div>';
    App.sheet.open(html, function () { App.render(); });
    if (stars === 3 || (gn && (gn.levelUp || gn.badges.length)) || (moved && moved.mastered)) App.confetti();
    A.chime(moved && moved.mastered ? 3 : stars);
  };
  P.rate = function (v) {
    var st = P.st, rep = st.report; if (!rep) return;
    rep.acc = v; rep.kind = 'self'; rep.hits = 0; rep.total = 0;
    var before = App.computeGame(), snap = pathId() ? App.path.snap(pathId()) : null;
    var ok = saveSession({ kind: 'self', secs: rep.secs, acc: v, total: 0, hits: 0, changes: [] }, { self: true });
    App.sheet.close();
    var gn = ok ? gains(before, App.computeGame(), st.id, 0, snap) : null;
    var moved = gn && gn.path && (gn.path.steps.length || gn.path.mastered) ? gn.path : null;
    if (moved) {
      /* a step was ticked: say so properly instead of in a passing line */
      App.sheet.open('<div class="sheet-head"><div><div class="eyebrow">' + esc(st.song.title) + '</div><h2 class="title">' + (moved.mastered ? 'Song finished' : 'Step done') + '</h2></div><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + IC.x + '</button></div>' +
        gainsHtml(gn) + '<div class="stack">' + nextBtn(moved, true) + '<button class="btn ' + (moved.path.next ? '' : 'btn-primary ') + 'btn-block" data-act="sheet-close">Done</button></div>', function () { App.render(); });
      if (moved.mastered) { App.confetti(); A.chime(3); } else A.chime(2);
    } else App.toast(ok ? 'Logged. +' + gn.xp + ' XP' + (gn.levelUp ? '. Level up!' : '') + (st.song.exercise && v < App.path.PASS ? ' Rate it clean to tick the step.' : '') : 'Too short to log.');
    if (gn && (gn.levelUp || gn.badges.length)) App.confetti();
    App.render();
  };

  /* ---------- scoring a recorded take ---------- */
  P.takeFile = function (file) {
    var st = P.st; if (!st || !file) return;
    var sel = selection();
    st.busy = 'Reading the recording…'; refreshAction();
    function prog(p, what) {
      st.busy = (what === 'listening' ? 'Listening to the recording, ' : what === 'loading' ? 'Reading the recording, ' : 'Finding the notes, ') + Math.round(p * 100) + '%';
      setText('#takeBusy', st.busy); var b = $('#takeProg'); if (b) b.style.width = Math.round(p * 100) + '%';
    }
    var read = null, note = App.fileNote(file);
    App.readTake(file, prog, function (resume) {
      var box = $('#tapBox'); if (box) { box.innerHTML = '<button class="btn btn-primary btn-block" id="tapGo">Tap to listen to the recording</button>'; $('#tapGo').onclick = function () { box.innerHTML = ''; resume(); }; }
    }).then(function (take) {
      read = { how: take.how, ms: take.ms, clipped: take.clipped, secs: take.pcm.length / take.sr };
      App.diag.add('take', note + ' -> ' + take.how + (take.wrap ? ' (' + take.wrap + ')' : '') + ', ' + Math.round(read.secs) + ' s of sound in ' + (take.ms / 1000).toFixed(1) + ' s' + (take.clipped ? ', cut at ' + App.MAX_TAKE + ' s' : '') + (take.trail.length ? ' (after ' + take.trail.join('; ') + ')' : ''));
      return App.framesOf({ pcm: take.pcm, sr: take.sr }, { chromaEvery: 2 }, prog);
    }).then(function (frames) {
      st.busy = ''; refreshAction();
      var rep = PR.take.scoreTake(frames, sel, { loop: st.loop, a4: S.settings.a4 });
      if (!rep.ok) {
        App.diag.add('score', 'take of ' + st.id + ': ' + rep.reason + (rep.heard && rep.heard.length ? ', heard ' + rep.heard.slice(0, 5).join(' ') : ''));
        App.toast(rep.reason === 'silent' ? 'That recording is almost silent. Move the phone closer and try again.' : 'None of this part was found in the recording' + (rep.heard && rep.heard.length ? '. Heard: ' + rep.heard.slice(0, 5).join(', ') : '') + '.');
        return;
      }
      clearMarks();
      var out = { kind: 'take', secs: rep.duration, total: rep.hits + rep.wrong + rep.missed + rep.extras, hits: rep.hits, wrong: rep.wrong, missed: rep.missed, extras: rep.extras, acc: rep.accuracy, items: [], changes: [],
        coverage: rep.coverage, bpm: rep.bpm, steadiness: rep.steadiness, cents: rep.cents, extraLabels: rep.extraLabels, read: read };
      App.diag.add('score', 'take of ' + st.id + ': ' + rep.hits + ' of ' + out.total + ', ' + Math.round(rep.duration) + ' s played');
      rep.items.forEach(function (it) {
        out.items.push({ label: it.label, status: it.status, heard: it.heard || null });
        if (it.loop === rep.coverage.loops - 1 || rep.coverage.loops === 1) it.members.forEach(function (mi) { mark(sel[mi].orig, it.status === 'hit' ? 'is-hit' : 'is-miss'); });
      });
      rep.changes.forEach(function (c) { if (c.from !== c.to) out.changes.push({ f: c.from, t: c.to, s: Math.round(c.gap * 100) / 100 }); });
      var pts = App.scoreItems(out.items); out.score = pts.score; out.combo = pts.combo;
      st.report = out;
      P.showReport(out);
    }).catch(function (e) {
      st.busy = ''; refreshAction();
      var msg = e && e.message;
      App.diag.add('take', note + ' -> could not be read: ' + (e && e.trail ? e.trail.join('; ') : (msg || 'error')));
      App.toast(msg === 'empty' ? 'That file had no sound in it.' : msg === 'no-audio' ? 'Sound is not available in this view.' : 'That file could not be read here. Try a sound recording (a voice memo) instead of a video.');
    });
  };

  /* ---------- one-minute changes ---------- */
  var O = App.omc = { st: null };
  O.pick = function () {
    var st = P.st; if (!st) return;
    var names = st.base.chords.map(function (c) { return c.name; });
    App.sheet.open('<div class="sheet-head"><h2 class="title">One-minute changes</h2><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + IC.x + '</button></div>' +
      '<p class="muted">Pick two chords. Swap between them for a minute and count the clean changes. It is the fastest way to speed up a change.</p>' +
      '<div class="fields"><label class="field"><span>From</span><select class="select" id="omcA">' + names.map(function (n, i) { return '<option' + (i === 0 ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>To</span><select class="select" id="omcB">' + names.map(function (n, i) { return '<option' + (i === 1 ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label></div>' +
      '<button class="btn btn-primary btn-block" data-act="omc-go" data-id="' + esc(st.id) + '">Set up the drill</button>');
  };
  O.open = function (a, b, songId) {
    var song = songId ? App.findSong(songId) : null;
    var mini = { id: 'omc', title: a + ' and ' + b, capo: song ? song.capo || 0 : 0, tuning: song ? song.tuning || 'standard' : 'standard', shapes: song ? App.songShapes(song) : {}, sections: [{ name: 'Swap', type: 'chords', bars: [a, b] }] };
    var model = M.buildSong(mini);
    if (model.targets.length !== 2) { App.toast('Those two chords could not be set up.'); return; }
    P.stopAll(true);
    O.st = { a: a, b: b, song: songId || '', songTitle: song ? song.title : '', model: model, count: 0, left: 60, on: false, live: false, timer: null, cur: 0 };
    var stats = App.computeStats(), pk = stats.pairs[a + ' → ' + b], best = pk ? pk.best : 0;
    App.sheet.open(omcHtml(best), function () { O.stop(true); });
  };
  function omcHtml(best) {
    var o = O.st;
    return '<div class="sheet-head"><div><div class="eyebrow">One-minute changes</div><h2 class="title">' + esc(o.a) + ' and ' + esc(o.b) + '</h2></div><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + IC.x + '</button></div>' +
      '<div class="pair"><b id="omcA1" class="is-now">' + esc(o.a) + '</b>' + IC.swap + '<b id="omcB1">' + esc(o.b) + '</b></div>' +
      '<div class="count-ring" id="omcCount">0</div>' +
      '<div class="spread"><span class="muted" id="omcLeft">60 seconds</span><span class="muted">' + (best ? 'Your best: ' + best : 'No best yet') + '</span></div>' +
      '<div class="progress"><i id="omcProg"></i></div>' +
      '<div id="omcAct" class="stack">' + omcActHtml() + '</div>' +
      (App.videos('change')[0] ? '<a class="link small" href="https://www.youtube.com/watch?v=' + App.videos('change')[0].id + '" target="_blank" rel="noopener noreferrer">Watch: ' + esc(App.videos('change')[0].title) + '</a>' : '') +
      '<p class="small muted" id="omcHint">' + ((S.mic.pre === 'blocked' || S.mic.state === 'blocked') ? 'Strum each chord once, then change. Tap the big button after every clean change.' : 'Strum each chord once, then change. The page counts the changes it hears.') + '</p>';
  }
  function omcActHtml() {
    var o = O.st;
    if (!o.on) return '<button class="btn btn-primary btn-block" data-act="omc-start">' + IC.play + 'Start the minute</button>';
    return (o.live ? '' : '<button class="btn btn-primary btn-block" data-act="omc-tap" style="min-height:76px;font-size:20px">Tap for each change</button>') + '<button class="btn btn-block" data-act="omc-stop">' + IC.stop + 'Stop</button>';
  }
  function omcPaint() {
    var o = O.st; if (!o) return;
    setText('#omcCount', String(o.count)); setText('#omcLeft', Math.max(0, Math.ceil(o.left)) + ' seconds');
    var p = $('#omcProg'); if (p) p.style.width = App.clamp(Math.round((60 - o.left) / 60 * 100), 0, 100) + '%';
    var a = $('#omcA1'), b = $('#omcB1'); if (a && b) { a.classList.toggle('is-now', o.cur === 0); b.classList.toggle('is-now', o.cur === 1); }
  }
  O.start = function () {
    var o = O.st; if (!o || o.on) return;
    function begin(live) {
      o.on = true; o.live = live; o.count = 0; o.cur = 0; o.t0 = A.now(); o.left = 60; o.n = 0;
      if (live) {
        var sel = o.model.targets.map(function (t) { return Object.assign({}, t); });
        PR.track.prepareTargets(sel, S.settings.a4);
        o.tracker = new PR.track.WaitTracker(sel, { loop: true });
        o.first = true;
      }
      var act = $('#omcAct'); if (act) act.innerHTML = omcActHtml();
      var hint = $('#omcHint'); if (hint && !live) hint.textContent = 'Strum each chord once, then change. Tap the big button after every clean change.';
      App.wake.on();
      o.timer = setInterval(function () {
        var now = A.now();
        o.left = 60 - (now - o.t0);
        if (live) {
          var f = A.frame(false, true);
          if (f) { var ev = o.tracker.push(f, now); if (ev && ev.type === 'hit') { if (o.first) o.first = false; else o.count++; o.cur = o.tracker.i; } }
        }
        omcPaint();
        if (o.left <= 0) O.finish();
      }, live ? 45 : 200);
      omcPaint();
    }
    A.ensure();
    if (S.mic.pre === 'blocked' || S.mic.state === 'blocked') { begin(false); return; }
    A.askMic().then(function (ok) { begin(ok); });
  };
  O.tap = function () { var o = O.st; if (!o || !o.on) return; o.count++; o.cur = 1 - o.cur; omcPaint(); };
  O.stop = function (silent) {
    var o = O.st; if (!o) return;
    clearInterval(o.timer); o.timer = null;
    var was = o.on; o.on = false;
    A.micStop(); App.wake.off();
    if (!silent) { var act = $('#omcAct'); if (act) act.innerHTML = omcActHtml(); }
    return was;
  };
  O.finish = function () {
    var o = O.st; if (!o) return;
    var secs = Math.round(Math.min(60, A.now() - o.t0));
    O.stop(false);
    if (secs >= 30 && S.canWrite) {
      var snap = o.song ? App.path.snap(o.song) : null, rate = Math.round(o.count * 60 / secs);
      App.Store.addSession({ song: o.song, title: o.a + ' → ' + o.b + (o.songTitle ? ' (' + o.songTitle + ')' : ''), kind: 'omc', secs: secs, pair: [o.a, o.b], count: rate, counted: o.live ? 'heard' : 'tapped' });
      setText('#omcLeft', 'Logged: ' + rate + ' changes a minute');
      var pd = snap ? App.path.diff(snap) : null, act = $('#omcAct');
      if (pd && pd.steps.length && act) { act.innerHTML = pathGainHtml(pd) + nextBtn(pd, true) + act.innerHTML.replace('btn-primary ', ''); A.chime(2); }
      else if (snap && rate < App.path.OMC_PASS) { var hint = $('#omcHint'); if (hint) hint.textContent = App.path.OMC_PASS + ' clean changes in the minute ticks this step. ' + (App.path.OMC_PASS - rate) + ' to go.'; }
    } else setText('#omcLeft', 'Stopped early, not logged');
  };
  App.shapeSvg = shapeSvg;
  P.refreshControls = refreshControls; P.refreshAction = refreshAction; P.selection = selection; P.bpmNow = bpmNow;
})(typeof window !== 'undefined' ? window : globalThis);

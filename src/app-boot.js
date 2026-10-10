/* app-boot.js: routing, rendering, and every tap and keystroke. */
(function (root) {
  'use strict';
  var PR = root.PR, M = PR.music, App = PR.app, S = App.S, $ = App.$, $all = App.$all, A = App.audio, P = App.practice, T = App.tuner, O = App.omc;

  App.go = function (route) {
    var from = S.route.name;
    if (from === 'tuner' && route.name !== 'tuner') T.stop();
    if (from === 'practice' && (route.name !== 'practice' || (P.st && route.id !== P.st.id))) P.stopAll(true);
    if (route.name === 'practice') { if (!P.st || P.st.id !== route.id) P.open(route.id); if (!P.st) route = { name: 'songs' }; }
    S.route = route;
    try { if (route.name !== 'practice') root.history.replaceState(null, '', '#' + route.name); } catch (e) { /* hash is a nicety */ }
    App.render(true);
    try { root.scrollTo(0, 0); } catch (e2) { /* ignore */ }
  };

  App.render = function (force) {
    var r = S.route.name, main = $('#main');
    if (!main) return;
    if (!force) {
      if (r === 'practice' && P.st && (P.st.run || P.st.busy)) return;
      if (r === 'tuner' && (T.on || T.busy)) return;
    }
    var active = document.activeElement, keep = active && active.id === 'q' ? [active.selectionStart, active.selectionEnd] : null;
    var html = r === 'songs' ? App.views.songs() : r === 'tuner' ? App.views.tuner() : r === 'practice' ? P.view() : App.views.today();
    main.innerHTML = html;
    if (r === 'today') App.views.wireChart();
    if (r === 'practice') P.applyMarks();
    $('#app').classList.toggle('is-practice', r === 'practice');
    $('#tabs').hidden = r === 'practice';
    $all('#tabs .tab').forEach(function (b) { if (b.getAttribute('data-to') === r) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    var sync = $('#sync');
    if (sync) {
      sync.className = 'sync' + (S.store === 'cloud' ? ' is-cloud' : '');
      sync.innerHTML = '<i></i>' + (S.store === 'cloud' ? 'Synced' : S.store === 'local' ? 'This device only' : 'Loading');
      sync.title = S.store === 'cloud' ? 'Songs and sessions are saved to your Claude account' : 'Songs and sessions are saved in this browser only';
    }
    if (keep) { var q = $('#q'); if (q) { q.focus(); try { q.setSelectionRange(keep[0], keep[1]); } catch (e) { /* ignore */ } } }
  };

  var actions = {
    go: function (el) { App.go({ name: el.getAttribute('data-to') }); },
    open: function (el) { App.go({ name: 'practice', id: el.getAttribute('data-id') }); },
    level: function (el) { S.filter.level = parseInt(el.getAttribute('data-level'), 10) || 0; if (S.route.name !== 'songs') App.go({ name: 'songs' }); else App.render(true); },
    settings: function () { App.settingsSheet(); },
    'sheet-close': function () { App.sheet.close(); },

    add: function () { App.addSong.open(); },
    'draft-mode': function (el) { var d = App.addSong.draft(); syncDraft(); d.mode = el.getAttribute('data-mode'); d.err = ''; App.addSong.refresh(); },
    'draft-read': function () { App.addSong.read(); },
    'draft-ask': function () { App.addSong.ask(); },
    'draft-save': function () { App.addSong.save(); App.addSong.reset(); },

    edit: function (el) { App.editSong.open(el.getAttribute('data-id')); },
    'edit-save': function (el) { App.editSong.save(el.getAttribute('data-id')); if (P.st) { P.open(P.st.id); App.render(true); } },
    'del-ask': function (el) {
      var id = el.getAttribute('data-id');
      $('#delRow').innerHTML = '<span class="grow">Delete this song and keep its logged sessions?</span><button class="btn btn-sm btn-stop" data-act="del-yes" data-id="' + App.esc(id) + '">Delete</button><button class="btn btn-sm" data-act="del-no" data-id="' + App.esc(id) + '">Keep it</button>';
    },
    'del-no': function (el) { App.editSong.open(el.getAttribute('data-id')); },
    'del-yes': function (el) { App.Store.deleteSong(el.getAttribute('data-id')); App.sheet.close(); App.toast('Deleted.'); P.stopAll(true); P.st = null; App.go({ name: 'songs' }); },

    /* a real request for the microphone, from a tap */
    'mic-ask': function () {
      var txt = $('#micText'); if (txt) txt.textContent = 'Asking…';
      A.askMic().then(function (ok) {
        var m = S.mic;
        App.toast(ok ? 'The microphone is on. Live listening works in this view.' : App.micSaid());
        if (ok && !(P.st && P.st.run) && !T.on) A.micStop();
        if (ok) { if (P.st && !P.st.run && P.st.mode === 'take' && !P.st.busy) P.st.mode = 'live'; if (!T.on && T.mode === 'clip' && !T.busy) T.mode = 'live'; }
        if (App.sheet.isOpen() && $('#micText')) App.settingsSheet();
        App.render();
      });
    },
    'mic-off': function () { A.micStop(); App.settingsSheet(); },
    /* a plain link: the tap is only noted, so a later look at the log shows it was tried */
    'own-open': function () { App.diag.add('own', 'tapped "Open the page on its own"'); },
    'set-step': function (el) {
      var k = el.getAttribute('data-key'), d = parseInt(el.getAttribute('data-d'), 10);
      if (k === 'a4') { S.settings.a4 = App.clamp(S.settings.a4 + d, 425, 455); $('#oA4').textContent = S.settings.a4 + ' Hz'; if (A.an) A.an.setA4(S.settings.a4); }
      if (k === 'trim') { S.settings.trim = App.clamp((S.settings.trim || 0) + d, -200, 200); $('#oTrim').textContent = (S.settings.trim > 0 ? '+' : '') + S.settings.trim + ' ms'; }
      App.Store.saveSettings();
    },

    string: function (el) {
      var i = parseInt(el.getAttribute('data-i'), 10);
      T.sel = (i === T.sel) ? -1 : i; T.hold = 0; T.hist = [];
      if (i >= 0 && T.sel === i && S.settings.tones && !T.on) { A.hush(); A.pluck(M.midiToFreq(M.tuningMidi(S.settings.tuning)[i], S.settings.a4), 3.2); }
      App.render(true);
    },
    'tuner-mode': function (el) { var m = el.getAttribute('data-mode'); if (m !== 'live' && T.on) T.stop(); T.mode = m; App.render(true); },
    'tuner-start': function () { T.start(); },
    'tuner-stop': function () { T.stop(); App.render(true); },

    'p-mode': function (el) { if (!P.st || P.st.run) return; P.st.mode = el.getAttribute('data-mode'); App.render(true); },
    'p-live': function (el) { if (!P.st || P.st.run || el.disabled) return; P.st.live = el.getAttribute('data-live'); P.refreshControls(); },
    'p-tempo': function (el) { if (!P.st || P.st.run) return; P.st.pct = App.clamp(P.st.pct + parseInt(el.getAttribute('data-d'), 10), 40, 130); P.refreshControls(); },
    'p-start': function () { P.start(); },
    'p-stop': function () { P.finish(); },
    'p-skip': function () { P.skip(); },
    'p-hear': function (el) { var c = P.st && P.st.model.chords[parseInt(el.getAttribute('data-i'), 10)]; if (c && !(P.st.run && P.st.run.kind !== 'self')) { A.hush(); A.strum(c.midis); } },
    'p-again': function () { App.sheet.close(); if (P.st && P.st.mode !== 'take') P.start(); },
    'p-slower': function () { App.sheet.close(); if (P.st) { P.st.pct = App.clamp(P.st.pct - 10, 40, 130); App.render(true); if (P.st.mode !== 'take') P.start(); } },
    'p-rate': function (el) { P.rate(parseFloat(el.getAttribute('data-v'))); },

    omc: function (el) { O.open(el.getAttribute('data-a'), el.getAttribute('data-b'), el.getAttribute('data-id') || (P.st ? P.st.id : '')); },
    'omc-pick': function () { O.pick(); },
    'omc-go': function (el) { var a = $('#omcA').value, b = $('#omcB').value; if (a === b) { App.toast('Pick two different chords.'); return; } O.open(a, b, el.getAttribute('data-id')); },
    'omc-start': function () { O.start(); },
    'omc-tap': function () { O.tap(); },
    'omc-stop': function () { O.finish(); }
  };
  function syncDraft() {
    var d = App.addSong.draft(); if (!d) return;
    if ($('#dTitle')) d.title = $('#dTitle').value; if ($('#dArtist')) d.artist = $('#dArtist').value; if ($('#dText')) d.text = $('#dText').value;
  }
  var inputs = {
    q: function (el) { S.filter.q = el.value; App.render(true); },
    dtitle: function (el) { var d = App.addSong.draft(); d.title = el.value; var fb = $('#findBox'); if (fb) fb.innerHTML = App.addSong.findBoxHtml((d.title + ' ' + d.artist).trim()); },
    dartist: function (el) { var d = App.addSong.draft(); d.artist = el.value; var fb = $('#findBox'); if (fb) fb.innerHTML = App.addSong.findBoxHtml((d.title + ' ' + d.artist).trim()); },
    dtext: function (el) { App.addSong.draft().text = el.value; },
    tuning: function (el) { S.settings.tuning = el.value; T.sel = -1; T.tuned = {}; App.Store.saveSettings(); App.render(true); },
    'p-section': function (el) { if (!P.st || P.st.run) return; P.st.section = parseInt(el.value, 10); P.st.marks = {}; App.render(true); },
    'p-loop': function (el) { if (P.st) P.st.loop = !!el.checked; },
    'set-click': function (el) { S.settings.click = !!el.checked; App.Store.saveSettings(); },
    'set-countin': function (el) { S.settings.countIn = !!el.checked; App.Store.saveSettings(); },
    'set-tones': function (el) { S.settings.tones = !!el.checked; App.Store.saveSettings(); }
  };

  App.boot = function () {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.id === 'sheet') { App.sheet.close(); return; }
      var el = t && t.closest ? t.closest('[data-act]') : null;
      if (!el || el.disabled) return;
      var fn = actions[el.getAttribute('data-act')];
      if (fn) { A.ensure(); fn(el, ev); }
    });
    function onInput(ev) {
      var el = ev.target;
      if (!el || !el.getAttribute) return;
      var file = el.getAttribute('data-file');
      if (file && ev.type === 'change') {
        var f = el.files && el.files[0];
        try { el.value = ''; } catch (e) { /* ignore */ }
        if (!f) return;
        A.ensure();
        if (file === 'take') P.takeFile(f); else T.clipFile(f);
        return;
      }
      var key = el.getAttribute('data-in');
      if (!key || !inputs[key]) return;
      var isText = el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search' || !el.type) || el.tagName === 'TEXTAREA';
      if (isText ? ev.type === 'input' : ev.type === 'change') inputs[key](el);
    }
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && App.sheet.isOpen()) App.sheet.close(); });
    document.addEventListener('focusin', function (ev) { var el = ev.target; if (el && el.hasAttribute && el.hasAttribute('data-select')) { try { el.select(); } catch (e) { /* ignore */ } } });
    /* anything that goes wrong on a device nobody can look at ends up in the technical log */
    var errs = 0;
    root.addEventListener('error', function (ev) { if (errs++ < 5) App.diag.add('error', (ev && ev.message ? ev.message : 'error') + (ev && ev.lineno ? ' @' + ev.lineno + ':' + ev.colno : '')); });
    root.addEventListener('unhandledrejection', function (ev) { var r = ev && ev.reason; if (errs++ < 5) App.diag.add('error', 'promise: ' + (r && (r.message || r.code || r.name) ? (r.name ? r.name + ' ' : '') + (r.message || r.code || '') : String(r))); });
    root.addEventListener('hashchange', function () {
      var h = (root.location.hash || '').replace('#', '');
      if ((h === 'today' || h === 'songs' || h === 'tuner') && h !== S.route.name) App.go({ name: h });
    });
    var rz = null;
    root.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (S.route.name === 'today' && !App.sheet.isOpen()) App.render(); }, 180); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && T.on) { T.stop(); App.render(true); }
    });
    A.probe();
    var h = (root.location.hash || '').replace('#', '');
    if (h === 'songs' || h === 'tuner') S.route = { name: h };
    App.addSong.reset();
    var opened = function () {
      var m = S.mic;
      var where = '';
      try { where = root.location.protocol + '//' + root.location.host + (root.location.search ? ' ?' + root.location.search.length : '') + ', origin ' + (root.origin === 'null' ? 'opaque' : 'own'); } catch (e) { where = 'address unknown'; }
      App.diag.add('open', (m.framed ? 'framed' : 'own page') + ' at ' + where + ', data ' + S.store + ', microphone ' + (m.pre === 'blocked' ? 'blocked (' + m.why + ')' : m.pre) + ', policy ' + (m.policy === null ? 'unknown' : m.policy) + ', browser permission ' + (m.perm || 'unknown') + ', ' + (root.isSecureContext === false ? 'not secure' : 'secure') + ', storage ' + App.diag.kept);
    };
    App.Store.init().then(opened, opened);
    App.render(true);
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.boot); else App.boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);

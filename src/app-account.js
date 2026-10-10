/* app-account.js: signing in with GitHub, and keeping the player's progress in their own GitHub account.

   This is for the copy of the page on an ordinary web address. (Inside Claude the page has a database of its
   own and none of this is offered.) There is no server behind the page, and GitHub's sign-in for websites
   needs one: the step that turns a sign-in into a key wants a secret and refuses calls from a browser. So the
   player makes a key themselves, once per device, with a link that fills the form in: a fine-grained personal
   access token whose only permission is reading and writing gists.

   The data is one secret gist on their account:
     practice-room.json       songs, when songs were deleted, settings
     sessions-YYYY-MM.json    the session log, one file per month (UTC), one session per line
   Saving is always: read what the account holds, join it with what this device holds, write back only the
   files that differ. Sessions are joined by id and never dropped; for a song the newer of edit and delete
   wins; settings go to whichever side changed them last. The game layer is worked out from the session log,
   so level, stars, streaks and badges follow without being stored. */
(function (root) {
  'use strict';
  var PR = root.PR, App = PR.app, S = App.S, Store = App.Store, Diag = App.diag, LS = App.LS, ls = App.ls;
  var API = 'https://api.github.com', MAIN = 'practice-room.json', SESS = /^sessions-\d{4}-\d{2}\.json$/;
  var DESC = 'Practice Room progress. Written by the app: songs, session log, settings.';

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  /* The same data gives the same text whichever device wrote it (keys in order at every depth), so a file
     only counts as changed when its data changed. */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    var t = JSON.stringify(v);
    return t === undefined ? 'null' : t;
  }
  function monthOf(at) { try { return new Date(num(at)).toISOString().slice(0, 7); } catch (e) { return '1970-01'; } }
  function cleanSettings(v) {
    var o = {};
    if (num(v.a4) >= 425 && v.a4 <= 455) o.a4 = v.a4;
    if (typeof v.tuning === 'string' || Array.isArray(v.tuning)) o.tuning = v.tuning;
    ['tones', 'countIn', 'click', 'guide'].forEach(function (k) { if (typeof v[k] === 'boolean') o[k] = v[k]; });
    if (typeof v.trim === 'number' && Math.abs(v.trim) <= 200) o.trim = v.trim;
    if (num(v.goal) >= 5 && v.goal <= 120) o.goal = v.goal;
    if (typeof v.focus === 'string' && v.focus.length <= 80) o.focus = v.focus;
    return o;
  }

  /* Fields the page prints as numbers must be numbers (or absent). The app never writes anything else, so a
     record that has text there was not written by the app and is left out. */
  var SONG_NUMS = ['level', 'levelAuto', 'bpm', 'capo', 'beatsPerSlot', 'createdAt', 'updatedAt'];
  var SESS_NUMS = ['secs', 'pct', 'bpm', 'level', 'acc', 'hits', 'total', 'cents', 'count', 'score', 'combo', 'stars'];
  function numbersOnly(o, keys) { return keys.every(function (k) { var v = o[k]; return v === undefined || v === null || typeof v === 'number'; }); }
  /* files: {name: text}, as read from the gist. Anything that is not what the app writes is left out. */
  function readFiles(files) {
    var out = { songs: {}, gone: {}, sessions: [], settings: null, settingsAt: 0, bad: [] }, seen = {};
    Object.keys(files || {}).forEach(function (name) {
      if (name !== MAIN && !SESS.test(name)) return;
      var v;
      try { v = JSON.parse(files[name]); } catch (e) { out.bad.push(name); return; }
      if (!v || typeof v !== 'object') { out.bad.push(name); return; }
      if (name === MAIN) {
        if (v.songs && typeof v.songs === 'object') Object.keys(v.songs).forEach(function (id) { var d = v.songs[id]; if (d && typeof d === 'object' && Array.isArray(d.sections) && numbersOnly(d, SONG_NUMS)) out.songs[id] = Object.assign({}, d, { id: id }); });
        if (v.gone && typeof v.gone === 'object') Object.keys(v.gone).forEach(function (id) { if (num(v.gone[id])) out.gone[id] = v.gone[id]; });
        if (v.settings && typeof v.settings === 'object') { out.settings = cleanSettings(v.settings); out.settingsAt = num(v.settingsAt); }
      } else if (Array.isArray(v.sessions)) {
        v.sessions.forEach(function (x) { if (x && typeof x === 'object' && typeof x.id === 'string' && num(x.at) && numbersOnly(x, SESS_NUMS) && !seen[x.id]) { seen[x.id] = 1; out.sessions.push(x); } });
      }
    });
    return out;
  }
  /* a: this device, b: the account. Nothing either side has is lost, except to a newer edit or delete. */
  function mergeData(a, b) {
    var out = { songs: {}, gone: {}, sessions: [], settings: a.settings, settingsAt: num(a.settingsAt) }, ids = {}, seen = {};
    [a.songs, b.songs, a.gone, b.gone].forEach(function (m) { Object.keys(m || {}).forEach(function (id) { ids[id] = 1; }); });
    Object.keys(ids).forEach(function (id) {
      var x = a.songs && a.songs[id], y = b.songs && b.songs[id];
      var song = x && y ? (num(x.updatedAt) > num(y.updatedAt) ? x : y) : (x || y);
      var gone = Math.max(num(a.gone && a.gone[id]), num(b.gone && b.gone[id]));
      if (song && num(song.updatedAt) >= gone) out.songs[id] = song;
      else if (gone) out.gone[id] = gone;
    });
    (b.sessions || []).concat(a.sessions || []).forEach(function (x) { if (x && x.id && !seen[x.id]) { seen[x.id] = 1; out.sessions.push(x); } });
    out.sessions.sort(function (p, q) { return num(q.at) - num(p.at) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0); });
    if (b.settings && (num(b.settingsAt) > num(a.settingsAt) || !a.settings)) { out.settings = b.settings; out.settingsAt = num(b.settingsAt); }
    return out;
  }
  function filesOf(d) {
    var songs = {}, out = {}, by = {};
    Object.keys(d.songs).forEach(function (id) { var c = Object.assign({}, d.songs[id]); delete c.id; delete c.drill; songs[id] = c; });
    out[MAIN] = canon({ app: 'practice-room', v: 1, songs: songs, gone: d.gone || {}, settings: d.settings || {}, settingsAt: num(d.settingsAt) });
    d.sessions.forEach(function (x) { var m = monthOf(x.at); (by[m] || (by[m] = [])).push(x); });
    Object.keys(by).forEach(function (m) {
      var list = by[m].slice().sort(function (p, q) { return num(p.at) - num(q.at) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0); });
      out['sessions-' + m + '.json'] = '{"v":1,"sessions":[\n' + list.map(canon).join(',\n') + '\n]}';
    });
    return out;
  }

  var Acct = App.acct = {
    offered: false,        /* false inside Claude, where the page's own database does this job */
    token: '', user: null, gist: '', url: '', last: 0,
    state: 'out',          /* out | in | saving | offline | expired | error */
    err: '', blind: false, busy: false, dirty: false, checked: false, timer: null, wait: 0, running: null,
    canon: canon, mergeData: mergeData, filesOf: filesOf, readFiles: readFiles, monthOf: monthOf
  };
  function keep() { ls.set(LS.account, Acct.token ? { token: Acct.token, user: Acct.user, gist: Acct.gist, url: Acct.url, last: Acct.last } : null); }
  function stuck(st) { return st === 'expired' || st === 'error'; }
  function show(state) {
    var was = Acct.state;
    Acct.state = state;
    if (App.pill) App.pill();
    if (stuck(was) !== stuck(state) && App.render) App.render();     /* Today carries a warning while saving has stopped */
    if (App.accountRefresh) App.accountRefresh();
  }
  function playing() { var P = App.practice, T = App.tuner, O = App.omc; return !!((P && P.st && (P.st.run || P.st.busy)) || (T && (T.on || T.busy)) || (O && O.st && O.st.on)); }
  function defer(ms) { clearTimeout(Acct.timer); Acct.timer = setTimeout(function () { Acct.timer = null; Acct.sync('later'); }, ms); }

  function api(method, path, body, open) {
    var headers = { Accept: 'application/vnd.github+json' }, opt = { method: method, headers: headers, cache: 'no-store' };
    if (!open) headers.Authorization = 'Bearer ' + Acct.token;
    if (body) { headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return root.fetch(path.indexOf('https://') === 0 ? path : API + path, opt).then(function (res) {
      return res.text().then(function (txt) {
        if (res.ok) { if (open) return txt; try { return txt ? JSON.parse(txt) : null; } catch (e) { return null; } }
        var data = null, limited = false;
        try { data = JSON.parse(txt); } catch (e2) { /* not every refusal has a body */ }
        try { limited = res.headers.get('X-RateLimit-Remaining') === '0' || !!res.headers.get('Retry-After'); } catch (e3) { /* headers not shown to the page */ }
        var err = new Error((data && data.message) || ('GitHub answered ' + res.status));
        err.status = res.status; err.limited = limited; err.call = method + ' ' + path.replace(API, '').split('?')[0].replace(/\/[0-9a-f]{20,}/, '/…');
        throw err;
      });
    }, function () { var err = new Error('GitHub could not be reached'); err.status = 0; throw err; });
  }
  function kindOf(e) {
    var s = e && e.status;
    if (s === 401) return 'expired';
    if (!s || s >= 500 || s === 429 || e.limited) return 'offline';
    if (s === 403 || s === 404 || s === 422) return 'perm';
    return 'offline';
  }
  /* every gist of this account that holds the app's file, oldest first */
  function listMine(page, acc) {
    return api('GET', '/gists?per_page=100&page=' + page).then(function (list) {
      (list || []).forEach(function (g) { if (g && g.id && g.files && g.files[MAIN]) acc.push({ id: g.id, at: g.created_at || '' }); });
      return (list || []).length === 100 && page < 5 ? listMine(page + 1, acc) : acc;
    });
  }
  function readGist(id) {
    return api('GET', '/gists/' + id).then(function (g) {
      var files = {}, jobs = [];
      Object.keys((g && g.files) || {}).forEach(function (name) {
        var f = g.files[name];
        if (!f || (name !== MAIN && !SESS.test(name))) return;
        if (f.truncated && f.raw_url) jobs.push(api('GET', f.raw_url, null, true).then(function (txt) { files[name] = txt; }));   /* over a megabyte: the whole file is at its own address */
        else files[name] = String(f.content || '');
      });
      return Promise.all(jobs).then(function () { return { files: files, url: (g && g.html_url) || '' }; });
    });
  }
  /* Which gist is this account's? Asked once per visit, so a second device finds the first one's file instead
     of starting its own, and so two files (two devices signing in at the same moment) are joined into the older. */
  function pick() {
    if (Acct.checked && Acct.gist) return Promise.resolve([Acct.gist]);
    return listMine(1, []).then(function (list) {
      Acct.checked = true;
      list.sort(function (p, q) { return p.at < q.at ? -1 : p.at > q.at ? 1 : 0; });
      var ids = list.map(function (g) { return g.id; });
      /* a file this device wrote that GitHub does not list for this key: other devices will not find it either */
      Acct.blind = !!Acct.gist && ids.indexOf(Acct.gist) < 0;
      if (!ids.length) return Acct.gist ? [Acct.gist] : [];
      if (Acct.gist && ids.indexOf(Acct.gist) < 0) ids.push(Acct.gist);
      if (ids.length > 1) Diag.add('account', ids.length + ' saved files found, joined into the oldest');
      Acct.gist = ids[0];
      return ids;
    });
  }
  function sig() { return canon(S.songs) + '|' + S.sessions.length + '|' + (S.sessions[0] ? S.sessions[0].id : '') + '|' + canon(S.settings); }
  function apply(m) {
    var before = sig(), songs = {};
    Object.keys(m.songs).forEach(function (id) { songs[id] = Object.assign({}, m.songs[id], { id: id }); });
    S.songs = songs; ls.set(LS.songs, songs);
    Store.gone = m.gone; ls.set(LS.gone, m.gone);
    S.sessions = m.sessions.slice(0, Store.cap()); ls.set(LS.sessions, S.sessions);
    if (m.settings && num(m.settingsAt) > Store.settingsAt) {
      Object.assign(S.settings, m.settings); ls.set(LS.settings, S.settings);
      Store.settingsAt = m.settingsAt; ls.set(LS.setAt, m.settingsAt);
    }
    return sig() !== before;
  }
  /* one round: read, join, write what differs. Resolves with what happened, rejects with GitHub's refusal. */
  function run() {
    var texts = {}, hadRemote = false;
    return pick().then(function (ids) {
      var remote = readFiles({}), chain = Promise.resolve();
      ids.forEach(function (id, i) {
        chain = chain.then(function () {
          return readGist(id).then(function (g) {
            var r = readFiles(g.files);
            if (r.bad.length) Diag.add('account', 'unreadable in the saved file: ' + r.bad.join(', '));
            if (i === 0) { texts = g.files; Acct.url = g.url; hadRemote = true; remote = r; } else remote = mergeData(remote, r);
          }, function (e) {
            if (i > 0) return;                                                   /* an extra copy that has gone: nothing to join */
            if (e.status === 404) { Acct.gist = ''; Acct.url = ''; Acct.blind = false; return; }   /* deleted on GitHub: start a new one */
            throw e;
          });
        });
      });
      return chain.then(function () { return remote; });
    }).then(function (remote) {
      var hereBefore = S.sessions.length;
      var m = mergeData({ songs: S.songs, gone: Store.gone, sessions: S.sessions, settings: Object.assign({}, S.settings), settingsAt: Store.settingsAt }, remote);
      var out = { changed: apply(m), made: false, wrote: 0, fromAccount: Math.max(0, S.sessions.length - hereBefore), hadRemote: hadRemote };
      var files = filesOf(m), body = {};
      Object.keys(files).forEach(function (name) { if (files[name] !== texts[name]) { body[name] = { content: files[name] }; out.wrote++; } });
      if (!Acct.gist) {
        return api('POST', '/gists', { description: DESC, public: false, files: body }).then(function (g) {
          if (!g || !g.id) { var e = new Error('GitHub did not create the file'); e.status = 422; throw e; }
          Acct.gist = g.id; Acct.url = g.html_url || ''; out.made = true; return out;
        });
      }
      if (out.wrote) return api('PATCH', '/gists/' + Acct.gist, { files: body }).then(function () { return out; });
      return out;
    });
  }

  Acct.sync = function (why) {
    if (!Acct.offered || !Acct.token || Acct.state === 'expired') return Promise.resolve(false);
    if (Acct.busy) { Acct.dirty = true; return Acct.running || Promise.resolve(false); }
    if (playing()) { defer(4000); return Promise.resolve(false); }     /* never in the middle of a run */
    clearTimeout(Acct.timer); Acct.timer = null;
    Acct.busy = true; Acct.dirty = false; show('saving');
    Acct.running = run().then(function (r) {
      Acct.busy = false; Acct.last = Date.now(); Acct.err = ''; Acct.wait = 0; keep();
      if (r.made) Diag.add('account', 'started a saved file on GitHub');
      else if (r.fromAccount) Diag.add('account', r.fromAccount + ' sessions came from the account');
      show('in');
      if (r.changed && App.render) App.render();
      if (Acct.dirty) defer(1500);
      return true;
    }, function (e) {
      Acct.busy = false;
      var kind = kindOf(e), next = kind === 'expired' ? 'expired' : kind === 'perm' ? 'error' : 'offline';
      Acct.err = (e && e.message) || 'error';
      if (next !== Acct.state) Diag.add('account', (why || 'save') + ' failed: ' + ((e && e.call) || '') + ' ' + ((e && e.status) || 'no answer') + ' ' + Acct.err);
      show(next);
      if (next === 'offline') { Acct.wait = Math.min(300000, (Acct.wait || 15000) * 2); defer(Acct.wait); }
      return false;
    });
    return Acct.running;
  };
  /* something was saved on this device: send it along shortly, once, however many things changed */
  Acct.touch = function () {
    if (!Acct.offered || !Acct.token || Acct.state === 'expired') return;
    if (Acct.busy) { Acct.dirty = true; return; }
    defer(1500);
  };

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  /* Resolves with the account once the key has been shown to work end to end (the account was read and the
     saved file was found or made). Until then nothing about the key is kept. */
  Acct.signIn = function (raw) {
    var token = String(raw || '').replace(/\s+/g, '');
    if (!/^(github_pat_|gh[a-z]_)[A-Za-z0-9_]{20,}$/.test(token)) return Promise.reject(fail('shape', token ? 'That is not a GitHub key. A key starts with github_pat_ and is one long word; copy it with the copy button on GitHub.' : 'Paste the key first.'));
    if (Acct.busy) return Promise.reject(fail('busy', 'Still saving. Try again in a moment.'));
    var prev = { token: Acct.token, user: Acct.user, gist: Acct.gist, url: Acct.url, state: Acct.state, checked: Acct.checked };
    clearTimeout(Acct.timer); Acct.timer = null;
    Acct.token = token; Acct.busy = true;
    return api('GET', '/user').then(function (u) {
      if (!u || !u.login) throw fail('odd', 'GitHub did not say whose key this is.');
      var same = prev.user && prev.user.login === u.login;
      Acct.user = { login: String(u.login), name: String(u.name || u.login), avatar: String(u.avatar_url || ''), url: String(u.html_url || '') };
      Acct.gist = same ? prev.gist : ''; Acct.url = same ? prev.url : ''; Acct.checked = false; Acct.blind = false;
      return run();
    }).then(function (r) {
      Acct.busy = false; Acct.last = Date.now(); Acct.err = ''; Acct.wait = 0; keep();
      Diag.add('account', 'signed in as ' + Acct.user.login + (r.made ? ', started a saved file' : ', found the saved file' + (r.fromAccount ? ' with ' + r.fromAccount + ' sessions new to this device' : '')));
      show('in');
      if (App.render) App.render();
      if (Acct.dirty) defer(1500);
      return { user: Acct.user, made: r.made, fromAccount: r.fromAccount };
    }, function (e) {
      Acct.busy = false;
      Acct.token = prev.token; Acct.user = prev.user; Acct.gist = prev.gist; Acct.url = prev.url; Acct.checked = prev.checked; Acct.state = prev.state;
      if (e && e.code) throw e;
      var kind = kindOf(e), call = (e && e.call) || '';
      Diag.add('account', 'sign-in failed: ' + call + ' ' + ((e && e.status) || 'no answer') + ' ' + ((e && e.message) || ''));
      if (kind === 'expired') throw fail('refused', 'GitHub did not accept that key. Copy it again from the page where you made it, or make a new one.');
      if (kind === 'perm') throw fail('perm', 'The key works, but it is not allowed to save gists. Make it with the button above, which sets that up, and do not change the permissions on that page.');
      throw fail('offline', e && e.limited ? 'GitHub is asking for a pause. Try again in a few minutes.' : 'GitHub could not be reached. Check the connection and try again.');
    });
  };
  /* What is on this device stays; the saved file on GitHub stays. Only the key is forgotten. */
  Acct.signOut = function () {
    clearTimeout(Acct.timer); Acct.timer = null;
    var who = Acct.user && Acct.user.login;
    Acct.token = ''; Acct.user = null; Acct.gist = ''; Acct.url = ''; Acct.last = 0; Acct.err = ''; Acct.checked = false; Acct.blind = false; Acct.dirty = false; Acct.wait = 0;
    keep();
    Diag.add('account', 'signed out' + (who ? ' of ' + who : ''));
    show('out');
  };
  /* The page on GitHub where the key is made, with the form filled in. Names must differ between keys, so the
     name carries the device and the time. */
  Acct.keyUrl = function (classic) {
    var nav = root.navigator || {}, ua = String(nav.userAgent || ''), d = new Date();
    var dev = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'browser';
    var name = 'Practice Room ' + dev + ' ' + d.getDate() + ' ' + App.MONTH[d.getMonth()] + ' ' + App.pad2(d.getHours()) + App.pad2(d.getMinutes());
    if (classic) return 'https://github.com/settings/tokens/new?scopes=gist&description=' + encodeURIComponent(name);
    return 'https://github.com/settings/personal-access-tokens/new?name=' + encodeURIComponent(name) +
      '&description=' + encodeURIComponent('Lets the Practice Room app save guitar practice progress to a secret gist. It can read and write gists and nothing else.') +
      '&expires_in=none&gists=write';
  };
  Acct.label = function () {
    var st = Acct.state;
    if (!Acct.offered || st === 'out') return null;
    if (st === 'saving') return { text: 'Saving', cls: ' is-cloud', title: 'Saving to your GitHub account' };
    if (st === 'in') return { text: 'Saved to GitHub', cls: ' is-cloud', title: 'Songs and sessions are saved to your GitHub account' };
    if (st === 'expired') return { text: 'Sign in again', cls: ' is-bad', title: 'GitHub no longer accepts the key on this device' };
    if (st === 'error') return { text: 'Not saved to GitHub', cls: ' is-bad', title: 'GitHub refused to save' };
    return { text: 'Saved here, GitHub later', cls: ' is-warn', title: 'GitHub cannot be reached right now. Everything is kept on this device and sent later.' };
  };
  Acct.since = function () {
    if (!Acct.last) return '';
    var s = Math.round((Date.now() - Acct.last) / 1000);
    if (s < 50) return 'just now';
    if (s < 3000) return Math.max(1, Math.round(s / 60)) + ' min ago';
    if (s < 80000) return Math.round(s / 3600) + ' h ago';
    return App.ago(Acct.last);
  };
  /* called once the page knows whether it has a database of its own */
  Acct.init = function () {
    Acct.offered = !Store.db && !(root.claude && typeof root.claude.use === 'function') && typeof root.fetch === 'function';
    if (!Acct.offered) return;
    var k = ls.get(LS.account);
    if (k && typeof k.token === 'string' && k.token && k.user && k.user.login) {
      Acct.token = k.token; Acct.user = k.user; Acct.gist = String(k.gist || ''); Acct.url = String(k.url || ''); Acct.last = num(k.last); Acct.state = 'in';
    }
    if (root.addEventListener) {
      root.addEventListener('online', function () { if (Acct.token && Acct.state !== 'in') Acct.sync('online'); });
      if (root.document) root.document.addEventListener('visibilitychange', function () {
        if (!root.document.hidden && Acct.token && Date.now() - Acct.last > 60000) Acct.sync('back');      /* another device may have played since */
      });
    }
    if (Acct.token) Acct.sync('open');
  };
})(typeof window !== 'undefined' ? window : globalThis);

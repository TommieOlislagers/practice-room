/* stage.js: the playing screen. A note highway drawn on a canvas: six lanes, one per string (low E on the
   left), with what to play sliding towards a strike line. Chords come down as bars with the fret for each
   string; single notes as discs. The practice code tells the stage what happened (hit, late, miss) and the
   stage shows it: bursts, floating points, a multiplier, stars. It decides nothing about scoring itself. */
(function (root) {
  'use strict';
  var PR = root.PR, App = PR.app, esc = App.esc, IC = App.IC, $ = App.$;
  var LANES = ['#ff453a', '#ffd60a', '#0a84ff', '#ff9f0a', '#30d158', '#bf5af2'];
  var St = PR.stage = { on: false };
  var el, cv, g, W = 0, H = 0, dpr = 1, raf = 0, cfg = null, gems = [], fx = [], floats = [], cur = 0, curTo = 0, pulse = 0, banner = null, countIn = null, still = false, lastT = 0;

  function reduced() { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

  /* opts: { title, sub, mode 'wait' | 'time', listen, sel, look (seconds of highway), now() -> song time, skip } */
  St.open = function (opts) {
    el = $('#stage'); if (!el) return;
    cfg = opts; gems = opts.sel.map(function () { return { s: 0, at: 0 }; });
    fx = []; floats = []; cur = 0; curTo = 0; banner = null; countIn = null; still = reduced();
    el.innerHTML = '<canvas id="stageCanvas" aria-hidden="true"></canvas>' +
      '<div class="st-top"><div class="st-bar"><button class="st-x" data-act="p-stop" aria-label="Stop and see the result">' + IC.x + '</button>' +
      '<div class="st-title"><b>' + esc(opts.title) + '</b><span>' + esc(opts.sub || '') + '</span></div>' +
      '<div class="st-score"' + (opts.listen ? '' : ' hidden') + '><b id="stScore">0</b><span>Score</span></div></div>' +
      '<div class="st-prog"><div class="progress"><i id="hudProg"></i></div>' + (opts.listen ? '<span id="stStars">' + App.starsHtml(0) + '</span>' : '<span></span>') + '</div></div>' +
      (opts.listen ? '<div class="st-side"><div class="st-mult" id="stMult" data-m="1">×1</div><div class="st-streak"><b id="stStreak">0</b>in a row</div></div>' : '') +
      '<div class="st-gap"></div>' +
      '<div class="st-bottom"><div class="st-now"><div><span class="st-cap">Now</span><div class="big" id="hudNow">–</div><div class="det" id="hudDetail"></div></div>' +
      '<div class="st-next"><span class="st-cap">Next</span><div class="mid" id="hudNext">–</div></div></div>' +
      '<div class="st-meta">' + (opts.listen ? '<span>Heard <b id="hudHeard">–</b></span><span class="row-tight"><span class="beats" id="hudBeats"></span><span class="level" title="Input level"><i id="hudLevel"></i></span></span>'
        : '<span id="hudHint">Play along with the click.</span><span class="beats" id="hudBeats"></span>') + '</div>' +
      '<div class="st-stats"><div><span>' + (opts.listen ? 'Right' : 'Played') + '</span><b id="hudHits">0</b></div><div><span>' + (opts.listen ? 'Accuracy' : 'Bar') + '</span><b id="hudAcc">–</b></div><div><span>Time</span><b id="hudTime">0:00</b></div></div>' +
      '<div class="st-actions">' + (opts.skip ? '<button class="btn" data-act="p-skip">' + IC.skip + 'Skip this one</button>' : '') + '<button class="btn btn-stop" data-act="p-stop">' + IC.stop + 'Finish</button></div></div>';
    el.hidden = false;
    cv = $('#stageCanvas'); g = cv.getContext ? cv.getContext('2d') : null;
    St.on = true; W = 0;
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) { /* ignore */ }
    cancel(); loop();
  };
  St.close = function () {
    St.on = false; cancel();
    if (el) { el.hidden = true; el.innerHTML = ''; }
    try { document.documentElement.style.overflow = ''; } catch (e) { /* ignore */ }
    cfg = null;
  };
  function cancel() { if (raf) { (root.cancelAnimationFrame || clearTimeout)(raf); raf = 0; } }

  /* wait mode: which target is at the strike line */
  St.cursor = function (i) { curTo = i; };
  /* a new pass over the same targets (loop) */
  St.reset = function () { gems.forEach(function (x) { x.s = 0; x.at = 0; }); cur = 0; curTo = 0; };
  St.count = function (n) { countIn = n > 0 ? { n: n, at: Date.now() } : null; };
  St.beat = function (accent) { pulse = accent ? 1 : 0.6; };
  /* kind: 'hit' | 'late' | 'miss' | 'pass'; pts shown as a floating number */
  St.result = function (i, kind, pts, combo) {
    if (!St.on || !gems[i]) return;
    gems[i].s = kind === 'hit' ? 1 : kind === 'late' ? 2 : kind === 'pass' ? 4 : 3; gems[i].at = Date.now();
    var t = cfg.sel[i], lanes = lanesOf(t), col = kind === 'hit' ? '#30d158' : kind === 'late' ? '#ff9f0a' : '#ff453a';
    if (kind === 'miss') { if (!still) shake = 8; return; }
    if (kind === 'pass') { flash = { lanes: lanes, at: Date.now(), c: '#ffffff' }; return; }
    if (!still) lanes.forEach(function (ln) { for (var k = 0; k < 9; k++) fx.push({ lane: ln, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 6 - 2, x: 0, y: 0, life: 1, c: LANES[ln] }); });
    flash = { lanes: lanes, at: Date.now(), c: col };
    if (pts) floats.push({ txt: '+' + pts, at: Date.now(), c: col });
    if (combo && (combo === 8 || combo === 16 || combo === 24 || combo % 50 === 0)) banner = { txt: combo >= 24 && combo < 50 ? '×4  ON FIRE' : combo === 8 ? '×2' : combo === 16 ? '×3' : combo + ' IN A ROW', at: Date.now() };
    try { if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(kind === 'hit' ? 8 : 4); } catch (e) { /* no haptics */ }
  };
  St.hud = function (h) {
    if (!St.on) return;
    var sc = $('#stScore'); if (sc && h.score !== undefined) sc.textContent = String(h.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var m = $('#stMult'); if (m && h.mult !== undefined && m.getAttribute('data-m') !== String(h.mult)) { m.setAttribute('data-m', h.mult); m.textContent = '×' + h.mult; m.classList.add('bump'); setTimeout(function () { m.classList.remove('bump'); }, 160); }
    var sk = $('#stStreak'); if (sk && h.combo !== undefined) sk.textContent = String(h.combo);
    var ss = $('#stStars'); if (ss && h.stars !== undefined && ss.getAttribute('data-n') !== String(h.stars)) { ss.setAttribute('data-n', h.stars); ss.innerHTML = App.starsHtml(h.stars); }
  };
  var flash = null, shake = 0, bottomY = 0, tickN = 0;

  function lanesOf(t) {
    if (t.pos && t.pos.length) return t.pos.map(function (p) { return p.s; });
    return [0, 1, 2, 3, 4, 5];
  }
  /* depth 0 is the strike line, 1 the horizon; returns how far up the screen and how large */
  function proj(d) {
    var k = 2.4, p = (1 - 1 / (1 + k * Math.max(d, -0.3))) / (1 - 1 / (1 + k));
    return { p: p, s: 1 - p * 0.6 };
  }
  function size() {
    var r = el.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    var bt = el.querySelector('.st-bottom'); bottomY = bt ? bt.getBoundingClientRect().top - r.top + 14 : h - 300;
    if (w === W && h === H) return;
    W = w; H = h; dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
  }
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function loop() {
    raf = (root.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(loop);
    if (!St.on || !g || !cfg) return;
    if (!(tickN++ % 20) || !W) size();
    var now = Date.now(), dt = Math.min(0.05, (now - (lastT || now)) / 1000); lastT = now;
    cur += (curTo - cur) * Math.min(1, dt * 10);
    pulse *= Math.pow(0.02, dt); if (shake > 0.2) shake *= Math.pow(0.001, dt); else shake = 0;
    var sel = cfg.sel, te = cfg.mode === 'time' ? cfg.now() : 0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* backdrop: a dark hall, two soft lights that breathe with the beat */
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#120b2e'); bg.addColorStop(0.55, '#0a0718'); bg.addColorStop(1, '#05040c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var glow = 0.1 + pulse * 0.1;
    [[W * 0.12, '#5e5ce6'], [W * 0.88, '#bf5af2']].forEach(function (L) {
      var rg = g.createRadialGradient(L[0], H * 0.16, 0, L[0], H * 0.16, W * 0.75);
      rg.addColorStop(0, hexA(L[1], glow * 2.2)); rg.addColorStop(1, hexA(L[1], 0));
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    });
    /* highway geometry */
    var cx = W / 2 + (shake ? (Math.random() - 0.5) * shake : 0), yHit = bottomY - 34, yTop = Math.max(118, H * 0.17);
    var nearW = Math.min(W - 20, 460), half = nearW / 2;
    function X(lane, d) { var pr = proj(d); return cx + ((lane - 2.5) / 6) * nearW * pr.s; }
    function Y(d) { return yHit - (yHit - yTop) * proj(d).p; }
    function edge(side, d) { return cx + side * half * proj(d).s; }
    /* the board */
    g.beginPath(); g.moveTo(edge(-1, -0.22), Y(-0.22)); g.lineTo(edge(1, -0.22), Y(-0.22)); g.lineTo(edge(1, 1), Y(1)); g.lineTo(edge(-1, 1), Y(1)); g.closePath();
    var bd = g.createLinearGradient(0, Y(1), 0, Y(-0.22)); bd.addColorStop(0, 'rgba(30,24,70,.25)'); bd.addColorStop(1, 'rgba(46,38,104,.85)');
    g.fillStyle = bd; g.fill();
    /* lanes: the strings */
    var i, d;
    for (i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(X(i, -0.22), Y(-0.22)); g.lineTo(X(i, 1), Y(1));
      g.strokeStyle = hexA(LANES[i], 0.55); g.lineWidth = 1 + (5 - i) * 0.35; g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2;
    [-1, 1].forEach(function (sd) { g.beginPath(); g.moveTo(edge(sd, -0.22), Y(-0.22)); g.lineTo(edge(sd, 1), Y(1)); g.stroke(); });
    /* depth of a target */
    function depth(k) {
      if (cfg.mode === 'time') return (sel[k].start - te) / cfg.look;
      return (k - cur) * 0.17;
    }
    /* bar lines across the board */
    if (cfg.mode === 'time' && cfg.spb) {
      var first = Math.ceil((te - cfg.t0) / cfg.spb);
      for (var b = Math.max(0, first); b < first + 40; b++) {
        d = (cfg.t0 + b * cfg.spb - te) / cfg.look; if (d > 1) break;
        var strong = b % (cfg.per || 4) === 0;
        g.beginPath(); g.moveTo(edge(-1, d), Y(d)); g.lineTo(edge(1, d), Y(d));
        g.strokeStyle = strong ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.1)'; g.lineWidth = strong ? 1.5 : 1; g.stroke();
      }
    }
    /* strike line and the six pads */
    var nextI = -1;
    for (i = 0; i < sel.length; i++) { if (gems[i].s === 0 && depth(i) > -0.06) { nextI = i; break; } }
    var want = nextI >= 0 ? lanesOf(sel[nextI]) : [];
    g.beginPath(); g.moveTo(edge(-1, 0), yHit); g.lineTo(edge(1, 0), yHit);
    g.strokeStyle = 'rgba(255,255,255,' + (0.75 + pulse * 0.25) + ')'; g.lineWidth = 3 + pulse * 2; g.shadowColor = '#fff'; g.shadowBlur = 10 + pulse * 14; g.stroke(); g.shadowBlur = 0;
    var padR = Math.min(22, nearW / 15);
    for (i = 0; i < 6; i++) {
      var on = want.indexOf(i) >= 0, fl = flash && flash.lanes.indexOf(i) >= 0 ? Math.max(0, 1 - (now - flash.at) / 260) : 0;
      g.beginPath(); g.arc(X(i, 0), yHit, padR * (1 + fl * 0.35), 0, 6.3);
      g.fillStyle = fl ? hexA(flash.c, 0.35 + fl * 0.6) : hexA(LANES[i], on ? 0.34 : 0.12); g.fill();
      g.lineWidth = on ? 3 : 2; g.strokeStyle = hexA(LANES[i], on ? 1 : 0.5); g.stroke();
    }
    /* what is coming, far ones first */
    var order = [];
    for (i = 0; i < sel.length; i++) { d = depth(i); if (d < 1.08 && d > -0.3) order.push([i, d]); if (d >= 1.08 && cfg.mode === 'wait') break; }
    order.sort(function (a, b2) { return b2[1] - a[1]; });
    order.forEach(function (o) {
      var k = o[0], dd = o[1], t = sel[k], gm = gems[k], pr = proj(dd), y = Y(dd), sc = pr.s;
      var age = gm.at ? (now - gm.at) / 1000 : 0, alpha = dd > 0.9 ? Math.max(0, (1.08 - dd) / 0.18) : 1;
      if (gm.s === 1 || gm.s === 2) { if (age > 0.25) return; alpha *= 1 - age / 0.25; sc *= 1 + age * 1.6; }
      if (gm.s === 3) alpha *= Math.max(0, 1 - age / 0.7) * 0.6;
      if (gm.s === 4) alpha *= Math.max(0, 1 - age / 0.5);
      if (alpha <= 0.01) return;
      var lanes = lanesOf(t), lo = Math.min.apply(null, lanes), hi = Math.max.apply(null, lanes);
      var tone = gm.s === 3 ? '#8e8e93' : gm.s === 2 ? '#ff9f0a' : null;
      g.globalAlpha = alpha;
      if (t.kind === 'chord' || lanes.length > 1) {
        /* how long the chord is held, as a ribbon behind it */
        if (cfg.mode === 'time' && gm.s === 0 && t.end) {
          var d2 = Math.min(1.05, (t.end - te - 0.12) / cfg.look);
          if (d2 > dd) { g.beginPath(); g.moveTo(X(lo, dd) - 8 * sc, y); g.lineTo(X(hi, dd) + 8 * sc, y); g.lineTo(X(hi, d2) + 8 * proj(d2).s, Y(d2)); g.lineTo(X(lo, d2) - 8 * proj(d2).s, Y(d2)); g.closePath(); g.fillStyle = 'rgba(125,122,255,.16)'; g.fill(); }
        }
        var h = Math.max(12, 34 * sc), x0 = X(lo, dd) - 20 * sc, x1 = X(hi, dd) + 20 * sc;
        rr(x0, y - h / 2, x1 - x0, h, h / 2);
        var gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
        gr.addColorStop(0, tone || '#9d9bff'); gr.addColorStop(1, tone || '#5856d6');
        g.fillStyle = gr; g.shadowColor = tone || '#7d7aff'; g.shadowBlur = dd < 0.12 && gm.s === 0 ? 18 : 0; g.fill(); g.shadowBlur = 0;
        g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.7)'; g.stroke();
        /* frets per string once it is close enough to read, the name above */
        if (t.pos && sc > 0.62 && !t.quiet) {
          g.font = '700 ' + Math.round(15 * sc) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
          t.pos.forEach(function (p) { g.fillStyle = '#fff'; g.fillText(String(p.f), X(p.s, dd), y + 0.5); });
        }
        /* a strummed stroke carries an arrow: down towards the floor, up towards the ceiling */
        if (t.stroke) {
          var ax = t.quiet ? (x0 + x1) / 2 : x1 + 16 * sc, aw = 7 * sc, ah = 9 * sc, dir = t.stroke === 'U' ? -1 : 1;
          g.beginPath(); g.moveTo(ax - aw, y - dir * ah * 0.6); g.lineTo(ax + aw, y - dir * ah * 0.6); g.lineTo(ax, y + dir * ah * 0.8); g.closePath();
          g.fillStyle = t.quiet ? '#fff' : (t.stroke === 'U' ? '#ffd60a' : '#fff'); g.fill();
        }
        if (t.label && !t.quiet) {
          g.font = '800 ' + Math.round(Math.max(11, 22 * sc)) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
          g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 6; g.fillText(t.label, cx, y - h / 2 - 6 * sc); g.shadowBlur = 0;
        }
      } else {
        var ln = lanes[0], r = Math.max(7, 19 * sc), x = X(ln, dd);
        g.beginPath(); g.arc(x, y, r, 0, 6.3);
        var gc = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r); gc.addColorStop(0, '#fff'); gc.addColorStop(0.35, tone || LANES[ln]); gc.addColorStop(1, tone || shade(LANES[ln]));
        g.fillStyle = gc; g.shadowColor = tone || LANES[ln]; g.shadowBlur = dd < 0.12 && gm.s === 0 ? 20 : 6; g.fill(); g.shadowBlur = 0;
        g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
        if (t.pos && sc > 0.5) { g.font = '800 ' + Math.round(17 * sc) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#111'; g.fillText(String(t.pos[0].f), x, y + 1); }
      }
      g.globalAlpha = 1;
    });
    /* sparks */
    for (i = fx.length - 1; i >= 0; i--) {
      var s = fx[i]; s.vy += 22 * dt; s.x += s.vx; s.y += s.vy; s.life -= dt * 2.2;
      if (s.life <= 0) { fx.splice(i, 1); continue; }
      g.globalAlpha = s.life; g.fillStyle = s.c; g.beginPath(); g.arc(X(s.lane, 0) + s.x, yHit + s.y, 3.2 * s.life + 1, 0, 6.3); g.fill();
    }
    g.globalAlpha = 1;
    /* points lifting off the strike line */
    for (i = floats.length - 1; i >= 0; i--) {
      var f = floats[i], a = (now - f.at) / 800;
      if (a >= 1) { floats.splice(i, 1); continue; }
      g.globalAlpha = 1 - a; g.font = '800 26px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = f.c; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 6;
      g.fillText(f.txt, cx + nearW * 0.3, yHit - 36 - a * 60); g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
    /* a word across the middle for streaks, and the count-in */
    if (banner) {
      var ba = (now - banner.at) / 1100;
      if (ba >= 1) banner = null;
      else { g.globalAlpha = ba < 0.15 ? ba / 0.15 : 1 - (ba - 0.15) / 0.85; g.font = '900 ' + Math.round(40 + (still ? 0 : 14 * Math.min(1, ba * 5))) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd60a'; g.shadowColor = '#ff9f0a'; g.shadowBlur = 24; g.fillText(banner.txt, cx, (yTop + yHit) / 2 - 20); g.shadowBlur = 0; g.globalAlpha = 1; }
    }
    if (countIn) {
      var ca = Math.min(1, (now - countIn.at) / 500);
      g.globalAlpha = 1 - ca * 0.5; g.font = '900 ' + Math.round(150 - (still ? 0 : ca * 30)) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = '#7d7aff'; g.shadowBlur = 30;
      g.fillText(String(countIn.n), cx, yTop + (yHit - yTop) * 0.72); g.shadowBlur = 0; g.globalAlpha = 1;
    }
  }
  var FONT = 'ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Roboto, sans-serif';
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
  function shade(hex) { var n = parseInt(hex.slice(1), 16); return 'rgb(' + Math.round((n >> 16) * 0.55) + ',' + Math.round(((n >> 8) & 255) * 0.55) + ',' + Math.round((n & 255) * 0.55) + ')'; }
})(typeof window !== 'undefined' ? window : globalThis);

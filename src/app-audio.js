/* app-audio.js: microphone, tones, metronome, and reading recorded takes. */
(function (root) {
  'use strict';
  var PR = root.PR, App = PR.app, S = App.S;

  var A = App.audio = {
    ctx: null, stream: null, src: null, analyser: null, buf: null, bytes: null, an: null,

    ensure: function () {
      if (!A.ctx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        try { A.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { A.ctx = new AC(); } catch (e2) { return null; } }
      }
      if (A.ctx.state === 'suspended') { try { A.ctx.resume(); } catch (e3) { /* needs a tap */ } }
      return A.ctx;
    },

    /* What can be told without asking. Nothing here decides for the player: the page only calls the
       microphone blocked once the browser has said so, or after a real request was refused. */
    probe: function () {
      var m = S.mic, md = root.navigator && root.navigator.mediaDevices;
      m.framed = App.isFramed();
      if (!md || typeof md.getUserMedia !== 'function') { m.pre = 'blocked'; m.why = root.isSecureContext === false ? 'insecure' : 'no-api'; return; }
      try {
        var fp = document.featurePolicy || document.permissionsPolicy;
        if (fp && typeof fp.allowsFeature === 'function') m.policy = !!fp.allowsFeature('microphone');
      } catch (e) { /* not every browser can tell */ }
      if (m.policy === false) { m.pre = 'blocked'; m.why = 'frame'; }
      var last = App.ls.get('pr.mic.last');
      if (m.pre !== 'blocked' && last && last.ok === false && last.framed === m.framed) { m.pre = 'blocked'; m.why = last.why || 'refused'; m.detail = last.name || ''; }
      try {
        if (root.navigator.permissions && root.navigator.permissions.query) {
          root.navigator.permissions.query({ name: 'microphone' }).then(function (st) {
            m.perm = st.state;
            /* Inside a frame that is not handed the microphone, browsers answer "denied" before anyone was
               asked (seen on iPhone, in Chrome and in the Claude app). Only on its own page does "denied"
               mean a setting the player can change. */
            if (st.state === 'denied' && m.policy !== false) { m.pre = 'blocked'; m.why = m.framed ? 'frame' : 'denied'; App.render(); }
            else if (st.state === 'granted' && m.policy !== false) { m.pre = 'ok'; m.why = ''; App.render(); }
          }).catch(function () {});
        }
      } catch (e2) { /* not supported */ }
    },

    /* The address of this page on its own, outside the frame it is shown in (empty when there is none). */
    ownUrl: function () {
      try {
        if (!S.mic.framed) return '';
        var u = String(root.location.href || '');
        return /^https:\/\//.test(u) ? u.split('#')[0] : '';
      } catch (e) { return ''; }
    },

    /* Ask the Claude view whether it has a microphone permission of its own to give. Resolves its answer or ''.
       Asked once per visit: a second question would get the same answer. */
    hostAsked: null,
    askHost: function () {
      var cl = root.claude;
      if (!cl || typeof cl.use !== 'function') return Promise.resolve('');
      if (A.hostAsked) return A.hostAsked;
      var done = false;
      return A.hostAsked = new Promise(function (resolve) {
        var timer = setTimeout(function () { if (!done) { done = true; App.diag.add('host', 'no answer'); resolve(''); } }, 6000);
        function finish(v, note) { if (done) return; done = true; clearTimeout(timer); App.diag.add('host', note); resolve(v); }
        cl.use('permissions').then(function (p) {
          if (!p) { finish('', 'no permissions panel in this view'); return; }
          return p.request(['microphone']).then(function (r) {
            var mine = (r && r.microphone) || 'unavailable';
            return p.state().then(function (all) { finish(mine, 'microphone ' + mine + '; view offers ' + (Object.keys(all || {}).map(function (k) { return k + '=' + all[k]; }).join(', ') || 'nothing')); },
              function () { finish(mine, 'microphone ' + mine); });
          });
        }).catch(function (e) { finish('', 'error ' + ((e && (e.code || e.message)) || '')); });
      });
    },

    /* A real request, made from a tap: the Claude view first, then the browser's own question. */
    askMic: function () {
      var host = A.askHost();
      return A.micStart().then(function (ok) {
        if (ok) return true;
        return host.then(function (state) { return state === 'granted' ? A.micStart() : false; });
      });
    },

    micStart: function () {
      var m = S.mic;
      if (m.state === 'live') return Promise.resolve(true);
      var md = root.navigator && root.navigator.mediaDevices;
      if (!md || typeof md.getUserMedia !== 'function') {
        m.state = 'blocked'; m.pre = 'blocked'; m.detail = 'no-api'; m.why = root.isSecureContext === false ? 'insecure' : 'no-api'; m.tried = true;
        App.diag.add('mic', 'no microphone interface in this view (' + m.why + ')');
        return Promise.resolve(false);
      }
      var ctx = A.ensure();
      if (!ctx) { m.state = 'error'; m.detail = 'no-audio'; App.diag.add('mic', 'no audio engine'); return Promise.resolve(false); }
      m.state = 'asking';
      var t0 = Date.now(), wanted;
      /* echo cancelling, noise suppression and automatic gain are made for speech and mangle a guitar */
      try { wanted = md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false }); }
      catch (e0) { wanted = Promise.reject(e0); }
      return wanted.then(function (stream) {
        A.stream = stream;
        A.src = ctx.createMediaStreamSource(stream);
        A.analyser = ctx.createAnalyser();
        A.analyser.smoothingTimeConstant = 0;
        var sizes = [32768, 16384, 8192, 4096, 2048], ok = false;
        for (var i = 0; i < sizes.length && !ok; i++) { try { A.analyser.fftSize = sizes[i]; ok = true; } catch (e) { /* older engines cap this */ } }
        A.src.connect(A.analyser);
        A.buf = new Float32Array(A.analyser.fftSize);
        A.an = PR.dsp.createAnalyzer(ctx.sampleRate, { a4: S.settings.a4 });
        m.state = 'live'; m.pre = 'ok'; m.detail = ''; m.why = ''; m.tried = true;
        App.ls.set('pr.mic.last', { ok: true, framed: m.framed, at: Date.now() });
        App.diag.add('mic', 'live after ' + (Date.now() - t0) + ' ms, ' + ctx.sampleRate + ' Hz' + (m.framed ? ', framed' : ', own page'));
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e2) { /* ignore */ } }
        return true;
      }).catch(function (e) {
        var name = e && e.name ? e.name : 'Error', ms = Date.now() - t0;
        m.detail = name; m.tried = true;
        if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError' || m.policy === false) {
          m.state = 'blocked'; m.pre = 'blocked';
          /* a frame that is not handed the microphone is refused at once, with no question shown;
             a person reading a question and tapping "Block" takes longer */
          m.why = (m.policy === false || (m.framed && ms < 700)) ? 'frame' : 'denied';
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') { m.state = 'none'; m.why = 'none'; }
        else { m.state = 'error'; m.why = 'error'; }
        App.ls.set('pr.mic.last', { ok: false, framed: m.framed, why: m.why, name: name, at: Date.now() });
        App.diag.add('mic', name + ' after ' + ms + ' ms (' + m.why + ')' + (m.framed ? ', framed' : ', own page') + ', policy ' + (m.policy === null ? 'unknown' : m.policy) + ', browser permission ' + (m.perm || 'unknown') + (e && e.message ? ': ' + String(e.message).slice(0, 90) : ''));
        return false;
      });
    },
    micStop: function () {
      try { if (A.src) A.src.disconnect(); } catch (e) { /* ignore */ }
      try { if (A.stream) A.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) { /* ignore */ }
      A.src = null; A.stream = null; A.analyser = null;
      if (S.mic.state === 'live' || S.mic.state === 'asking') S.mic.state = 'idle';
    },
    /* One analysis frame from the live microphone. */
    frame: function (wantPitch, wantChroma) {
      var an = A.analyser;
      if (!an || !A.an) return null;
      if (typeof an.getFloatTimeDomainData === 'function') an.getFloatTimeDomainData(A.buf);
      else {
        if (!A.bytes) A.bytes = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(A.bytes);
        for (var i = 0; i < A.bytes.length; i++) A.buf[i] = (A.bytes[i] - 128) / 128;
      }
      return A.an.analyze(A.buf, A.buf.length, wantPitch, wantChroma);
    },
    now: function () { return A.ctx ? A.ctx.currentTime : (root.performance ? root.performance.now() / 1000 : Date.now() / 1000); },

    /* ---- tones ---- */
    voices: [],
    pluck: function (freq, secs) {
      var ctx = A.ensure();
      if (!ctx) return null;
      secs = secs || 2.6;
      var t = ctx.currentTime + 0.01;
      var out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.55, t + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0008, t + secs);
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(6000, freq * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.min(3000, Math.max(500, freq * 3)), t + secs * 0.6);
      var oscs = [['sawtooth', 1, 0.5], ['triangle', 1, 0.7], ['sine', 2, 0.35]].map(function (d) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = d[0]; o.frequency.value = freq * d[1]; g.gain.value = d[2];
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + secs + 0.05);
        return o;
      });
      lp.connect(out); out.connect(ctx.destination);
      var v = { stop: function () { try { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); oscs.forEach(function (o) { o.stop(ctx.currentTime + 0.2); }); } catch (e) { /* already stopped */ } } };
      A.voices.push(v);
      if (A.voices.length > 6) A.voices.shift().stop();
      return v;
    },
    hush: function () { A.voices.forEach(function (v) { v.stop(); }); A.voices = []; },
    strum: function (midis, a4) {
      midis.forEach(function (m, i) { setTimeout(function () { A.pluck(PR.music.midiToFreq(m, a4 || S.settings.a4), 2.2); }, i * 28); });
    },
    /* a rising run of bell notes, one for each star */
    chime: function (n) {
      var ctx = A.ctx; if (!ctx || !n || S.settings.tones === false) return;
      [659.3, 830.6, 987.8].slice(0, n).forEach(function (f, i) {
        var t = ctx.currentTime + 0.25 + i * 0.18, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f * 2;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.75);
      });
    },
    click: function (time, accent, soft) {
      var ctx = A.ctx;
      if (!ctx) return;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = accent ? 2600 : soft ? 1350 : 1900;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(accent ? 0.32 : soft ? 0.07 : 0.2, time + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
      o.connect(g); g.connect(ctx.destination);
      o.start(time); o.stop(time + 0.05);
    }
  };

  /* ---- metronome: clicks are scheduled a little ahead on the audio clock ---- */
  App.Metro = function (opts) {
    this.bpm = opts.bpm; this.per = opts.beatsPerBar || 4; this.t0 = opts.t0; this.sound = opts.sound !== false;
    this.onBeat = opts.onBeat || null; this.next = 0; this.timer = null; this.until = opts.until || Infinity;
  };
  App.Metro.prototype.start = function () {
    var self = this, spb = 60 / this.bpm;
    function pump() {
      var ctx = A.ctx; if (!ctx) return;
      var horizon = ctx.currentTime + 0.12;
      while (self.t0 + self.next * spb < horizon) {
        var bt = self.t0 + self.next * spb, n = self.next;
        if (bt >= self.until) { self.stop(); return; }
        if (self.sound && bt >= ctx.currentTime - 0.02) A.click(Math.max(bt, ctx.currentTime), n % self.per === 0);
        if (self.onBeat) (function (n2, bt2) { setTimeout(function () { if (self.timer) self.onBeat(n2); }, Math.max(0, (bt2 - ctx.currentTime) * 1000)); })(n, bt);
        self.next++;
      }
    }
    this.timer = setInterval(pump, 25);
    pump();
  };
  App.Metro.prototype.stop = function () { if (this.timer) { clearInterval(this.timer); this.timer = null; } };

  /* What the last request for the microphone came to, in one sentence. */
  App.micSaid = function () {
    var m = S.mic;
    return m.state === 'none' ? 'No microphone found.' :
      m.why === 'frame' ? 'Refused inside Claude\'s viewer, before your phone was asked. The viewer does not pass the microphone on to this page.' :
      m.why === 'denied' ? 'Your browser refused the microphone. Allow it for this page in its site settings.' :
      (m.why === 'no-api' || m.why === 'insecure') ? 'This view has no microphone access.' : 'The microphone did not start (' + (m.detail || 'unknown') + ').';
  };

  /* ---- reading a recorded take ---- */
  function mixDown(buffer) {
    var n = buffer.length, ch = buffer.numberOfChannels, out = new Float32Array(n), c, i, d;
    for (c = 0; c < ch; c++) { d = buffer.getChannelData(c); for (i = 0; i < n; i++) out[i] += d[i]; }
    if (ch > 1) for (i = 0; i < n; i++) out[i] /= ch;
    return out;
  }
  function decodeBuffer(ctx, ab) {
    return new Promise(function (resolve, reject) {
      var done = false;
      try {
        var p = ctx.decodeAudioData(ab, function (b) { if (!done) { done = true; resolve(b); } }, function (e) { if (!done) { done = true; reject(e || new Error('decode')); } });
        if (p && typeof p.then === 'function') p.then(function (b) { if (!done) { done = true; resolve(b); } }, function (e) { if (!done) { done = true; reject(e || new Error('decode')); } });
      } catch (e) { reject(e); }
    });
  }
  /* Fallback: play the file through a media element and capture what it plays. Takes as long as the take. */
  function captureByPlaying(file, onProgress, askTap) {
    var ctx = A.ensure();
    return new Promise(function (resolve, reject) {
      if (!ctx) { reject(new Error('no-audio')); return; }
      var url, el = document.createElement(/^video\//.test(file.type) ? 'video' : 'audio');
      try { url = URL.createObjectURL(file); } catch (e) { reject(e); return; }
      el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', ''); el.src = url;
      /* some phones only play an element that is in the page */
      el.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none';
      try { document.body.appendChild(el); } catch (e0) { /* ignore */ }
      var chunks = [], total = 0, node, proc, sink, finished = false, poll;
      function finish(err) {
        if (finished) return; finished = true;
        clearInterval(poll);
        try { el.pause(); } catch (e) { /* ignore */ }
        try { if (proc) { proc.disconnect(); proc.onaudioprocess = null; } if (node) node.disconnect(); if (sink) sink.disconnect(); } catch (e2) { /* ignore */ }
        try { URL.revokeObjectURL(url); } catch (e3) { /* ignore */ }
        try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e4) { /* ignore */ }
        if (err) { reject(err); return; }
        var pcm = new Float32Array(total), off = 0;
        chunks.forEach(function (c) { pcm.set(c, off); off += c.length; });
        if (total < ctx.sampleRate * 0.5) { reject(new Error('empty')); return; }
        resolve({ pcm: pcm, sr: ctx.sampleRate });
      }
      el.onerror = function () { finish(new Error('unreadable')); };
      el.onended = function () { setTimeout(function () { finish(); }, 120); };
      try {
        node = ctx.createMediaElementSource(el);
        if (typeof ctx.createScriptProcessor !== 'function') { finish(new Error('no-capture')); return; }
        proc = ctx.createScriptProcessor(4096, 1, 1);
        sink = ctx.createGain(); sink.gain.value = 0;
        proc.onaudioprocess = function (ev) {
          if (el.paused || finished) return;
          var d = ev.inputBuffer.getChannelData(0);
          chunks.push(new Float32Array(d)); total += d.length;
        };
        node.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
      } catch (e) { finish(e); return; }
      var playedFor = 0;
      poll = setInterval(function () {
        if (onProgress && el.duration > 0 && isFinite(el.duration)) onProgress(el.currentTime / el.duration, 'listening');
        if (!el.paused) { playedFor += 0.2; if (playedFor > 3 && total === 0) finish(new Error('no-capture')); }
      }, 200);
      function go() {
        var p;
        A.ensure();
        try { p = el.play(); } catch (e) { finish(e); return; }
        if (p && typeof p.then === 'function') p.catch(function (e) {
          if (e && e.name === 'NotAllowedError' && askTap) askTap(function () { go(); });
          else finish(e);
        });
      }
      /* sound only runs after a tap: if the audio engine is still asleep, ask for one */
      if (ctx.state !== 'running' && askTap) askTap(function () { go(); }); else go();
    });
  }
  function readWhole(file) {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    return new Promise(function (resolve, reject) { var fr = new FileReader(); fr.onload = function () { resolve(fr.result); }; fr.onerror = function () { reject(fr.error || new Error('read')); }; fr.readAsArrayBuffer(file); });
  }
  function errName(e) { return (e && (e.code || (e.name && e.name !== 'Error' ? e.name : '') || e.message)) || 'failed'; }
  /* Resolves { pcm, sr, how, ms, clipped, trail }. Three ways, quickest first:
     "track"  - a phone recording (MP4, M4A, MOV): only its sound frames are read and decoded, whatever the file's size;
     "decode" - the whole file is handed to the browser's decoder (fine for small files and other formats);
     "play"   - the file is played through and captured, which takes as long as the recording.
     App.MAX_TAKE seconds are kept at most. */
  App.MAX_TAKE = 300;
  App.readTake = function (file, onProgress, askTap) {
    var MAX_TAKE = App.MAX_TAKE;
    var ctx = A.ensure();
    if (!ctx) return Promise.reject(new Error('no-audio'));
    var t0 = Date.now(), trail = [];
    var isVideo = /^video\//.test(file.type || '') || /\.(mov|mp4|m4v|3gp|mkv|webm)$/i.test(file.name || '');
    function done(pcm, sr, how, clipped) {
      var max = Math.round(sr * MAX_TAKE);
      if (pcm.length > max + sr) { pcm = pcm.subarray(0, max); clipped = true; }
      return { pcm: pcm, sr: sr, how: how, ms: Date.now() - t0, clipped: !!clipped, trail: trail };
    }
    /* The sound frames are handed to the decoder as a small sound-only MP4 first (the format every browser
       that plays AAC accepts) and, if that is turned down, as a bare ADTS stream. */
    function viaTrack() {
      return PR.mp4.extractAac(file, { maxSeconds: MAX_TAKE + 2, onProgress: function (p) { if (onProgress) onProgress(p, 'loading'); } }).then(function (a) {
        var said = [];
        function dec(bytes, label) {
          return decodeBuffer(ctx, bytes.buffer).then(function (b) {
            if (!b || !b.length) throw new Error('empty');
            var take = done(mixDown(b), b.sampleRate, 'track', a.clipped); take.wrap = label; return take;
          }).catch(function (e) { said.push(label + ' ' + errName(e)); throw e; });
        }
        return dec(PR.mp4.toM4a(a), 'm4a').catch(function () { return dec(PR.mp4.toAdts(a), 'adts'); })
          .catch(function () { var x = new Error('aac-decode'); x.code = 'aac-decode (' + said.join(', ') + ')'; throw x; });
      });
    }
    function viaDecode() {
      /* a phone video is far too large to load whole */
      if (file.size > (isVideo ? 25 : 80) * 1048576) { var big = new Error('too-big'); big.code = 'too-big'; return Promise.reject(big); }
      return readWhole(file).then(function (ab) { return decodeBuffer(ctx, ab); }).then(function (b) { return done(mixDown(b), b.sampleRate, 'decode', false); });
    }
    function viaPlay() { return captureByPlaying(file, onProgress, askTap).then(function (r) { return done(r.pcm, r.sr, 'play', false); }); }
    return viaTrack()
      .catch(function (e) { trail.push('track ' + errName(e)); return viaDecode(); })
      .catch(function (e) { trail.push('decode ' + errName(e)); return viaPlay(); })
      .catch(function (e) { trail.push('play ' + errName(e)); var err = new Error(e && e.message === 'empty' ? 'empty' : 'unreadable'); err.trail = trail; throw err; });
  };
  /* One line for the technical log about a file that was picked. */
  App.fileNote = function (file) {
    return (file.type || 'no type') + (file.name ? ' .' + String(file.name).split('.').pop().toLowerCase().slice(0, 5) : '') + ' ' + (file.size / 1048576).toFixed(1) + ' MB';
  };
  /* Frames for a whole take, computed in slices so the page stays responsive. */
  App.framesOf = function (take, opts, onProgress) {
    return new Promise(function (resolve) {
      var st = new PR.take.FrameStream(take.pcm, take.sr, Object.assign({ a4: S.settings.a4 }, opts || {}));
      (function loop() {
        var done = st.step(400);
        if (onProgress) onProgress(Math.min(1, st.n / st.total), 'reading');
        if (done) resolve(st.frames); else setTimeout(loop, 0);
      })();
    });
  };

  App.wake = {
    lock: null,
    on: function () { try { if (root.navigator.wakeLock) root.navigator.wakeLock.request('screen').then(function (l) { App.wake.lock = l; }).catch(function () {}); } catch (e) { /* optional */ } },
    off: function () { try { if (App.wake.lock) { App.wake.lock.release(); App.wake.lock = null; } } catch (e) { /* optional */ } }
  };
})(typeof window !== 'undefined' ? window : globalThis);

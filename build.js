'use strict';
/* Joins the sources into the one page that gets published. */
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
/* The library the page ships with: every song in seed/lib (checked first), plus the two charts of the first lesson. */
const { check } = require('./scripts/check_song.js');
const libDir = path.join(__dirname, 'seed', 'lib'), catalog = {};
const KEEP = ['title', 'artist', 'album', 'year', 'composer', 'genre', 'level', 'key', 'bpm', 'beatsPerBar', 'beatsPerSlot', 'capo', 'tuning', 'note', 'strum', 'needs', 'scale', 'shapes', 'sections', 'checked', 'melody', 'origin', 'source', 'createdAt', 'updatedAt'];
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'Source'; } };
fs.readdirSync(libDir).filter(f => /\.json$/.test(f)).sort().forEach(f => {
  const file = path.join(libDir, f), r = check(file);
  if (r.errs.length) throw new Error('library song ' + f + ': ' + r.errs.join('; '));
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  /* a song's date says when its chart last changed; a player's own edit made after that date wins over it */
  if (!raw.updatedAt) { raw.updatedAt = raw.createdAt = Date.now(); fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n'); }
  const song = {};
  KEEP.forEach(k => { if (raw[k] !== undefined && raw[k] !== null && !(Array.isArray(raw[k]) && !raw[k].length)) song[k] = raw[k]; });
  if (!song.source && raw.sources && raw.sources[0]) song.source = { label: host(raw.sources[0]), url: raw.sources[0] };
  song.origin = 'claude';
  catalog[raw.id] = song;
});
[['eyes-original', 'eyes.json'], ['eyes-capo4', 'eyes-capo4.json']].forEach(([id, f]) => { catalog[id] = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed', f), 'utf8')); });
const picFile = path.join(__dirname, 'seed', 'pictures.json'), pictures = fs.existsSync(picFile) ? JSON.parse(fs.readFileSync(picFile, 'utf8')) : {};
/* Lesson videos: found by search (seed/videos/BRIEF.md), one list per song id or skill. Only the id, the kind and the
   title are kept; the page plays them in YouTube's own player. */
const vidDir = path.join(__dirname, 'seed', 'videos'), videos = {};
if (fs.existsSync(vidDir)) fs.readdirSync(vidDir).filter(f => /\.json$/.test(f)).sort().forEach(f => {
  const raw = JSON.parse(fs.readFileSync(path.join(vidDir, f), 'utf8'));
  Object.keys(raw).forEach(key => {
    const seen = {}, list = [];
    (raw[key] || []).forEach(v => {
      if (!v || !/^[A-Za-z0-9_-]{11}$/.test(v.id || '') || seen[v.id]) throw new Error('videos ' + f + ', ' + key + ': bad or repeated id ' + JSON.stringify(v));
      if (['lesson', 'riff', 'intro', 'solo', 'melody', 'technique'].indexOf(v.kind) < 0) throw new Error('videos ' + f + ', ' + key + ': unknown kind ' + v.kind);
      seen[v.id] = 1; list.push({ id: v.id, kind: v.kind, title: String(v.title || '').replace(/\s+/g, ' ').trim().slice(0, 140) });
    });
    if (list.length) videos[key] = (videos[key] || []).concat(list).slice(0, 4);
  });
});
if (videos['eyes-original'] && !videos['eyes-capo4']) videos['eyes-capo4'] = videos['eyes-original'];
const G = '(typeof window !== "undefined" ? window : globalThis).PR';
const js = [src('music.js'), src('engine.js'), src('mp4audio.js'), G + '.catalog = ' + JSON.stringify(catalog) + ';\n' + G + '.pictures = ' + JSON.stringify(pictures) + ';\n' + G + '.videos = ' + JSON.stringify(videos) + ';']
  .concat(['app-core.js', 'app-ways.js', 'app-path.js', 'app-account.js', 'app-audio.js', 'stage.js', 'app-views.js', 'app-library.js', 'app-practice.js', 'app-boot.js'].map(src)).join('\n');
if (/<\/script/i.test(js)) throw new Error('script end tag inside the script');
const html = '<title>Tommie\'s Practice Room</title>\n' +
  '<style>\n' + src('style.css') + '</style>\n' + src('body.html') + '<script>\n' + js + '\n</script>\n';
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'practice-room.html'), html);
/* a full document for local browser tests. The test machine has no Apple system fonts, so a close stand-in is served locally. */
const face = w => '@font-face{font-family:"Inter";font-weight:' + w + ';font-style:normal;src:url(/fonts/node_modules/@fontsource/inter/files/inter-latin-' + w + '-normal.woff2) format("woff2")}';
fs.writeFileSync(path.join(__dirname, 'dist', 'local.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + html +
  '<style>' + [400, 500, 600, 700, 800].map(face).join('') + ':root{--f:"Inter",sans-serif!important;--f-round:"Inter",sans-serif!important}</style></body></html>');
/* the same page as a complete document, for hosting on an ordinary web address (there the browser can ask for the microphone) */
fs.writeFileSync(path.join(__dirname, 'dist', 'practice-room-standalone.html'), '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="Practice Room">\n<link rel="apple-touch-icon" href="assets/icon-180.png">\n<link rel="icon" href="assets/icon.svg" type="image/svg+xml">\n<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">\n<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + html + '</body>\n</html>\n');
/* GitHub Pages serves the file at the top of the repository */
fs.writeFileSync(path.join(__dirname, 'index.html'), fs.readFileSync(path.join(__dirname, 'dist', 'practice-room-standalone.html')));
/* the development kit that is published next to the page: sources, tests, seeds, notes */
const kit = {};
const add = f => { kit[f] = fs.readFileSync(path.join(__dirname, f), 'utf8'); };
['CLAUDE.md', 'build.js'].forEach(add);
if (fs.existsSync(picFile)) add('seed/pictures.json');
[['src', /\.(js|css|html)$/], ['test', /^(t\d|b\d|lib|mkwav|serve).*\.js$/], ['seed', /\.json$/], ['seed/lib', /\.(json|md)$/], ['seed/videos', /\.(json|md)$/], ['scripts', /\.(sh|js)$/]].forEach(([dir, re]) => fs.readdirSync(path.join(__dirname, dir)).filter(f => re.test(f)).sort().forEach(f => add(dir + '/' + f)));
fs.writeFileSync(path.join(__dirname, 'dist', 'kit.json'), JSON.stringify(kit));
console.log('built', (html.length / 1024).toFixed(1) + ' KB with ' + Object.keys(catalog).length + ' library songs and ' + Object.keys(videos).reduce((n, k) => n + videos[k].length, 0) + ' videos; kit', Object.keys(kit).length, 'files,', (JSON.stringify(kit).length / 1024).toFixed(0) + ' KB');

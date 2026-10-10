'use strict';
/* Joins the sources into the one page that gets published. */
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
/* The songs the page starts with where it has no database to read (the same ones that were written to the database). */
const starters = {};
[['eyes-original', 'eyes.json'], ['eyes-capo4', 'eyes-capo4.json']].forEach(([id, f]) => { starters[id] = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed', f), 'utf8')); });
const js = [src('music.js'), src('engine.js'), src('mp4audio.js'), '(typeof window !== "undefined" ? window : globalThis).PR.starters = ' + JSON.stringify(starters) + ';']
  .concat(['app-core.js', 'app-audio.js', 'stage.js', 'app-views.js', 'app-practice.js', 'app-boot.js'].map(src)).join('\n');
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
[['src', /\.(js|css|html)$/], ['test', /^(t\d|b\d|lib|mkwav|serve).*\.js$/], ['seed', /\.json$/], ['scripts', /\.sh$/]].forEach(([dir, re]) => fs.readdirSync(path.join(__dirname, dir)).filter(f => re.test(f)).sort().forEach(f => add(dir + '/' + f)));
fs.writeFileSync(path.join(__dirname, 'dist', 'kit.json'), JSON.stringify(kit));
console.log('built', (html.length / 1024).toFixed(1) + ' KB; kit', Object.keys(kit).length, 'files,', (JSON.stringify(kit).length / 1024).toFixed(0) + ' KB');

'use strict';
/* Joins the sources into the one page that gets published. */
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
/* The songs the page starts with where it has no database to read (the same ones that were written to the database). */
const starters = {};
[['eyes-original', 'eyes.json'], ['eyes-capo4', 'eyes-capo4.json']].forEach(([id, f]) => { starters[id] = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed', f), 'utf8')); });
const js = [src('music.js'), src('engine.js'), src('mp4audio.js'), '(typeof window !== "undefined" ? window : globalThis).PR.starters = ' + JSON.stringify(starters) + ';']
  .concat(['app-core.js', 'app-audio.js', 'app-views.js', 'app-practice.js', 'app-boot.js'].map(src)).join('\n');
if (/<\/script/i.test(js)) throw new Error('script end tag inside the script');
const html = '<title>Tommie\'s Practice Room</title>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">\n' +
  '<style>\n' + src('style.css') + '</style>\n' + src('body.html') + '<script>\n' + js + '\n</script>\n';
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'practice-room.html'), html);
/* a full document for local browser tests, with the same fonts served locally (the test machine cannot reach Google Fonts) */
const face = (fam, pkg, w) => '@font-face{font-family:"' + fam + '";font-weight:' + w + ';font-style:normal;src:url(/fonts/node_modules/@fontsource/' + pkg + '/files/' + pkg + '-latin-' + w + '-normal.woff2) format("woff2")}';
const faces = [['Barlow', 'barlow', 400], ['Barlow', 'barlow', 500], ['Barlow', 'barlow', 600], ['Barlow Condensed', 'barlow-condensed', 500], ['Barlow Condensed', 'barlow-condensed', 600], ['Barlow Condensed', 'barlow-condensed', 700], ['JetBrains Mono', 'jetbrains-mono', 400], ['JetBrains Mono', 'jetbrains-mono', 600]].map(f => face(f[0], f[1], f[2])).join('');
fs.writeFileSync(path.join(__dirname, 'dist', 'local.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}' + faces + '</style></head><body>' + html.replace(/<link rel="stylesheet"[^>]*>\n/, '') + '</body></html>');
/* the same page as a complete document, for hosting on an ordinary web address (there the browser can ask for the microphone) */
fs.writeFileSync(path.join(__dirname, 'dist', 'practice-room-standalone.html'), '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + html + '</body>\n</html>\n');
/* GitHub Pages serves the file at the top of the repository */
fs.writeFileSync(path.join(__dirname, 'index.html'), fs.readFileSync(path.join(__dirname, 'dist', 'practice-room-standalone.html')));
/* the development kit that is published next to the page: sources, tests, seeds, notes */
const kit = {};
const add = f => { kit[f] = fs.readFileSync(path.join(__dirname, f), 'utf8'); };
['CLAUDE.md', 'build.js'].forEach(add);
[['src', /\.(js|css|html)$/], ['test', /^(t\d|b\d|lib|mkwav|serve).*\.js$/], ['seed', /\.json$/], ['scripts', /\.sh$/]].forEach(([dir, re]) => fs.readdirSync(path.join(__dirname, dir)).filter(f => re.test(f)).sort().forEach(f => add(dir + '/' + f)));
fs.writeFileSync(path.join(__dirname, 'dist', 'kit.json'), JSON.stringify(kit));
console.log('built', (html.length / 1024).toFixed(1) + ' KB; kit', Object.keys(kit).length, 'files,', (JSON.stringify(kit).length / 1024).toFixed(0) + ' KB');

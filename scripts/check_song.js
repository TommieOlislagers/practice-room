'use strict';
/* Checks library songs (seed/lib/*.json) before they are built into the page.
   usage: node scripts/check_song.js [file ...]      (no files: every song in seed/lib)
   Exits 1 when a song has an error. Warnings are for a person to read. */
const fs = require('fs'), path = require('path');
const PR = require(path.join(__dirname, '..', 'src', 'music.js')), M = PR.music;
const GENRES = ['Roots rock', 'Classic rock', 'Soft rock', 'Hard rock', 'Blues', 'Folk rock', 'New wave', 'Game music'];
const NEEDS = ['strum-quarters', 'strum-eighths', 'strum-pattern', 'strum-sixteenths', 'offbeat', 'shuffle', 'twelve-eight', 'waltz', 'quick-changes', 'palm-mute', 'power-chords',
  'barre-e', 'barre-em', 'barre-a', 'barre-am', 'sevenths', 'sus-moves', 'bass-walk', 'arpeggio', 'travis', 'hammer-pull', 'bends', 'slides', 'double-stops', 'alt-picking'];
const SCALES = ['major', 'minor', 'penta-major', 'penta-minor', 'blues', 'dorian', 'mixolydian'];
const KEYS = ['id', 'title', 'artist', 'album', 'year', 'composer', 'genre', 'level', 'key', 'bpm', 'beatsPerBar', 'beatsPerSlot', 'capo', 'tuning', 'lengthSec', 'note', 'strum', 'needs', 'scale', 'shapes', 'sections', 'sources', 'checked', 'confidence', 'remarks', 'melody', 'origin', 'levelAuto', 'source', 'createdAt', 'updatedAt'];
module.exports = { GENRES, NEEDS, SCALES };
function check(file) {
  const errs = [], warns = [], name = path.basename(file, '.json');
  let s;
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { name, errs: ['not valid JSON: ' + e.message], warns, info: '' }; }
  const need = (c, m) => { if (!c) errs.push(m); };
  Object.keys(s).forEach(k => { if (KEYS.indexOf(k) < 0) errs.push('unknown field "' + k + '"'); });
  need(s.id === name && /^[a-z0-9-]{3,60}$/.test(name), 'id must equal the file name and use only a-z, 0-9 and dashes');
  need(typeof s.title === 'string' && s.title.length > 0 && s.title.length <= 80, 'title missing or too long');
  need(typeof s.artist === 'string' && s.artist.length > 0 && s.artist.length <= 60, 'artist missing');
  need(GENRES.indexOf(s.genre) >= 0, 'genre must be one of: ' + GENRES.join(', '));
  need(Number.isInteger(s.level) && s.level >= 1 && s.level <= 5, 'level must be 1 to 5');
  need(typeof s.bpm === 'number' && s.bpm >= 30 && s.bpm <= 260, 'bpm must be a number from 30 to 260');
  need(s.beatsPerBar === undefined || [2, 3, 4, 6].indexOf(s.beatsPerBar) >= 0, 'beatsPerBar must be 2, 3, 4 or 6');
  need(s.beatsPerSlot === undefined || (typeof s.beatsPerSlot === 'number' && s.beatsPerSlot >= 1 && s.beatsPerSlot <= 8), 'beatsPerSlot must be 1 to 8');
  need(s.capo === undefined || (Number.isInteger(s.capo) && s.capo >= 0 && s.capo <= 9), 'capo must be 0 to 9');
  need(s.tuning === undefined || !!M.TUNINGS[s.tuning], 'tuning must be one of ' + Object.keys(M.TUNINGS).join(', '));
  need(typeof s.key === 'string' && !!M.parseChord(s.key), 'key must be written as a chord name, like "D" or "F#m"');
  need(s.note === undefined || (typeof s.note === 'string' && s.note.length <= 320 && !/\n/.test(s.note)), 'note must be one paragraph of at most 320 characters');
  need(s.strum === undefined || (typeof s.strum === 'string' && s.strum.length <= 40), 'strum must be a short pattern such as "D DU UDU"');
  need(Array.isArray(s.needs) && s.needs.every(n => NEEDS.indexOf(n) >= 0), 'needs must be a list taken from: ' + NEEDS.join(', '));
  need(s.scale === undefined || s.scale === null || (s.scale && SCALES.indexOf(s.scale.type) >= 0 && /^[A-G][#b]?$/.test(s.scale.root || '')), 'scale must be null or {"root": "A", "type": one of ' + SCALES.join(', ') + '}');
  need(Array.isArray(s.sources) && s.sources.every(u => /^https?:\/\//.test(u)), 'sources must be a list of web addresses');
  need(typeof s.checked === 'boolean', 'checked must be true or false');
  if (s.checked && (s.sources || []).length < 2) errs.push('checked is true but fewer than two sources are listed');
  /* nothing in a library song may be the words or the tune of the song */
  Object.keys(s).forEach(k => { if (typeof s[k] === 'string' && s[k].length > 320) errs.push('field "' + k + '" is too long for what it is'); });
  need(Array.isArray(s.sections) && s.sections.length > 0 && s.sections.length <= 40, 'sections missing');
  const shapes = {};
  (s.shapes || []).forEach(x => {
    if (!x || !M.parseChord(x.n) || !M.parseShape(x.s)) { errs.push('bad shape entry ' + JSON.stringify(x)); return; }
    shapes[x.n] = x.s;
    const ch = M.parseChord(x.n), fr = M.parseShape(x.s), pcs = M.shapeMidi(fr, s.tuning || 'standard', 0).map(m => m % 12);
    const stray = pcs.filter(p => ch.pcs.indexOf(p) < 0 && p !== ch.bass);
    if (stray.length) warns.push('shape ' + x.n + ' ' + x.s + ' has notes outside the chord: ' + stray.map(p => M.pcName(p)).join(' '));
    if (pcs.indexOf(ch.root) < 0 && ch.bass === null) warns.push('shape ' + x.n + ' ' + x.s + ' does not contain its root');
  });
  let bars = 0;
  (Array.isArray(s.sections) ? s.sections : []).forEach((sec, i) => {
    const where = 'section ' + (i + 1) + ' (' + (sec && sec.name) + ')';
    if (!sec || sec.type !== 'chords') { errs.push(where + ': library songs hold chord sections only (type "chords")'); return; }
    if (typeof sec.name !== 'string' || !sec.name || sec.name.length > 28) errs.push(where + ': name missing or longer than 28 characters');
    if (Object.keys(sec).some(k => ['name', 'type', 'bars', 'repeat'].indexOf(k) < 0)) errs.push(where + ': only name, type, bars and repeat are allowed');
    if (sec.repeat !== undefined && !(Number.isInteger(sec.repeat) && sec.repeat >= 1 && sec.repeat <= 16)) errs.push(where + ': repeat must be 1 to 16');
    if (!Array.isArray(sec.bars) || !sec.bars.length || sec.bars.length > 64) { errs.push(where + ': bars missing (or more than 64)'); return; }
    sec.bars.forEach((bar, bi) => {
      const toks = M.splitBar(bar);
      if (typeof bar !== 'string' || !toks.length || toks.length > 4) { errs.push(where + ', bar ' + (bi + 1) + ': one to four chords per bar, got ' + JSON.stringify(bar)); return; }
      toks.forEach(t => {
        if (/^(N\.C\.|-)$/.test(t)) return;
        const ch = M.parseChord(t);
        if (!ch) { errs.push(where + ', bar ' + (bi + 1) + ': "' + t + '" is not a chord name'); return; }
        if (!M.shapeFor(ch, shapes)) errs.push('no fingering known for ' + t + ': add it to "shapes"');
      });
      bars += (sec.repeat || 1);
    });
  });
  let info = '';
  if (!errs.length) {
    const model = M.buildSong(Object.assign({}, s, { shapes }));
    const secs = model.totalBeats / s.bpm * 60, lv = M.suggestLevel(model);
    info = bars + ' bars, ' + model.chords.length + ' chords (' + model.chords.map(c => c.name + ' ' + (c.shape ? M.shapeToString(c.shape) : '?')).join(', ') + '), plays ' + Math.floor(secs / 60) + ':' + ('0' + Math.round(secs % 60)).slice(-2) + ' at ' + s.bpm + ' BPM, level ' + s.level + ' (the page would suggest ' + lv.level + ')';
    if (typeof s.lengthSec === 'number' && s.lengthSec > 0) {
      const off = secs / s.lengthSec;
      if (off < 0.75 || off > 1.25) warns.push('the chart plays ' + Math.round(secs) + ' s but lengthSec says ' + s.lengthSec + ' s: check bpm, repeats, beatsPerBar and beatsPerSlot');
    } else if (s.genre !== 'Game music') warns.push('lengthSec is missing, so the structure could not be checked against the recording');
    if (Math.abs(lv.level - s.level) >= 2) warns.push('level ' + s.level + ' is far from what the chords suggest (' + lv.level + ': ' + lv.reasons.join(', ') + ')');
  }
  return { name, errs, warns, info };
}
if (require.main === module) {
  const dir = path.join(__dirname, '..', 'seed', 'lib');
  const files = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => /\.json$/.test(f)).sort().map(f => path.join(dir, f));
  let bad = 0;
  files.forEach(f => {
    const r = check(f);
    console.log((r.errs.length ? 'ERROR ' : r.warns.length ? 'warn  ' : 'ok    ') + r.name + (r.info ? '  ' + r.info : ''));
    r.errs.forEach(e => console.log('        error: ' + e));
    r.warns.forEach(w => console.log('        warning: ' + w));
    if (r.errs.length) bad++;
  });
  console.log(files.length + ' checked, ' + bad + ' with errors');
  process.exit(bad ? 1 : 0);
}
module.exports.check = check;

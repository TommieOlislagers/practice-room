'use strict';
const path = require('path');
const PR = require(path.join(__dirname, '..', 'src', 'music.js'));
const M = PR.music;
let failures = 0;
function check(name, cond, detail) { console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  -> ' + detail : '')); if (!cond) failures++; }
function summary(p) { return p.sections.map(s => s.name + '[' + (s.type === 'tab' ? s.systems.length + ' sys' : s.bars.join(' ')) + ']').join(' / '); }

/* 1. chords over words, section headers in brackets, capo line (words are placeholders, not a real song) */
const sheet1 = `Song Title - Some Artist
Capo: 2nd fret
Tuning: E A D G B E

[Intro]
G  D  Em  C   x2

[Verse 1]
G              D
Words go under these chords
Em                 C
A second line of placeholder words
G        D/F#        Em   C
Am I a chord line or a lyric, who can say

[Chorus]
C       G        Am      F
la la la la la la la
C       G        F
la la la

[Outro]
G  D  Em  C
G`;
let p = M.parseSheet(sheet1);
check('sheet: capo read', p.meta.capo === 2, 'capo ' + p.meta.capo);
check('sheet: four sections with the right chords', p.sections.length === 4 && p.sections[0].bars.join(' ') === 'G D Em C G D Em C' && p.sections[1].bars.join(' ') === 'G D Em C G D/F# Em C' && p.sections[2].bars.join(' ') === 'C G Am F C G F' && p.sections[3].bars.join(' ') === 'G D Em C G', summary(p));
check('sheet: lyric lines starting with A or Am are not chords', p.sections[1].bars.indexOf('Am') < 0 && p.sections[1].bars.indexOf('A') < 0);

/* 2. bar lines, repeats, N.C., percent sign, inline header */
const sheet2 = `Intro: | Am | G | F | E7 |
Verse:
| Am  | G   | F   | E7  |  x2
| Dm G | C Am | Dm E7 | Am % |
Bridge
N.C.   F   G   Am`;
p = M.parseSheet(sheet2);
check('bars: bar lines keep two chords together, x2 repeats, % repeats the chord', p.sections.length === 3 && p.sections[0].bars.join(',') === 'Am,G,F,E7' && p.sections[1].bars.join(',') === 'Am,G,F,E7,Am,G,F,E7,Dm G,C Am,Dm E7,Am Am' && p.sections[2].bars.join(',') === 'F,G,Am', summary(p));

/* 3. ChordPro */
const sheet3 = `{title: Test Tune}
{artist: Nobody}
{capo: 3}
{tempo: 96}
{start_of_verse}
[C]placeholder [G]words [Am]go [F]here
[C]more [G]place[F]holder
{end_of_verse}
{soc}
[F]la [G]la [C]la
{eoc}`;
p = M.parseSheet(sheet3);
check('ChordPro: title, capo, tempo and two sections', p.meta.title === 'Test Tune' && p.meta.capo === 3 && p.meta.bpm === 96 && p.sections.length === 2 && p.sections[0].bars.join(' ') === 'C G Am F C G F' && p.sections[1].name === 'Chorus' && p.sections[1].bars.join(' ') === 'F G C', JSON.stringify(p.meta) + ' ' + summary(p));

/* 4. ASCII tab: two systems, techniques, two-digit frets, a stack, harmonics */
const tab1 = `[Riff]
e|-----------------|--------------------|
B|-----------------|--------------------|
G|-----------------|--------------------|
D|-----------------|---------2--2-------|
A|-----2h4--4p2----|-0--3/5--2--2--<12>-|
E|-0-3---------3-0-|---------0--0-------|

e|--12-10----------|
B|--------13b15r13-|
G|-----------------|
D|-----------------|
A|-----------------|
E|-----------------|  x2
`;
p = M.parseSheet(tab1);
let m = M.buildSong({ sections: p.sections });
const lab = m.targets.map(t => t.label).join(',');
check('tab: one section, two systems', p.sections.length === 1 && p.sections[0].type === 'tab' && p.sections[0].systems.length === 2, summary(p));
check('tab: notes in order with hammer, pull, slide, stack, harmonic, two-digit frets and a bend', lab === 'E2,G2,B2,C#3,C#3,B2,G2,E2,A2,C3,D3,E2 B2 E3,E2 B2 E3,A3,E5,D5,C5', lab);
check('tab: "x2" after the last bar line is not read as a fret', m.targets.length === 17, m.targets.length + ' targets');
check('tab: bend target and release are not extra notes', m.targets.filter(t => t.label === 'D5' || t.label === 'C5').length === 2);
check('tab: techniques counted', m.feats.tech.h === 1 && m.feats.tech.p === 1 && m.feats.tech.b === 1 && m.feats.tech.slide === 1 && m.feats.tech.harm === 1, JSON.stringify(m.feats.tech));
check('tab: highlight spans point at the digits', m.view[0].systems[0].spans.every(sp => /^\d+$/.test(m.view[0].systems[0].lines[sp.line].substr(sp.col, sp.len))), m.view[0].systems[0].spans.length + ' spans');

/* 5. drop D from labels, unlabeled tab, bass tab skipped */
const tab2 = `e|------|
B|------|
G|------|
D|-0-5--|
A|-0-5--|
D|-0-5--|

--------
--------
--0-2-4-
--------
--------
-3------

G|-----|
D|-----|
A|--3--|
E|-1---|`;
p = M.parseSheet(tab2);
m = M.buildSong({ sections: p.sections });
check('tab: drop D read from the string labels', m.targets[0].label === 'D2 A2 D3' && m.targets[1].label === 'G2 D3 G3', m.targets.slice(0, 2).map(t => t.label).join(' | '));
check('tab: unlabeled six-line tab read in standard tuning', m.targets.slice(2).map(t => t.label).join(',') === 'G2,G3,A3,B3', m.targets.slice(2).map(t => t.label).join(','));
check('tab: four-line bass tab skipped with a note', p.warnings.length === 1 && /bass/.test(p.warnings[0]), p.warnings.join(';'));

/* 6. the lesson song, as stored */
const eyes = {
  title: 'Eyes Without a Face', bpm: 85, capo: 0,
  shapes: { Emaj7: 'x79897', 'C#m': 'x46654', 'G#m': '466444', B: '799877' },
  sections: [
    { name: 'Verse', type: 'chords', bars: ['Emaj7', 'C#m', 'G#m', 'B'], repeat: 3 },
    { name: 'Chorus', type: 'chords', bars: ['A', 'B', 'A', 'B', 'A', 'B', 'F#m', 'G#m'] }
  ]
};
m = M.buildSong(eyes);
let lv = M.suggestLevel(m);
check('song: 20 chord targets, timed, 80 beats', m.targets.length === 20 && m.timed && m.totalBeats === 80, m.targets.length + ' targets, ' + m.totalBeats + ' beats');
check('song: sounding notes of Emaj7 at fret 7', m.targets[0].midis.join(',') === '52,59,63,68,71' && m.targets[0].root === 4 && m.targets[0].third === 4, m.targets[0].midis.join(','));
check('song: suggested level 3 (barre chords up the neck)', lv.level === 3, 'level ' + lv.level + ': ' + lv.reasons.join('; '));
const easy = M.buildSong({ capo: 4, bpm: 85, sections: [{ name: 'Verse', type: 'chords', bars: ['C', 'Am', 'Em', 'G'] }, { name: 'Chorus', type: 'chords', bars: ['F', 'G', 'F', 'G', 'Dm', 'Em'] }] });
lv = M.suggestLevel(easy);
check('song: capo 4 version sounds the same chords (C shape at capo 4 = E)', easy.targets[0].root === 4 && easy.targets[0].midis[0] === 52, 'root ' + easy.targets[0].root + ' low note ' + easy.targets[0].midis[0]);
check('song: capo 4 version suggested level 2 (one barre chord)', lv.level === 2, 'level ' + lv.level + ': ' + lv.reasons.join('; '));
lv = M.suggestLevel(M.buildSong({ sections: [{ type: 'chords', bars: ['G', 'D', 'Em', 'C'] }] }));
check('song: four open chords suggested level 1', lv.level === 1, 'level ' + lv.level + ': ' + lv.reasons.join('; '));
lv = M.suggestLevel(M.buildSong({ sections: [{ type: 'chords', bars: ['Dm9', 'G13', 'Cmaj9', 'A7#9', 'Fmaj7', 'Bm7b5', 'E7b9'] }] }));
check('song: jazz changes suggested level 4 or 5', lv.level >= 4, 'level ' + lv.level + ': ' + lv.reasons.join('; '));

/* 7. timed drill */
m = M.buildSong({ bpm: 60, sections: [{ name: 'Walk', type: 'notes', step: 1, steps: '6:1 6:2 6:3 6:4 | 5:1 5:2 5:3 5:4 | 4:10 4:12*2 3:0+2:0' }] });
check('drill: timed notes with beats, stack and two-digit fret', m.timed && m.targets.length === 11 && m.targets[8].label === 'C4' && m.targets[9].beats === 2 && m.targets[10].kind === 'chord' && m.totalBeats === 12, m.targets.map(t => t.label + '/' + t.beats).join(' '));
check('drill: generated tab lines line up', m.view[0].systems[0].lines.every(l => l.length === m.view[0].systems[0].lines[0].length) && m.view[0].systems[0].spans.every(sp => /^\d+$/.test(m.view[0].systems[0].lines[sp.line].substr(sp.col, sp.len))), '\n' + m.view[0].systems[0].lines.join('\n'));
console.log(failures ? '\nPARSER: ' + failures + ' CHECK(S) FAILED' : '\nPARSER: ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

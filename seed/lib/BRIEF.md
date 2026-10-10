# Brief for researching library songs

You are preparing chord charts for a personal guitar practice app. Work in the repository at `/home/claude/practice-room`.

1. Read `seed/lib/FORMAT.md` completely. It defines the JSON file for each song and every field. Follow it exactly.
   Look at one finished example, `seed/lib/ccr-lodi.json`.
2. For each song you were given, research on the web (WebSearch, WebFetch): the structure in order (intro, verses,
   choruses, solo, outro), the chords in each bar, the key, the tempo in BPM, the time signature, the length of the
   recording, the tuning, and whether guitarists commonly use a capo.
   - Use at least two independent sources for the chords (chord and tab sites, lesson sites, lead sheets, Hooktheory
     TheoryTab pages). Wikipedia and tempo sites are good for key, BPM and length.
   - Some sites refuse to be fetched. Do not try to get around that; use other sources.
   - If only one usable source for the chords can be reached, write the chart from it plus what is common knowledge
     about the song, set `"checked": false` and say so in `"remarks"`. Do not invent chords you cannot support.
3. Count bars carefully: one entry in `bars` per bar. Sources usually show chords over words without bar lines, so work
   out how long each chord lasts from the tempo, the time signature and the length of the recording. The checker compares
   the chart's playing time with `lengthSec`; get them within about 15%. Long solos, intros and fades: give the backing
   chords with a sensible number of repeats; if you leave a long ambient intro or a fade out of the chart, set `lengthSec`
   to the part you charted and say so in `remarks`.
4. STRICT RULES
   - Chords only. Never write any lyrics or any words of the song anywhere in the file: not in notes, not in remarks,
     not in section names.
   - Never write out a melody, riff, lick, solo or bass line note by note: no tab, no note lists, no note names in order.
     Where a song is built on a riff, chart the chords or power chords under it and say in `note` that the riff is left out.
   - `note` is a playing tip in your own words.
5. Rate `level` for a learner playing the rhythm part (the chord backing), not the lead guitar.
6. Write each file to `seed/lib/<id>.json`, then run `node scripts/check_song.js seed/lib/<id>.json` from the repository
   root. Fix every error. Read the warnings and fix what they point to (a duration warning usually means wrong bar
   counts, repeats or bpm; a "no fingering known" error means adding the chord to `shapes`).
7. Do not create or change any other file. Do not commit.

When done, reply with a short table in plain text: for each song the id, key, checked true/false, confidence, the sources
used, and anything a reviewer should know (disagreements between sources, guesses about bar counts). No other commentary.

## Extra rules for game music (The Legend of Zelda)

- `"artist": "The Legend of Zelda"`, `"genre": "Game music"`, `"melody": true`, `"album"`: the game's name, `"year"`: the
  game's year, `"composer"`: the composer of that piece (look it up).
- Produce the CHORD BACKING for the tune, as a guitarist would strum or pick it under the melody: the harmony bar by bar for
  one full pass of the tune (the looping section), with section names such as Intro, A, B, Theme, Bridge.
- `lengthSec`: the length of one pass as you charted it (bars x beats / bpm x 60). `bpm` and `beatsPerBar` from the
  original; mind three-four and six-eight time (see `bpm` in FORMAT.md).
- `scale`: the scale the tune is made of (root and type). The learner practises it before adding the melody.
- Choose guitar-friendly chord names in the original key where the key is friendly; if the original key is awkward on
  guitar, use a capo (set `capo`) so the shapes are easy and the sound stays in the original key.
- Fan arrangements differ; follow the harmony closest to the original game track and note differences in `remarks`.
- Never the melody, in any form (no tab, no note names, no ocarina button sequences).

# Library songs: one JSON file per song

File name = `<id>.json`, id in lower case with dashes, e.g. `ccr-bad-moon-rising.json`.
Check a file with `node scripts/check_song.js seed/lib/<id>.json` (from the repository root). It must print no errors.

**Chords only.** A library song holds the chord chart: section names and the chords in each bar.
Never any words of the song, and never the tune, a riff, a solo or a bass line written out note by note.

```json
{
  "id": "ccr-bad-moon-rising",
  "title": "Bad Moon Rising",
  "artist": "Creedence Clearwater Revival",
  "album": "Green River",
  "year": 1969,
  "genre": "Roots rock",
  "level": 1,
  "key": "D",
  "bpm": 179,
  "beatsPerBar": 4,
  "beatsPerSlot": 4,
  "capo": 0,
  "tuning": "standard",
  "lengthSec": 141,
  "note": "One practical playing tip in your own words, at most 320 characters.",
  "strum": "D DU UDU",
  "needs": ["strum-eighths", "quick-changes"],
  "scale": { "root": "D", "type": "penta-major" },
  "shapes": [{ "n": "Bb", "s": "x13331" }],
  "sections": [
    { "name": "Intro", "type": "chords", "bars": ["D", "A G", "D", "D"] },
    { "name": "Verse 1", "type": "chords", "bars": ["D", "A G", "D", "D"], "repeat": 2 }
  ],
  "sources": ["https://...", "https://..."],
  "checked": true,
  "confidence": "high",
  "remarks": "Where the sources differed and which one was followed."
}
```

## Fields

- `genre`: one of Roots rock, Classic rock, Soft rock, Hard rock, Blues, Folk rock, New wave, Game music.
- `level`: 1 a few open chords, slow changes · 2 more shapes, quicker changes, a first barre such as F or Bm ·
  3 several barre chords, shapes up the neck · 4 fast changes, rich chords, hard rhythm · 5 advanced.
  Rate the chord part a learner strums, not the lead guitar on the record.
- `key`: the sounding key as a chord name (`"D"`, `"F#m"`).
- `bpm`: the beat a listener taps. In 6/8 or 12/8 give the dotted-quarter pulse and treat each pulse as one beat
  (a 12/8 slow blues is `beatsPerBar: 4`; a 6/8 tune is `beatsPerBar: 2`).
- `beatsPerBar`: 2, 3, 4 or 6. `beatsPerSlot`: how many beats one entry of `bars` lasts; normally the same as `beatsPerBar`.
- `capo`: set it only when guitarists commonly play the song with a capo. Chord names are then the shapes played, relative to the capo.
- `lengthSec`: length of the original recording in seconds (for game music: of one pass of the tune as charted). The checker
  compares it with how long the chart plays, so a wrong tempo or a missing repeat shows up.
- `sections`: in song order. `bars` has one entry per bar; two chords in a bar are written `"A G"` (up to four, evenly spaced);
  `"N.C."` or `"-"` is a bar or part of a bar with no chord. `repeat` plays the bars that many times in a row.
  Name sections Intro, Verse 1, Chorus, Bridge, Solo, Outro and so on (at most 28 characters). Under a solo, give the backing chords.
  A fade-out is written as a few repeats, not dozens.
- `shapes`: only for chords that should not be played as the standard shape; six frets from the low E string to the high E
  string, `x` for a string that is not played, dashes between frets when any fret is above 9 (`"x-10-12-12-11-10"`).
  The checker says when a chord has no known fingering; then add one here.
- `strum`: a suggested strumming pattern for one bar, D for down and U for up, spaces for missed strokes.
- `needs`: techniques the rhythm part of this song asks for, in the order to learn them, taken from:
  strum-quarters, strum-eighths, strum-pattern (a mixed down-up pattern), strum-sixteenths, offbeat (upstrokes off the beat),
  shuffle (swung boogie feel), twelve-eight (three strums to the beat), waltz (three-four time), quick-changes (two chords in a bar),
  palm-mute, power-chords, barre-e, barre-em, barre-a, barre-am (the four movable barre shapes), sevenths, sus-moves
  (sus2 and sus4 embellishments), bass-walk (slash chords, walking bass between chords), arpeggio (picking a chord one string
  at a time), travis (alternating-thumb fingerpicking), hammer-pull, bends, slides, double-stops, alt-picking.
  Barre shapes, sevenths, power chords and quick changes are also worked out from the chart, so the list matters most for
  feel (strumming, shuffle, twelve-eight, arpeggio, palm-mute) and for lead techniques the song is known for.
- `scale`: the scale a player would use for the fills, the solo or the tune: `{"root": "A", "type": ...}` with type one of
  major, minor, penta-major, penta-minor, blues, dorian, mixolydian. `null` if none is worth learning for this song.
- `sources`: the pages the chart was taken from and checked against. `checked` is true only when two independent sources
  agree on the chords (small differences in voicings or passing chords are fine; note them in `remarks`).
- `confidence`: high, medium or low. `composer`: for game music.
- `melody`: for game music only, true: the piece is known for its tune, and this chart is the chord backing to it.

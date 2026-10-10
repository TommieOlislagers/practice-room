# Practice Room: notes for Claude

A personal guitar practice app for Tommie, who is learning guitar and uses an iPhone. No lyrics in songs, ever.

It is deployed in two places:

- **GitHub Pages** (this repository, `index.html` on `main`): https://tommieolislagers.github.io/practice-room/
  The browser can ask for the microphone here, so live listening works. Data lives in the browser's storage.
- **Inside Claude** as a published page with a database: https://claude.ai/artifact/AgBk9i1Ly1fBLJijN5DVQ3
  No microphone there (the viewer's frame is not given it); recorded takes only.

Run `node build.js` and commit `index.html` together with any change in `src/`. Run the tests before pushing.

Ideas not built yet for the Pages copy: a `library.json` in the repository that the page fetches, so songs
can be added by a commit; a "copy my progress" export for coaching; home-screen app metadata.

## Build and publish

- `node build.js` writes `dist/practice-room.html` (the page that is published), `dist/local.html`
  (same page as a full document with local fonts, for the browser tests),
  `dist/practice-room-standalone.html` (a full document for hosting outside Claude) and `dist/kit.json`.
- To update the copy inside Claude, publish with the Artifact tool: `file_path` = `dist/practice-room.html`, **always pass `url`** of the
  existing page, and `files: {"dev/kit.json": "dist/kit.json"}` with `root` set to this folder. Without
  `url` a second, empty copy is published. Leave `capabilities` out so `db`, `user`, `sample` carry over.
- Read the page first (`action: read`, the url) in a new conversation, or the publish is refused.

## Source layout (`src/`, joined in this order by build.js)

| File | What it holds |
|---|---|
| `music.js` | notes, chord symbols, shapes, tab and chord-sheet parsers, song model, difficulty levels |
| `engine.js` | pitch (YIN), chroma and chord templates, note-onset logic, the live trackers, take scoring |
| `mp4audio.js` | reads the AAC sound track out of MP4, M4A, MOV files; wraps it as M4A or ADTS |
| (generated) | `PR.starters`: the songs in `seed/`, used only where the page has no database |
| `app-core.js` | state, technical log, storage (database, browser cache, offline queue), statistics |
| `app-audio.js` | microphone, tones, metronome, reading recordings |
| `app-views.js` | Today, Songs, add and edit sheets, Settings, Tuner |
| `app-practice.js` | song page, live runs, take scoring flow, one-minute changes |
| `app-boot.js` | routing, rendering, every tap |

## Data (the page's artifact database)

- `songs/{id}`: `{title, artist, level 1-5, levelAuto, bpm, capo, tuning, beatsPerSlot, key, note,
  origin 'claude'|'paste'|'draft', checked, source:{label,url}, shapes:[{n,s}], sections:[...], createdAt, updatedAt}`.
  Section types: `{name, type:'chords', bars:['Emaj7','A B'], repeat}`, `{name, type:'tab', systems:[{lines:[6 strings, high e first]}]}`,
  `{name, type:'notes', step, steps:'6:0 6:3 | 5:0*2'}`. Never put lyrics in a song.
- `sessions/{id}`: `{at, song, title, kind 'wait'|'tempo'|'take'|'self'|'omc', secs, pct, bpm, section, level,
  acc, hits, total, changes:[{f,t,s}], cents, self, pair, count, counted}`.
- `meta/settings`: `{a4, tuning, tones, countIn, click, trim}`.
- `diag/{device}`: `{at, ua, lang, view, framed, log:[{t,k,d}]}`, the technical log, one document per
  phone-and-browser. Read it first when Tommie says something does not work.

To load a song from a chat: research the chart, check it against a second source, validate it with
`M.buildSong` (see how `seed/` was checked), write it with ArtifactData `set` to `songs/{id}`.

## Tests

Node (`node test/tN_*.js`): t1 pitch, t2 chords, t3 tracking, t4 false positives, t5 parsers, t6 sound-track reader.
Browser (`node test/bN_*.js`, Playwright with the preinstalled Chromium): b1 smoke and screenshots, b2 live
listening with a fake microphone, b3 database, b4 marks, b5 locked-down frame, b6 asking for the microphone,
b7 recordings, b8 offline queue, b9 the iPhone case.

Test material is not in the kit: `scripts/get_samples.sh` (sampled guitar notes), `node test/mkwav.js`
(test performances), `scripts/make_media.sh` (phone-style videos, needs ffmpeg), and
`cd fonts && npm i @fontsource/barlow @fontsource/barlow-condensed @fontsource/jetbrains-mono`.
The test browser has no AAC decoder: b7 swaps in a stand-in that checks the bytes handed over.

## What is known about Tommie's devices (10 Oct 2026)

- iPhone, three surfaces tried: the Claude app, Chrome, Safari. In all three the page runs in a frame,
  `navigator.permissions` says `denied` before anyone was asked, and `getUserMedia` is refused in 0 to 3 ms
  with NotAllowedError. The viewer's own permission interface answers `unavailable` for `microphone`, and
  publishing with a `microphone` capability is refused (contract 0.2.75 has none).
  So: no live listening inside Claude. Recorded takes are the route there.
- Browser storage is not kept between visits in that frame (a new device id was made on every visit),
  which is why the log's document name is derived from the user agent instead.
- Not yet known: whether recording a take works on the iPhone inside Claude (file picker, camera, decoding),
  and whether the page can be opened on its own, outside the frame.

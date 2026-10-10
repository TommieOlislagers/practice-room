# Practice Room: notes for Claude

A personal guitar practice app for Tommie, who is learning guitar and uses an iPhone. No lyrics in songs, ever.

It is deployed in two places:

- **GitHub Pages** (this repository, `index.html` on `main`): https://tommieolislagers.github.io/practice-room/
  The browser can ask for the microphone here, so live listening works. Data lives in the browser's storage
  and, once Tommie signs in, in a secret gist on his GitHub account (see "Account on GitHub").
- **Inside Claude** as a published page with a database: https://claude.ai/artifact/AgBk9i1Ly1fBLJijN5DVQ3
  No microphone there (the viewer's frame is not given it); recorded takes only.

GitHub Pages publishes the `gh-pages` branch (pushing that branch is what switched Pages on; the Pages settings API is not reachable from a Claude session). To deploy: `git push origin main && git push origin main:gh-pages`.

Run `node build.js` and commit `index.html` together with any change in `src/`. Run the tests before pushing.

Ideas not built yet for the Pages copy: a `library.json` in the repository that the page fetches, so songs
can be added by a commit; a "copy my progress" export for coaching.

## Account on GitHub (Pages copy only, `src/app-account.js`, added 10 Oct 2026)

- Why a key and not a sign-in button: GitHub's sign-in for websites cannot be finished by a page without a
  server (the exchange wants a client secret, and neither it nor the device flow answers calls from a
  browser). So the player makes a fine-grained personal access token with one permission, Gists read and
  write, through a link that fills GitHub's form in (`Acct.keyUrl()`), and pastes it once per device.
  The key is kept in that browser's storage (`pr.account.v1`) and sent only to `api.github.com`.
- The data is one secret gist, found by the file `practice-room.json` in it: that file holds songs, deletion
  times (`gone`) and settings; `sessions-YYYY-MM.json` hold the session log, one file per UTC month.
- Saving is read, join, write what differs (`mergeData`, `filesOf`): sessions are joined by id and never
  dropped, the newer of a song's edit and delete wins, settings go to the side that changed them last.
  It runs on opening, 1.5 s after anything is saved, when the page is shown again, and when the connection
  returns; never during a run.
- Offered only where the page has no `window.claude` (so never inside Claude, where the database does this).
- Never tried against the real GitHub from here (the session's token cannot touch gists): the browser test
  uses a stand-in. The one open question is whether GitHub lists a secret gist for a fine-grained key. If it
  does not, the page notices on the next visit (`Acct.blind`) and points to a classic key with the `gist` scope.
- To read Tommie's progress for coaching, ask him for the address of the saved file (Settings, Account,
  "Open the saved file"); it is readable by address.
- The device keeps the newest 2000 sessions (`Store.cap()`); the gist keeps all of them. The game layer counts
  what the device holds. Inside Claude the database still hands over 500.

## Look and game (redesign of 10 Oct 2026)

- The look follows iOS conventions: system fonts, large titles, grouped cards, a blurred tab bar, sheets.
  All of it is `src/style.css`; one indigo tint, and green, amber, red only for right, nearly, wrong.
- Four tabs: Today (level card, next song, quests, week), Songs, Tuner, Progress (stats, badges, levels).
- Playing happens on the stage (`src/stage.js`): a note highway on a canvas, six lanes for the six strings
  (low E on the left), chords as bars with the fret per string, notes as discs. The practice code reports
  hit, late or miss and the stage shows it. Scoring stays in `app-practice.js`.
- The game layer (`computeGame` in `app-core.js`) is derived from the session log only: XP, player level
  (250 XP for the first, 250 more for each after), stars per song (60, 80, 95 percent), three daily quests,
  streaks and badges. Sessions carry `score`, `combo`, `stars`. Nothing else is stored, so it is the same on
  both deployments.
- `assets/` and `manifest.webmanifest` make the Pages copy installable to the home screen.

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
| `app-account.js` | the GitHub account for the Pages copy: sign-in with a key, the gist, joining and saving |
| `app-audio.js` | microphone, tones, metronome, reading recordings |
| `stage.js` | the playing screen: the note highway, bursts, multiplier, stars |
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

Node (`node test/tN_*.js`): t1 pitch, t2 chords, t3 tracking, t4 false positives, t5 parsers, t6 sound-track reader, t7 game layer, t8 the rules for joining a device with the account.
Browser (`node test/bN_*.js`, Playwright with the preinstalled Chromium): b1 smoke and screenshots, b2 live
listening with a fake microphone, b3 database, b4 marks, b5 locked-down frame, b6 asking for the microphone,
b7 recordings, b8 offline queue, b9 the iPhone case, b10 the GitHub account (a stand-in GitHub, two devices).

Test material is not in the kit: `scripts/get_samples.sh` (sampled guitar notes), `node test/mkwav.js`
(test performances), `scripts/make_media.sh` (phone-style videos, needs ffmpeg), and
`cd fonts && npm i @fontsource/inter` (a stand-in for the Apple system font on the test machine).
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

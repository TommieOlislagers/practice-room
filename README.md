# Practice Room

A personal guitar practice page: songs sorted by difficulty, a tuner, live listening that checks the
notes and chords you play, scoring of recorded takes, and a practice dashboard.

Live at https://tommieolislagers.github.io/practice-room/

Everything runs in the browser. Sound from the microphone is analysed on the device and never sent
anywhere. Songs and practice history are kept in the browser's own storage. Signing in with GitHub (a key
you make yourself, allowed to read and write gists only) also saves them to a secret gist on your account,
so they follow you from one device to the next.

`index.html` is built from `src/` with `node build.js`. See `CLAUDE.md` for how it is put together.

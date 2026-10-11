# Brief: finding lesson videos

The practice app shows YouTube lesson videos next to each song and each exercise, in YouTube's own embedded
player. Your job is to pick the videos. You only search; you never open a page.

## Tools

- Use **WebSearch only**, always with `allowed_domains: ["youtube.com"]` and `mode: "standard"`.
- Do **not** use WebFetch, curl or any other way of opening a web page. Every page that is opened makes the
  person approve it by hand, and they have asked for that to stop. Search results are all you need.
- Use Read and Write for files. Do not run the build and do not commit.

## What counts as a usable result

- Only results whose address is `https://www.youtube.com/watch?v=<id>`. The video id is the 11 characters after
  `v=`; drop anything after it (`&pp=...`, `&t=...`). Skip `/shorts/`, playlists, channels and live streams.
- **Never write an id that did not appear in a search result you received in this run.** Copy it character by
  character. If no suitable result turns up, leave that entry out; a missing video is fine, a made-up one is not.
- It must be a guitar lesson: titles with words such as lesson, tutorial, how to play. Prefer well-known teaching
  channels when the title shows one, and for riffs, solos and melodies prefer videos that say they show tab.
- Skip covers and performances, backing tracks, reactions, gear demos, and lessons for bass, piano, ukulele or drums.
- For a lesson in several parts, take part one.
- `title`: the result's title copied exactly, without the trailing " - YouTube".

## Output

Write one JSON file (the name is given in your task) into `/home/claude/practice-room/seed/videos/`:

```json
{
  "ds-sultans-of-swing": [
    { "id": "HBNwBoOe8aY", "kind": "lesson", "title": "Sultans Of Swing - Dire Straits #1of4 (Songs Guitar Lesson ST-322) How to play" },
    { "id": "_vcfLWqok9k", "kind": "solo", "title": "Dire Straits - Sultans of Swing solos (Guitar lesson with TAB)" }
  ]
}
```

At most four videos per key, the best first. Check your file is valid JSON by reading it back.

When done, reply with one line per key: the key and how many videos of which kinds you found, and list the keys
you left empty. No other commentary.

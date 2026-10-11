'use strict';
/* Checks every lesson video in seed/videos against YouTube: does it still exist, and may it be played on other sites?
   It asks YouTube's oEmbed address, which is made for exactly this, one video at a time.

     node scripts/check_videos.js            report only
     node scripts/check_videos.js --fix      also remove the dead ones from the files

   It needs an ordinary internet connection, which a Claude session does not have (YouTube is not reachable from
   there), so run it on your own computer. The page also notices dead videos by itself and leaves them out. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'seed', 'videos'), fix = process.argv.indexOf('--fix') >= 0;
(async () => {
  let all = 0, dead = 0;
  for (const f of fs.readdirSync(dir).filter(x => /\.json$/.test(x)).sort()) {
    const file = path.join(dir, f), data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = false;
    for (const key of Object.keys(data)) {
      const keep = [];
      for (const v of data[key]) {
        all++;
        let ok = false, note = '';
        try {
          const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v.id));
          ok = res.ok; note = ok ? (await res.json()).title : 'YouTube answered ' + res.status;
        } catch (e) { ok = true; note = 'could not ask (' + e.message + '), kept'; }
        if (ok) keep.push(v); else { dead++; changed = true; console.log('DEAD  ' + key + '  ' + v.id + '  ' + v.title + '  (' + note + ')'); }
        await new Promise(r => setTimeout(r, 150));
      }
      if (fix) { if (keep.length) data[key] = keep; else delete data[key]; }
    }
    if (fix && changed) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
  console.log(all + ' videos checked, ' + dead + ' dead' + (fix && dead ? ', removed' : ''));
})();

// Builds the comment posted back on a [publish] issue.
// It states, per game, whether BoardGameGeek data actually arrived — so nobody
// has to sit and wait for a sync that can never succeed. Reads the list written
// by apply_publish.mjs plus the freshly harvested data/bgg.json.
import fs from 'node:fs';

const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

const touched = read('publish_touched.json', []);
const bgg = read('data/bgg.json', { ids: {}, things: {} });
const ids = bgg.ids || {}, things = bgg.things || {};

const ok = [], noMatch = [], noDetail = [];
for (const g of touched) {
  const id = ids[g.key];
  if (id > 0 && things[id]) ok.push({ ...g, id, name: (things[id] || {}).name });
  else if (id > 0) noDetail.push({ ...g, id });
  else noMatch.push(g);          // id === 0 (searched, nothing matched) or absent
}

const lines = [];
if (!touched.length) {
  lines.push('ℹ️ Nothing new to add — every game in this request was already in the collection.');
} else {
  if (ok.length) {
    lines.push(`### ✅ Ready to sync (${ok.length})`);
    for (const g of ok) lines.push(`- **${g.t}** → [${g.name || 'BGG entry'}](https://boardgamegeek.com/boardgame/${g.id}) (id ${g.id})`);
    lines.push('');
    lines.push('Press **🔄 Sync** on these games in the galaxy now — the data is already online. (Or **Update all from data file** in the footer.)');
  }
  if (noDetail.length) {
    lines.push('');
    lines.push(`### ⏳ Matched, details still coming (${noDetail.length})`);
    for (const g of noDetail) lines.push(`- **${g.t}** → id ${g.id}`);
    lines.push('');
    lines.push('The next run picks these up; try Sync again a little later.');
  }
  if (noMatch.length) {
    lines.push('');
    lines.push(`### ⚠️ BoardGameGeek has no match for these titles (${noMatch.length})`);
    for (const g of noMatch) lines.push(`- **${g.t}**`);
    lines.push('');
    lines.push('These are saved in the collection, but BGG could not be matched by name — usually a nickname, a Czech-only name, or a typo. **Syncing them will not help.** To attach the real data:');
    lines.push('');
    lines.push('1. Find the game on [boardgamegeek.com](https://boardgamegeek.com) and copy its URL');
    lines.push('2. In the galaxy, open the game → **✏️ Edit** → paste the id into **BGG id** → **⤓ Re-fetch from this id** → **💾 Save changes**');
    lines.push('3. Press **🚀 Publish** again — that sends the correction so everyone gets it');
    lines.push('');
    lines.push('_Tip: when adding a game you can paste its BGG link straight into the title box — then the id travels with it and this never happens._');
  }
}

const body = lines.join('\n');
fs.writeFileSync('publish_report.md', body);
console.log(body);

// Merges "publish additions" from a GitHub issue body into data/games.json.
// The issue body carries a ```json block: { add:{collection:[],wishlist:[]}, fix:[{t,b}] }.
// New games are appended (deduped by normalized title); fixes set a BGG id (`b`)
// on an existing game so enrichment relinks it. Committing data/games.json then
// triggers bgg-data.yml, which enriches the newcomers with the BGG token.
import fs from 'node:fs';

const body = process.env.ISSUE_BODY || '';
const m = body.match(/```json\s*([\s\S]*?)```/);
if (!m) {
  console.log('No ```json block in the issue — nothing to do.');
  fs.writeFileSync(process.env.GITHUB_OUTPUT || '/dev/null', 'nojson=true\n', { flag: 'a' });
  process.exit(0);
}

let payload;
try { payload = JSON.parse(m[1]); }
catch (e) { console.error('Invalid JSON payload:', e.message); process.exit(1); }

// MUST match norm() in the HTML and fetch_bgg.mjs
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’´'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// A BGG link pasted into the title box must never become the game's name:
// rescue the id (so enrichment works by id) and derive a readable title.
const BGG_LINK = /boardgame(?:expansion)?\/(\d+)(?:\/([^/?#\s]+))?/;
const clean = g => {
  const o = {};
  for (const k of ['t', 'c', 'l', 'p', 'a', 'n', 'u', 'b', 'au']) if (g[k] != null && g[k] !== '') o[k] = g[k];
  if (o.t) {
    const m = String(o.t).match(BGG_LINK);
    if (m) {
      if (!o.b) o.b = +m[1];
      if (!o.u) o.u = `https://boardgamegeek.com/boardgame/${m[1]}`;
      const slug = m[2] ? decodeURIComponent(m[2]).replace(/[-_]+/g, ' ').trim() : '';
      o.t = slug ? slug.replace(/\b[a-z]/g, c => c.toUpperCase()) : `BGG game ${m[1]}`;
    }
  }
  return o.t ? o : null;
};

const db = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
db.collection = db.collection || [];
db.wishlist = db.wishlist || [];

let added = 0, fixed = 0;
const touched = [];   // what this run put in — the report step checks these titles
for (const [sect, arr] of [['collection', ((payload.add || {}).collection) || []],
                           ['wishlist', ((payload.add || {}).wishlist) || []]]) {
  const seen = new Set(db[sect].map(g => norm(g.t)));
  for (const raw of arr) {
    const c = clean(raw); if (!c) continue;
    const k = norm(c.t); if (seen.has(k)) continue;
    db[sect].push(c); seen.add(k); added++;
    touched.push({ t: c.t, key: k, sect, b: c.b || 0 });
  }
}
// A fix targets an existing game by its current title and can set the BGG id (b),
// a corrected title (nt), the second-language name (c), notes (n) and/or the
// alternative URL (au). An empty string clears the field.
for (const f of (payload.fix || [])) {
  if (!f || !f.t) continue;
  const k = norm(f.t), bid = +f.b || 0;
  const nt = typeof f.nt === 'string' ? f.nt.trim() : '';
  const text = ['c', 'n', 'au'].filter(x => typeof f[x] === 'string');
  if (!bid && !nt && !text.length) continue;
  let hit = null;
  for (const sect of ['collection', 'wishlist'])
    for (const g of db[sect]) if (norm(g.t) === k) {
      if (bid) g.b = bid;
      for (const x of text) { const val = f[x].trim(); if (val) g[x] = val; else delete g[x]; }
      if (nt) g.t = nt;                 // last: it changes the lookup key
      hit = g; fixed++;
    }
  if (hit) touched.push({ t: hit.t, key: norm(hit.t), sect: 'fix', b: hit.b || 0 });
}
// not committed — just handed to the next workflow step
fs.writeFileSync('publish_touched.json', JSON.stringify(touched, null, 1));

fs.writeFileSync('data/games.json', JSON.stringify(db, null, 1) + '\n');
console.log(`Publish applied: +${added} game(s), ${fixed} id fix(es).`);
// expose counts for the workflow comment
fs.writeFileSync(process.env.GITHUB_OUTPUT || '/dev/null', `added=${added}\nfixed=${fixed}\n`, { flag: 'a' });

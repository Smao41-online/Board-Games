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

const clean = g => {
  const o = {};
  for (const k of ['t', 'c', 'l', 'p', 'a', 'n', 'u', 'b']) if (g[k] != null && g[k] !== '') o[k] = g[k];
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
for (const f of (payload.fix || [])) {
  if (!f || !f.t || !f.b) continue;
  const k = norm(f.t), bid = +f.b; if (!bid) continue;
  for (const sect of ['collection', 'wishlist'])
    for (const g of db[sect]) if (norm(g.t) === k) { g.b = bid; fixed++; }
  touched.push({ t: f.t, key: k, sect: 'fix', b: bid });
}
// not committed — just handed to the next workflow step
fs.writeFileSync('publish_touched.json', JSON.stringify(touched, null, 1));

fs.writeFileSync('data/games.json', JSON.stringify(db, null, 1) + '\n');
console.log(`Publish applied: +${added} game(s), ${fixed} id fix(es).`);
// expose counts for the workflow comment
fs.writeFileSync(process.env.GITHUB_OUTPUT || '/dev/null', `added=${added}\nfixed=${fixed}\n`, { flag: 'a' });

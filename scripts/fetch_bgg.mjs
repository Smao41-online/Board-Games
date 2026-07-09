// Fetches BoardGameGeek data for every game in data/games.json and writes
// data/bgg.json, which BG_database.html loads same-origin — no CORS relays.
// Runs on GitHub Actions (see .github/workflows/bgg-data.yml). Incremental:
// existing data/bgg.json entries are reused, only unknowns are fetched.
import fs from 'node:fs';

const BGG = process.env.BGG_BASE || 'https://boardgamegeek.com/xmlapi2';
const OUT = 'data/bgg.json';
const UA = { 'User-Agent': 'BoardGameGalaxy/1.0 (personal collection database)' };

const games = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
const all = [...games.collection, ...games.wishlist];

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const ids = prev.ids || {};      // normTitle -> bggId (0 = not found on BGG)
const things = prev.things || {}; // bggId -> details
const zh = prev.zh || {};        // normTitle -> {thumb} | 0

// MUST match norm() in BG_database.html exactly — the keys are shared.
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’´'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unesc = s => String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&');

async function get(url) {
  for (let a = 0; a < 8; a++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (res.status === 200) return await res.text();
      if (res.status === 202 || res.status === 429 || res.status >= 500) {
        await sleep(2500 * (a + 1)); continue;
      }
      console.error(`  HTTP ${res.status} for ${url}`);
      return null;
    } catch (e) { await sleep(2000 * (a + 1)); }
  }
  return null;
}

function parseSearch(xml) {
  const out = [];
  for (const chunk of xml.split(/<item\s/).slice(1)) {
    const head = chunk.slice(0, chunk.indexOf('>'));
    const type = (head.match(/type="([^"]+)"/) || [])[1];
    const id = +((head.match(/id="(\d+)"/) || [])[1] || 0);
    const name = (chunk.match(/<name[^>]*value="([^"]*)"/) || [])[1] || '';
    const year = +((chunk.match(/<yearpublished[^>]*value="(\d+)"/) || [])[1] || 0);
    if (id) out.push({ id, type, name: unesc(name), year });
  }
  return out;
}

// Same scoring as the client
function pickCandidate(cands, query) {
  const nq = norm(query);
  let best = null, bestScore = 0;
  for (const c of cands) {
    const nc = norm(c.name);
    let s = 0;
    if (nc === nq) s = 3;
    else if (nc.startsWith(nq) || nq.startsWith(nc)) s = 2;
    else {
      const qa = new Set(nq.split(' ')), ca = new Set(nc.split(' '));
      let hit = 0; qa.forEach(w => { if (ca.has(w)) hit++; });
      if (hit / Math.max(qa.size, 1) >= 0.7) s = 1.5;
    }
    if (s > 0 && c.type === 'boardgame') s += .25;
    if (s > 0 && c.year) s += .1;
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return bestScore >= 1.5 ? best : null;
}

async function resolveId(g) {
  const tries = [g.t];
  const short = g.t.split(/[:(–]/)[0].trim();
  if (short && norm(short) !== norm(g.t) && short.length > 3) tries.push(short);
  if (g.c && norm(g.c) !== norm(g.t)) tries.push(g.c);
  let sawFailure = false;
  for (const q of tries) {
    const xml = await get(`${BGG}/search?query=${encodeURIComponent(q)}&type=boardgame,boardgameexpansion`);
    if (xml === null) { sawFailure = true; continue; }
    const hit = pickCandidate(parseSearch(xml), q);
    if (hit) return hit.id;
    await sleep(400);
  }
  return sawFailure ? null : 0;
}

async function zhLookup(key, url) {
  if (zh[key] !== undefined) return null;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
    if (res.status !== 200) throw new Error('http ' + res.status);
    const html = await res.text();
    const m = html.match(/boardgamegeek\.com\/(?:boardgame|boardgameexpansion)\/(\d+)/);
    if (m) { zh[key] = 1; return +m[1]; }
    const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    zh[key] = og ? { thumb: og[1] } : 0;
  } catch (e) { /* stays undefined, retried next run */ }
  return null;
}

function parseThings(xml) {
  const out = {};
  for (const chunk of xml.split(/<item\s/).slice(1)) {
    const head = chunk.slice(0, chunk.indexOf('>'));
    const id = (head.match(/id="(\d+)"/) || [])[1];
    if (!id) continue;
    const attr = re => (chunk.match(re) || [])[1];
    const links = t => [...chunk.matchAll(new RegExp(`<link[^>]*type="${t}"[^>]*value="([^"]*)"`, 'g'))].map(m => unesc(m[1]));
    let desc = unesc((chunk.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '').replace(/&#10;/g, '\n');
    if (desc.length > 900) desc = desc.slice(0, 900) + '…';
    let rank = null;
    const r = chunk.match(/<rank[^>]*name="boardgame"[^>]*value="(\d+)"/);
    if (r) rank = +r[1];
    const num = re => { const v = +(attr(re) || 0); return v || null; };
    out[id] = {
      name: unesc(attr(/<name[^>]*type="primary"[^>]*value="([^"]*)"/) || ''),
      year: num(/<yearpublished[^>]*value="(-?\d+)"/),
      minP: num(/<minplayers[^>]*value="(\d+)"/),
      maxP: num(/<maxplayers[^>]*value="(\d+)"/),
      time: num(/<playingtime[^>]*value="(\d+)"/),
      age: num(/<minage[^>]*value="(\d+)"/),
      thumb: unesc(attr(/<thumbnail>([^<]*)<\/thumbnail>/) || '') || null,
      img: unesc(attr(/<image>([^<]*)<\/image>/) || '') || null,
      cats: links('boardgamecategory'),
      mechs: links('boardgamemechanic').slice(0, 4),
      designers: links('boardgamedesigner').slice(0, 2),
      rating: (v => v ? +v.toFixed(2) : null)(+(attr(/<average[^>]*value="([\d.]+)"/) || 0)),
      weight: (v => v ? +v.toFixed(2) : null)(+(attr(/<averageweight[^>]*value="([\d.]+)"/) || 0)),
      rank,
      desc
    };
  }
  return out;
}

// ---------- phase 1: resolve ids ----------
const targets = new Map();
for (const g of all) { const k = norm(g.t); if (k && !targets.has(k)) targets.set(k, g); }
for (const [k, g] of targets) if (g.b && ids[k] === undefined) ids[k] = g.b;

const todo = [...targets.entries()].filter(([k]) => ids[k] === undefined || ids[k] === null);
console.log(`Resolving ${todo.length} of ${targets.size} titles…`);
let n = 0;
for (const [k, g] of todo) {
  let r = await resolveId(g);
  if (r === 0 && g.u && g.u.includes('zatrolene-hry')) {
    const viaZh = await zhLookup(k, g.u);
    if (viaZh) r = viaZh;
  }
  if (r !== null) ids[k] = r;
  if (++n % 25 === 0) {
    console.log(`  ${n}/${todo.length}`);
    fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), ids, things, zh }));
  }
  await sleep(900);
}

// ---------- phase 2: fetch details in batches ----------
const needed = [...new Set(Object.values(ids).filter(id => id && !things[id]))];
console.log(`Fetching details for ${needed.length} games…`);
for (let i = 0; i < needed.length; i += 20) {
  const chunk = needed.slice(i, i + 20);
  const xml = await get(`${BGG}/thing?id=${chunk.join(',')}&stats=1`);
  if (xml) Object.assign(things, parseThings(xml));
  console.log(`  batch ${Math.floor(i / 20) + 1}/${Math.ceil(needed.length / 20)}`);
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), ids, things, zh }));
  await sleep(2500);
}

fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), ids, things, zh }));
const matched = [...targets.keys()].filter(k => ids[k] > 0).length;
console.log(`Done: ${matched}/${targets.size} matched, ${Object.keys(things).length} detail records, ${Object.keys(zh).length} ZH entries.`);

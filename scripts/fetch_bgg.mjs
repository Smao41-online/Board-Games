// Fetches BoardGameGeek data for every game in data/games.json and writes
// data/bgg.json, which BG_database.html loads same-origin — no CORS relays.
//
// The classic BGG XML API now requires an API token (401 without one), so this
// uses the site's open JSON endpoints on api.geekdo.com instead:
//   - details: /api/geekitems?objectid=<id>&objecttype=thing&nosession=1
//   - stats:   /api/dynamicinfo?objectid=<id>&objecttype=thing
// IDs are resolved primarily from each game's zatrolene-hry.cz page (which
// links to BGG), with /search/boardgame?q= as an opportunistic fallback.
// Incremental: existing data/bgg.json entries are reused.
import fs from 'node:fs';

const API = process.env.BGG_API_BASE || 'https://api.geekdo.com';
const OUT = 'data/bgg.json';
const UA = { 'User-Agent': 'BoardGameGalaxy/1.0 (personal collection database)' };

const games = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
const all = [...games.collection, ...games.wishlist];

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const ids = prev.ids || {};      // normTitle -> bggId (0 = not found)
const things = prev.things || {}; // bggId -> details
const zh = prev.zh || {};        // normTitle -> 1 | {thumb} | 0

// MUST match norm() in BG_database.html exactly — the keys are shared.
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’´'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unesc = s => String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

async function get(url) {
  for (let a = 0; a < 6; a++) {
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

// ---------- search (opportunistic — endpoint may not exist) ----------
let searchOk = null; // null = untested, false = unavailable
async function searchIds(q) {
  if (searchOk === false) return null;
  const txt = await get(`${API}/search/boardgame?q=${encodeURIComponent(q)}&showcount=20`);
  if (txt === null) { if (searchOk === null) { searchOk = false; console.log('  (search endpoint unavailable — relying on ZH pages)'); } return null; }
  try {
    const d = JSON.parse(txt);
    const items = Array.isArray(d) ? d : (d.items || []);
    searchOk = true;
    return items.map(it => ({
      id: +(it.objectid || it.id || 0),
      type: it.subtype || it.objecttype || 'boardgame',
      name: typeof it.name === 'object' ? (it.name?.name || '') : String(it.name || ''),
      year: +(it.yearpublished || 0)
    })).filter(x => x.id);
  } catch (e) {
    if (searchOk === null) { searchOk = false; console.log('  (search endpoint returned non-JSON — relying on ZH pages)'); }
    return null;
  }
}

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

// ---------- zatrolene-hry: authoritative BGG link or at least box art ----------
async function zhLookup(key, url) {
  if (zh[key] !== undefined) return null;       // already mined (id, thumb, or nothing)
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
    if (res.status !== 200) throw new Error('http ' + res.status);
    const html = await res.text();
    const m = html.match(/boardgamegeek\.com\/(?:boardgame|boardgameexpansion)\/(\d+)/);
    if (m) { zh[key] = 1; return +m[1]; }
    const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    zh[key] = og ? { thumb: og[1] } : 0;
  } catch (e) { /* stays as-is, retried next run */ }
  return null;
}

async function resolveId(k, g) {
  if (g.b) return g.b;
  let sawFailure = false;
  if (g.u && g.u.includes('zatrolene-hry')) {
    const via = await zhLookup(k, g.u);
    if (via) return via;
    if (zh[k] === undefined) sawFailure = true;  // ZH fetch failed entirely
  }
  const tries = [g.t];
  const short = g.t.split(/[:(–]/)[0].trim();
  if (short && norm(short) !== norm(g.t) && short.length > 3) tries.push(short);
  if (g.c && norm(g.c) !== norm(g.t)) tries.push(g.c);
  for (const q of tries) {
    const cands = await searchIds(q);
    if (cands === null) { sawFailure = true; continue; }  /* incl. search-unavailable: retry next run */
    const hit = pickCandidate(cands, q);
    if (hit) return hit.id;
    await sleep(400);
  }
  return sawFailure ? null : 0;
}

// ---------- details from the JSON API ----------
const imUrl = x => typeof x === 'string' ? x : (x && (x.url || x.src)) || null;
async function fetchThing(id) {
  const giTxt = await get(`${API}/api/geekitems?objectid=${id}&objecttype=thing&nosession=1`);
  if (!giTxt) return null;
  let gi; try { gi = JSON.parse(giTxt).item; } catch (e) { return null; }
  if (!gi) return null;
  let stats = null, rank = null;
  const dyTxt = await get(`${API}/api/dynamicinfo?objectid=${id}&objecttype=thing`);
  if (dyTxt) try {
    const dy = JSON.parse(dyTxt).item;
    stats = dy.stats || null;
    const r = (dy.rankinfo || [])[0];
    if (r && r.rank && /^\d+$/.test(String(r.rank))) rank = +r.rank;
  } catch (e) { }
  const links = k => ((gi.links || {})[k] || []).map(x => unesc(x.name)).filter(Boolean);
  let desc = unesc(String(gi.description || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (desc.length > 900) desc = desc.slice(0, 900) + '…';
  const num = v => { const n = +v; return n || null; };
  const images = gi.images || {};
  return {
    name: unesc(gi.name),
    year: num(gi.yearpublished),
    minP: num(gi.minplayers),
    maxP: num(gi.maxplayers),
    time: num(gi.maxplaytime) || num(gi.minplaytime),
    age: num(gi.minage),
    thumb: imUrl(images.thumb) || imUrl(images.square200) || gi.imageurl || null,
    img: imUrl(images.previewthumb) || gi.imageurl || imUrl(images.thumb) || null,
    cats: links('boardgamecategory'),
    mechs: links('boardgamemechanic').slice(0, 4),
    designers: links('boardgamedesigner').slice(0, 2),
    rating: stats && stats.average ? +(+stats.average).toFixed(2) : null,
    weight: stats && stats.avgweight ? +(+stats.avgweight).toFixed(2) : null,
    rank,
    desc
  };
}

function save() {
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), ids, things, zh }));
}

// ---------- phase 1: resolve ids ----------
const targets = new Map();
for (const g of all) { const k = norm(g.t); if (k && !targets.has(k)) targets.set(k, g); }
for (const [k, g] of targets) if (g.b && !ids[k]) ids[k] = g.b;

const todo = [...targets.entries()].filter(([k]) => ids[k] === undefined || ids[k] === null);
console.log(`Resolving ${todo.length} of ${targets.size} titles…`);
let n = 0;
for (const [k, g] of todo) {
  const r = await resolveId(k, g);
  if (r !== null) ids[k] = r;
  if (++n % 25 === 0) { console.log(`  ${n}/${todo.length}`); save(); }
  await sleep(700);
}
save();

// ---------- phase 2: fetch details ----------
const needed = [...new Set(Object.values(ids).filter(id => id && !things[id]))];
console.log(`Fetching details for ${needed.length} games…`);
let d = 0;
for (const id of needed) {
  const t = await fetchThing(id);
  if (t) things[id] = t;
  if (++d % 25 === 0) { console.log(`  ${d}/${needed.length}`); save(); }
  await sleep(600);
}
save();

const matched = [...targets.keys()].filter(k => ids[k] > 0).length;
const detailed = [...targets.keys()].filter(k => ids[k] > 0 && things[ids[k]]).length;
console.log(`Done: ${matched}/${targets.size} matched, ${detailed} with details, ${Object.keys(zh).length} ZH entries, searchOk=${searchOk}`);

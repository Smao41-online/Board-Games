// Fetches BoardGameGeek data for every game in data/games.json and writes
// data/bgg.json, which BG_database.html loads same-origin — no CORS relays.
//
// The classic BGG XML API now requires an API token (401 without one), so this
// uses the site's open JSON endpoints on api.geekdo.com instead:
//   - details: /api/geekitems?objectid=<id>&objecttype=thing&nosession=1
//   - stats:   /api/dynamicinfo?objectid=<id>&objecttype=thing
// ID resolution (zatrolene-hry.cz and boardgamegeek.com are both behind
// Cloudflare bot challenges for datacenter IPs, so neither can be scraped):
//   1. BGG links already present in the spreadsheet
//   2. official XML API search when a BGG_TOKEN secret is configured
//   3. Wikidata (property P2339 = BoardGameGeek ID), verified against the
//      BGG JSON API so a wrong match can never slip in
// Incremental: existing data/bgg.json entries are reused.
import fs from 'node:fs';

const API = process.env.BGG_API_BASE || 'https://api.geekdo.com';
const XML = process.env.BGG_XML_BASE || 'https://boardgamegeek.com/xmlapi2';
const WD = process.env.WIKIDATA_BASE || 'https://www.wikidata.org';
const TOKEN = process.env.BGG_TOKEN || '';
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

async function get(url, extraHeaders) {
  for (let a = 0; a < 6; a++) {
    try {
      const res = await fetch(url, { headers: { ...UA, ...(extraHeaders || {}) }, signal: AbortSignal.timeout(25000) });
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

// ---------- official XML API search with self-detected auth scheme ----------
const XML_BASES = [XML, 'https://api.geekdo.com/xmlapi2'];
let xmlAuth = null;   // { base, variant } once a working scheme is found
function authVariants(token) {
  const b64u = Buffer.from(token + ':').toString('base64');   // token as username
  const b64t = Buffer.from(token).toString('base64');
  return [
    { name: 'Bearer',        headers: { Authorization: `Bearer ${token}` }, q: '' },
    { name: 'Basic(token:)', headers: { Authorization: `Basic ${b64u}` },  q: '' },
    { name: 'Basic(token)',  headers: { Authorization: `Basic ${b64t}` },  q: '' },
    { name: 'x-api-key',     headers: { 'x-api-key': token },              q: '' },
    { name: 'apikey-query',  headers: {},  q: `&apikey=${encodeURIComponent(token)}` },
    { name: 'token-query',   headers: {},  q: `&token=${encodeURIComponent(token)}` },
  ];
}
/* dedicated fetch that NEVER logs the URL (query-param schemes carry the token) */
async function tokenFetch(url, headers) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(25000) });
      const text = res.status === 200 ? await res.text() : '';
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (a + 1)); continue; }
      return { status: res.status, text };
    } catch (e) { await sleep(1500 * (a + 1)); }
  }
  return { status: 0, text: '' };
}
async function detectXmlAuth() {
  if (!TOKEN) { console.log('BGG_TOKEN present: no — using Wikidata only.'); return; }
  console.log(`BGG_TOKEN present: yes (${TOKEN.length} chars). Probing XML API auth schemes…`);
  for (const base of XML_BASES) {
    for (const v of authVariants(TOKEN)) {
      const { status, text } = await tokenFetch(`${base}/search?query=catan&type=boardgame${v.q}`, v.headers);
      const ok = status === 200 && /<item[\s>]/.test(text);
      console.log(`  ${base.replace('https://', '')} [${v.name}] -> HTTP ${status}${ok ? '  ✓ returned items' : ''}`);
      if (ok) { xmlAuth = { base, variant: v }; console.log(`  ✅ token works: ${base} with "${v.name}" auth`); return; }
      await sleep(700);
    }
  }
  console.log('  ⚠️ no auth scheme returned items with this token — continuing with Wikidata only.');
}
function parseSearchXml(xml) {
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
async function searchIdsXml(q) {
  if (!xmlAuth) return null;
  const { base, variant } = xmlAuth;
  const { status, text } = await tokenFetch(
    `${base}/search?query=${encodeURIComponent(q)}&type=boardgame,boardgameexpansion${variant.q}`, variant.headers);
  if (status !== 200 || !text) return null;
  return parseSearchXml(text);
}

// ---------- Wikidata bulk dump: every P2339 (BGG id) with labels & aliases ----------
let wdIndex = null;   // norm(label) -> [bggid, …]
async function loadWikidataDump() {
  const SPARQL = process.env.SPARQL_BASE || 'https://query.wikidata.org/sparql';
  const mk = withAliases => `SELECT ?bggid ?l WHERE { ?i wdt:P2339 ?bggid. ${withAliases
    ? '{ ?i rdfs:label ?l } UNION { ?i skos:altLabel ?l }'
    : '?i rdfs:label ?l'} FILTER(LANG(?l) IN ("en","cs","de")) }`;
  for (const q of [mk(true), mk(false)]) {
    const txt = await get(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`);
    if (!txt) continue;
    try {
      const rows = JSON.parse(txt).results.bindings;
      const idx = new Map();
      for (const r of rows) {
        const id = +r.bggid.value; if (!id) continue;
        const k = norm(r.l.value); if (!k) continue;
        const arr = idx.get(k) || [];
        if (!arr.includes(id)) { arr.push(id); idx.set(k, arr); }
      }
      if (idx.size) {
        wdIndex = idx;
        console.log(`Wikidata dump loaded: ${rows.length} labels, ${idx.size} unique keys.`);
        return;
      }
    } catch (e) { /* fall through to the simpler query */ }
  }
  console.log('Wikidata dump unavailable — using per-title search only.');
}

// ---------- Wikidata: title -> BGG id (P2339), verified against BGG itself ----------
async function wikidataCandidates(q, lang) {
  const s = await get(`${WD}/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${lang}&uselang=en&type=item&limit=8&format=json`);
  if (s === null) return null;
  let qids;
  try { qids = (JSON.parse(s).search || []).map(x => x.id); } catch (e) { return null; }
  if (!qids.length) return [];
  const e = await get(`${WD}/w/api.php?action=wbgetentities&ids=${qids.join('|')}&props=claims|labels&languages=en|cs&format=json`);
  if (e === null) return null;
  const cands = [];
  try {
    const ents = JSON.parse(e).entities || {};
    for (const qid of qids) {
      const ent = ents[qid]; if (!ent) continue;
      const claim = ((ent.claims || {}).P2339 || [])[0];
      const bggid = +(claim?.mainsnak?.datavalue?.value || 0);
      if (!bggid) continue;
      const label = ent.labels?.en?.value || ent.labels?.cs?.value || '';
      cands.push({ id: bggid, type: 'boardgame', name: label, year: 1 });
    }
  } catch (e2) { return null; }
  return cands;
}
function nameMatches(name, g) {
  const nn = norm(name);
  if (!nn) return false;
  for (const q of [g.t, g.c]) {
    if (!q) continue;
    const nq = norm(q);
    if (nq === nn) return true;
    /* accept a shorter official name for a verbose spreadsheet title
       ("Agricola revised edition" vs "Agricola"), but never a LONGER one —
       that is how spin-offs sneak in ("Terraforming Mars" would otherwise
       verify against "Terraforming Mars: Ares Expedition") */
    if (nq.startsWith(nn) && nn.length >= 4) return true;
  }
  return false;
}
async function resolveViaWikidata(g) {
  const tries = [[g.t, 'en']];
  const short = g.t.split(/[:(–]/)[0].trim();
  if (short && norm(short) !== norm(g.t) && short.length > 3) tries.push([short, 'en']);
  if (g.c && norm(g.c) !== norm(g.t)) tries.push([g.c, 'cs']);
  /* exact-label lookup in the bulk dump first — far better recall than
     the live top-8 search, and every candidate is still verified below */
  if (wdIndex) {
    for (const [q] of tries) {
      const hits = wdIndex.get(norm(q)) || [];
      for (const id of hits.slice(0, 4)) {
        const t = things[id] || await fetchThing(id);
        if (t && nameMatches(t.name, g)) { things[id] = t; return id; }
        await sleep(150);
      }
    }
  }
  let sawFailure = false;
  for (const [q, lang] of tries) {
    const cands = await wikidataCandidates(q, lang);
    if (cands === null) { sawFailure = true; continue; }
    const hit = pickCandidate(cands, q);
    if (!hit) continue;
    /* verify against BGG itself — details cached for phase 2 only when accepted */
    const t = things[hit.id] || await fetchThing(hit.id);
    if (t && nameMatches(t.name, g)) { things[hit.id] = t; return hit.id; }
    await sleep(200);
  }
  return sawFailure ? null : 0;
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
  if (xmlAuth) {
    const tries = [g.t];
    const short = g.t.split(/[:(–]/)[0].trim();
    if (short && norm(short) !== norm(g.t) && short.length > 3) tries.push(short);
    if (g.c && norm(g.c) !== norm(g.t)) tries.push(g.c);
    let sawFailure = false;
    for (const q of tries) {
      const cands = await searchIdsXml(q);
      if (cands === null) { sawFailure = true; continue; }
      const hit = pickCandidate(cands, q);
      if (hit) return hit.id;
      await sleep(400);
    }
    if (sawFailure) return null;
    /* token search found nothing definitive — still try wikidata below */
  }
  return await resolveViaWikidata(g);
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

/* audit previously matched ids with the strict rule — drop mismatches so they resolve again */
let audited = 0;
for (const [k, g] of targets) {
  const id = ids[k];
  if (!id || g.b === id) continue;
  const t = things[id];
  if (t && !nameMatches(t.name, g)) { delete ids[k]; audited++; }
}
if (audited) console.log(`Audit: dropped ${audited} previously matched id(s) failing strict verification.`);

await detectXmlAuth();
await loadWikidataDump();

const MAX_RESOLVE = +(process.env.MAX_RESOLVE || 400);   /* stay well under the job time limit */
const DEADLINE = Date.now() + (+(process.env.MAX_MINUTES || 70)) * 60000; /* commit cleanly before the job limit */
/* with a token or the bulk dump available, also retry earlier 'not found' verdicts */
let todo = [...targets.entries()].filter(([k]) =>
  ids[k] === undefined || ids[k] === null || ((xmlAuth || wdIndex) && ids[k] === 0));
if (todo.length > MAX_RESOLVE) {
  console.log(`Resolving ${MAX_RESOLVE} of ${todo.length} unresolved titles (the rest continues next run)…`);
  todo = todo.slice(0, MAX_RESOLVE);
} else {
  console.log(`Resolving ${todo.length} of ${targets.size} titles…`);
}
let n = 0;
for (const [k, g] of todo) {
  if (Date.now() > DEADLINE) { console.log(`  time budget reached at ${n}/${todo.length} — the rest continues next run`); break; }
  const r = await resolveId(k, g);
  if (r !== null) ids[k] = r;
  if (++n % 25 === 0) { console.log(`  ${n}/${todo.length}`); save(); }
  await sleep(400);
}
save();

// ---------- phase 2: fetch details ----------
const needed = [...new Set(Object.values(ids).filter(id => id && !things[id]))];
console.log(`Fetching details for ${needed.length} games…`);
let d = 0;
for (const id of needed) {
  if (Date.now() > DEADLINE + 10 * 60000) { console.log(`  time budget reached at ${d}/${needed.length}`); break; }
  const t = await fetchThing(id);
  if (t) things[id] = t;
  if (++d % 25 === 0) { console.log(`  ${d}/${needed.length}`); save(); }
  await sleep(400);
}
save();

const matched = [...targets.keys()].filter(k => ids[k] > 0).length;
const detailed = [...targets.keys()].filter(k => ids[k] > 0 && things[ids[k]]).length;
console.log(`Done: ${matched}/${targets.size} matched, ${detailed} with details, xmlAuth=${xmlAuth ? xmlAuth.variant.name : 'none'}`);

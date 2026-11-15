// One-off/maintenance audit: finds collection entries whose linked BoardGameGeek
// record is a *shorter* title than the game's own name — the signature of a game
// pointing at its base game's entry ("Ticket to Ride: Europe" → "Ticket to Ride").
// Some of those are deliberate (an expansion shown with its base game's art),
// so this only REPORTS candidates; a human decides and sets `b` in data/games.json.
//
// Needs BGG_TOKEN, so it runs in GitHub Actions. Writes data/link_audit.json.
import fs from 'node:fs';

const XML = process.env.BGG_XML_BASE || 'https://boardgamegeek.com/xmlapi2';
const TOKEN = process.env.BGG_TOKEN || '';
const UA = { 'User-Agent': 'BoardGameGalaxy/1.0 (personal collection database)' };

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’´'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unesc = s => String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/* ---- token auth (identical probing to fetch_bgg.mjs; never logs the URL) ---- */
const XML_BASES = [XML, 'https://api.geekdo.com/xmlapi2'];
let xmlAuth = null;
function authVariants(token) {
  const b64u = Buffer.from(token + ':').toString('base64');
  const b64t = Buffer.from(token).toString('base64');
  return [
    { name: 'Bearer', headers: { Authorization: `Bearer ${token}` }, q: '' },
    { name: 'Basic(token:)', headers: { Authorization: `Basic ${b64u}` }, q: '' },
    { name: 'Basic(token)', headers: { Authorization: `Basic ${b64t}` }, q: '' },
    { name: 'x-api-key', headers: { 'x-api-key': token }, q: '' },
    { name: 'apikey-query', headers: {}, q: `&apikey=${encodeURIComponent(token)}` },
    { name: 'token-query', headers: {}, q: `&token=${encodeURIComponent(token)}` },
  ];
}
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
  if (!TOKEN) { console.log('No BGG_TOKEN — cannot audit.'); return; }
  for (const base of XML_BASES) {
    for (const v of authVariants(TOKEN)) {
      const { status, text } = await tokenFetch(`${base}/search?query=catan&type=boardgame${v.q}`, v.headers);
      if (status === 200 && /<item[\s>]/.test(text)) {
        xmlAuth = { base, variant: v }; console.log(`token works: ${base} [${v.name}]`); return;
      }
      await sleep(600);
    }
  }
  console.log('token did not authenticate on any scheme');
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
async function search(q) {
  if (!xmlAuth || !q) return [];
  const { base, variant } = xmlAuth;
  const { status, text } = await tokenFetch(
    `${base}/search?query=${encodeURIComponent(q)}&type=boardgame,boardgameexpansion${variant.q}`, variant.headers);
  if (status !== 200 || !text) return [];
  return parseSearchXml(text);
}

/* ---- scoring: how well does a candidate name match the game's own title? ---- */
function score(title, cand) {
  const a = norm(title), b = norm(cand);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const A = a.split(' '), B = new Set(b.split(' '));
  const covered = A.filter(w => B.has(w)).length;
  if (covered === A.length) return 90 - Math.min(20, (b.split(' ').length - A.length) * 5); // all our words present
  return Math.round(60 * covered / A.length);
}

/* BGG's search is literal: a dash, a parenthetical or a trailing "expansion"
   makes it return nothing, so try progressively plainer forms of the title. */
function queryVariants(t, c) {
  const out = [];
  const add = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length > 2 && !out.includes(s)) out.push(s); };
  for (const base of [t, c].filter(Boolean)) {
    add(base);
    add(base.replace(/\s*\([^)]*\)/g, ''));                       // drop "(Deluxe edition)"
    add(base.replace(/[–—]/g, ' '));                              // en/em dash confuses search
    add(base.replace(/\s*[:–—-]\s*/g, ' '));                      // flatten all separators
    add(base.replace(/\b(expansion|expansions|deluxe|edition|package|set|big box)\b/gi, ''));
    const colon = base.split(/[:–—]/);
    if (colon.length > 1) { add(colon[0]); add(colon.slice(1).join(' ')); }
  }
  return out.slice(0, 6);
}

const games = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
const bgg = JSON.parse(fs.readFileSync('data/bgg.json', 'utf8'));
const ids = bgg.ids || {}, things = bgg.things || {};

/* the suspects: linked record's name is a strict subset of our title's words */
const suspects = [];
for (const sect of ['collection', 'wishlist']) {
  for (const g of games[sect]) {
    const id = ids[norm(g.t)];
    const th = id ? things[String(id)] : null;
    if (!th) continue;
    const A = new Set(norm(g.t).split(' ').filter(Boolean));
    const B = new Set(norm(th.name).split(' ').filter(Boolean));
    if (!A.size || !B.size) continue;
    const bSubsetOfA = [...B].every(w => A.has(w)) && B.size < A.size;
    if (bSubsetOfA) suspects.push({ sect, t: g.t, c: g.c || '', currentId: id, currentName: th.name, currentYear: th.year || 0 });
  }
}
console.log(`${suspects.length} entries link to a shorter BGG title — searching BGG for each…`);

await detectXmlAuth();
const report = [];
let n = 0;
for (const s of suspects) {
  const seen = new Map();
  for (const q of queryVariants(s.t, s.c)) {
    for (const r of await search(q)) if (!seen.has(r.id)) seen.set(r.id, r);
    await sleep(350);
    if ([...seen.values()].some(r => score(s.t, r.name) >= 100)) break;   // exact hit, stop early
  }
  const cands = [...seen.values()]
    .map(r => ({ ...r, score: Math.max(score(s.t, r.name), s.c ? score(s.c, r.name) : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  const best = cands[0];
  report.push({
    ...s,
    verdict: !best ? 'no-candidates'
      : best.id === s.currentId ? 'already-correct'
      : best.score >= 100 ? 'exact-match-available'
      : best.score >= 85 ? 'strong-candidate'
      : 'uncertain',
    candidates: cands,
  });
  if (++n % 10 === 0) console.log(`  ${n}/${suspects.length}`);
}
fs.writeFileSync('data/link_audit.json', JSON.stringify(report, null, 1) + '\n');
const by = v => report.filter(r => r.verdict === v).length;
console.log(`\nexact-match-available: ${by('exact-match-available')}`);
console.log(`strong-candidate     : ${by('strong-candidate')}`);
console.log(`already-correct      : ${by('already-correct')}`);
console.log(`uncertain            : ${by('uncertain')}`);
console.log(`no-candidates        : ${by('no-candidates')}`);

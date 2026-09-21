# Board Game Galaxy — project context

Solar-system-themed board game database for the Ušákova sbírka collection
(~693 games + 15 wishlist), built from `Board_Games_usakova_akce_4.xlsx`.
Everything lives on branch **`claude/board-game-database-solar-9avghh`** — develop,
commit and push there. There is a `bgg` project skill (`.claude/skills/bgg/`) with
the step-by-step maintenance procedures; use it for any change to this project.

## Files — who is the source of truth

| File | Role |
|---|---|
| `Galaxy_guide.html` | Self-playing 12-slide user walkthrough. Keep it in step with features. |
| `BG_database.html` | **The only file you edit.** Full app: solar UI, tabs, filters, add/remove/edit/sync, import wizard, publish, export. Contains inline `const GAMES/WISHLIST` arrays and an empty `/* BGG_BAKED_SLOT */`. |
| `BGG_Galaxy.html` | **Derived artifact — never edit directly.** Offline portable copy with all BGG data baked into the slot. Regenerate with `python3 scripts/bake_galaxy.py` after every change. |
| `index.html`, `BoardGames.html` | Frozen earlier versions. User asked to keep them untouched. |
| `data/games.json` | Source of truth for the game list `{collection:[{t,c,l,p,a,n,u,b}],wishlist:[...]}`. Keys: t=title, c=czech, l=language, p=players, a=age, n=notes, u=url, b=BGG id. |
| `data/bgg.json` | Harvested BGG data `{generated,ids,things,zh}` — `ids` maps norm(title)→BGG id, `things` maps id→detail record. Written by CI only. |
| `scripts/bake_galaxy.py` | Re-bakes both HTML files from the data files (inlines GAMES/WISHLIST into BG_database.html, fills BGG_BAKED in BGG_Galaxy.html). |
| `scripts/fetch_bgg.mjs` | Server-side harvest (BGG token XML search + Wikidata SPARQL + geekdo JSON API). Time-budgeted and resumable. |
| `scripts/apply_publish.mjs` | Merges a publish issue's ```json payload into data/games.json. |

## GitHub Actions

- `bgg-data.yml` — enrichment. Triggers: weekly cron, manual, push touching
  `scripts/fetch_bgg.mjs` or `data/games.json`. Uses secret `BGG_TOKEN` (works,
  Bearer scheme). Commits `data/bgg.json` even on timeout (`if: always()`).
  A run takes ~5–10 min when only a few games are new.
- `publish.yml` — fires on issues titled `[publish] …` from OWNER/COLLABORATOR/MEMBER.
  Runs apply_publish, **then runs `fetch_bgg.mjs` itself** and commits
  games.json + bgg.json together, then comments a per-game report
  (`scripts/publish_report.mjs`) and closes the issue. Reads **only the issue
  description text** — attachments are ignored.
- `pages.yml` — deploys the branch to `gh-pages` → https://smao41-online.github.io/Board-Games/
  Triggers on push **and on `workflow_run`** of the two workflows above.

## Data flow (the publish loop)

User adds game in browser (localStorage) → 🚀 Publish opens pre-filled GitHub issue →
publish.yml merges into games.json → bgg-data.yml enriches into bgg.json →
pages deploy → user presses 🔄 Sync (reads `ONLINE_DATA` = raw.githubusercontent /
github.io / local data/bgg.json) → to refresh the shipped files, run
`scripts/bake_galaxy.py`, commit, push. Timing shown to user: merge ~1 min +
enrichment ~5–10 min.

## Hard-won invariants — breaking these caused real field failures

0. **A workflow must never rely on its own commit triggering another workflow.**
   GitHub suppresses events from pushes made with the default `GITHUB_TOKEN`, so
   `publish.yml` committing games.json did NOT start `bgg-data.yml`: published
   games silently never got data while the issue comment claimed enrichment was
   running. Any step that must follow a bot commit either runs **in the same
   job** (what publish.yml now does with `fetch_bgg.mjs`) or triggers on
   `workflow_run` (what pages.yml now does). Verify with
   `actions_list list_workflow_runs` that a run actually exists for the sha.
0b. **Never promise a background step you have not verified fires** — report what
   actually happened per game instead (`scripts/publish_report.mjs`).
0c. **Placeholder titles are poison.** 29 collection rows shipped with
   `t:"zzz: czech only"` (spreadsheet rows lacking an English name). They all
   normalised to one key, so none could hold its own BGG record, and the cards
   showed that literal text. Titles must be real and unique; `t` falls back to
   the Czech name.
1. **`norm()` must stay byte-identical** in BG_database.html, fetch_bgg.mjs and
   apply_publish.mjs: lowercase → NFD strip combining marks → remove `’´'\`` →
   non-alnum→space → trim. All id lookups key on it.
2. **Baking escapes ONLY `</`→`<\/` and literal U+2028/U+2029.** A broader
   replace once turned every space into ` ` and broke the whole file.
3. **BGG XML API2 returns 401 without a Bearer token.** Client-side code never
   uses the token (it would leak in a shareable file) — the browser resolves
   titles via Wikidata (`wbsearchentities`/`wbgetentities` with `&origin=*`,
   CORS-friendly) and fetches details from open `api.geekdo.com` JSON endpoints
   (`/api/geekitems`, `/api/dynamicinfo`) **which have no CORS headers**, so
   browser calls go through relays (allorigins, codetabs, r.jina.ai — see
   `JBUILDERS` in the HTML). Never log or embed the token anywhere.
4. **Wikidata doesn't know every game** (e.g. Namiji). Those games resolve only
   server-side via the token; client flow = add with basic info → Publish → Sync.
5. **Offline circuit-breaker** (`offline`/`consecFails` in `getJson`) must be
   reset via `resetOnline()` at the start of every user-initiated action, or a
   single offline moment permanently kills add/sync.
6. **`overrides` (localStorage) is polluted by design**: every Sync writes
   `{id,det}` for the game. Only entries with the `uf` flag (set when the user
   changes the BGG id in Edit) are genuine user fixes — Publish must send only
   those, or the payload explodes past the pre-filled-URL limit (~7000 chars).
7. **User-added games dedupe on load**: a localStorage game whose norm title is
   already in the shipped GAMES list is dropped from the store (it "graduated"
   via publish). Don't remove that logic or users get duplicate cards.
8. localStorage keys: `user.games.v1` (added), `user.removed.v1` (removed, by
   stable index), `user.overrides.v1` (edits/syncs), `bgg.ids.v2`/`bgg.things.v2`
   (cache), `zh.extra.v1`.

## Invoice → batch add

`🧾 Add from invoice` reads .pdf/.xlsx/.csv/.txt or pasted text, keeps game-like lines
and buckets them new / check / duplicate. The PDF reader is hand-written in the HTML
(`pdfToText`): object scan → FlateDecode via `DecompressionStream` → ToUnicode CMap →
Tj/TJ with Tm/Td line breaks. It handles Type0/CIDFontType2 (what Chrome and most
invoicing systems emit) and WinAnsi. Scans/photos have no text layer — say so and point
at phone text recognition instead of pretending.
Classifier gotchas already paid for: measure the letter ratio against **non-space**
characters (invoice columns are space-padded, which sank `Brass: Birmingham`), exclude
currency/unit words before counting letters (`3x Azul … 1 497,00 Kč` looked like a price
line), and treat a match on the **BGG record's name** as `maybe`, never `dupe` — many
expansions are deliberately linked to their base game's record.

## Practical gotchas

- Syntax-check after editing: extract `<script>…</script>` to a .js file and run
  `node --check` (see the bgg skill for the snippet). Do it for BOTH html files.
- Playwright: launch with `executablePath:'/opt/pw-browsers/chromium'`; mock the
  network with `ctx.route`; file:// pages work fine with routing.
- Commit with `git commit -F <file>` — messages contain backticks/emoji.
- Always `git pull --rebase origin claude/board-game-database-solar-9avghh`
  before pushing — CI bots commit data files to the same branch.
- GitHub MCP list tools return huge payloads — pipe the saved result file
  through `jq` instead of reading it.
- Enrichment progress: poll `git fetch` for a new "Refresh BGG data" commit
  (webhooks don't cover it).
- The user opens the galaxy from `file://` — anything that needs same-origin
  fetch must have a baked/inline fallback.

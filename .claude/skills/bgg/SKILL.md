---
name: bgg
description: Maintenance workflow for the Board Game Galaxy database in this repo (BG_database.html / BGG_Galaxy.html / data pipeline). Use this for ANY change to the galaxy project — adding features, fixing sync/add/publish/edit bugs, updating game data, re-baking the offline file, debugging BGG enrichment or the publish workflow, or delivering an updated galaxy file to the user — even when the request only mentions "the database", "the galaxy", a game title that won't sync, or a broken button.
---

# BGG — Board Game Galaxy maintenance

Architecture, invariants and gotchas live in `CLAUDE.md` at the repo root — read
it first if it isn't already in context. This skill is the *procedure* side:
the exact steps that make a change land safely in both HTML files and the
online database.

Golden rule: **`BG_database.html` is the only HTML you ever edit.**
`BGG_Galaxy.html` is generated from it. If you catch yourself editing the
galaxy file, stop and redo the change in `BG_database.html`.

## The standard change loop

Every code or data change follows the same sequence:

1. **Edit** `BG_database.html` (and/or `data/games.json`, scripts, workflows).
2. **Re-bake** both files (also inlines games.json into BG_database.html):
   ```bash
   python3 scripts/bake_galaxy.py
   ```
3. **Syntax-check both files** — a bad bake or edit must never reach the user:
   ```bash
   # from the repo root; write the extracted JS to the scratchpad, not the repo
   python3 - <<'EOF'
   import re, os
   out_dir = os.environ.get('SCRATCH', '/tmp')
   for f, out in [("BG_database.html", "a.js"), ("BGG_Galaxy.html", "b.js")]:
       js = re.search(r'<script>(.*)</script>', open(f, encoding='utf-8').read(), re.S).group(1)
       open(os.path.join(out_dir, out), 'w', encoding='utf-8').write(js)
   EOF
   node --check "${SCRATCH:-/tmp}/a.js" && node --check "${SCRATCH:-/tmp}/b.js"
   ```
4. **Test in a real browser** (see "Playwright testing" below). Test the flow
   you changed end-to-end, not just that the page loads.
5. **Commit both HTML files together** plus whatever else changed. Message via
   file (emoji/backticks break inline `-m`):
   ```bash
   git commit -F /tmp/cmsg.txt
   git pull --rebase origin claude/board-game-database-solar-9avghh
   git push -u origin claude/board-game-database-solar-9avghh
   ```
6. **Deliver**: `SendUserFile` with `BGG_Galaxy.html` whenever the change
   affects what the user's offline copy does — they use the file you send, not
   the repo.

Pushing to the branch auto-deploys GitHub Pages. Pushing a change to
`data/games.json` or `scripts/fetch_bgg.mjs` additionally triggers the
BGG enrichment run (~5–10 min).

## Playwright testing

Skeleton (works from `file://`, network fully mockable):

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext();
const J = o => ({ status:200, contentType:'application/json', body: JSON.stringify(o) });
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith('file://')) return route.continue();
  return route.abort();                    // = fully offline; fulfill() to mock
});
const page = await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('dialog',d=>d.accept());
await page.goto('file://' + process.cwd() + '/BGG_Galaxy.html');
```

Mock endpoints you'll need:
- online data file: URLs containing `raw.githubusercontent.com` / `github.io`
  → fulfill `{generated,ids:{<norm>:<id>},things:{<id>:<det>},zh:{}}`
- Wikidata: `wbsearchentities` → `{search:[{id:'Q1'}]}`;
  `wbgetentities` → `{entities:{Q1:{claims:{P2339:[{mainsnak:{datavalue:{value:'<bggid>'}}}]},labels:{en:{value:'<name>'}}}}}`
- geekdo via relay: extract inner URL with
  `decodeURIComponent(u.split('url=')[1]||u.split('quest=')[1]||u.split('r.jina.ai/')[1]||'')`,
  answer `/api/geekitems` and `/api/dynamicinfo`
- direct `https://api.geekdo.com/` → always `route.abort()` (no CORS in real life)

To fake dialogs/window.open, override in the page:
`window.confirm=m=>{...;return true}` etc., then read what was captured.

Scenarios worth re-testing after touching add/sync/publish:
fully-offline add (📴 status + "Add offline" label), Sync populating a game
from the online data mock, BGG link-paste in the add dialog, Publish payload
containing only user-added games + `uf`-flagged fixes, no duplicate card when
a localStorage game also exists in the shipped list.

## Operating the publish → enrich pipeline

- A publish issue works only if its **description** contains a ```json block —
  attachments are ignored. The bot comments an explanation when it's missing.
- `publish.yml` merges **and enriches in the same job**, then comments a per-game
  verdict. It must stay that way: a commit pushed with the default `GITHUB_TOKEN`
  does not trigger other workflows, so the old "commit games.json and let
  bgg-data.yml pick it up" chain never ran (see invariant 0 in CLAUDE.md).
  **When touching any workflow, confirm a run really exists for the new sha** —
  `actions_list list_workflow_runs` and match `head_sha`; an absent run is the
  signature of this trap.
- Manually enriching pending games: dispatch `bgg-data.yml`
  (`actions_run_trigger run_workflow`, ref = the project branch).
- Watch for completion with plain git (webhooks don't fire for it):
  ```bash
  # background poll until the CI commit lands
  for i in $(seq 1 60); do git fetch -q origin claude/board-game-database-solar-9avghh; \
    [ -n "$(git log --oneline HEAD..FETCH_HEAD)" ] && { git log --oneline HEAD..FETCH_HEAD; exit 0; }; sleep 30; done
  ```
- After a "Refresh BGG data" commit: `git pull --rebase`, verify the new game
  in `data/bgg.json` (`ids[norm(title)]` + `things[id]`), then run the standard
  change loop from step 2 so the new data gets baked and shipped.
- Games absent from Wikidata (e.g. Namiji) can ONLY be enriched server-side —
  the client flow for them is: add with basic info → Publish → wait ~10 min →
  Sync. If a user says a game "won't sync", first check whether it exists in
  `data/games.json` and `data/bgg.json` at all.
- GitHub MCP `actions_list`/`list_issues` responses overflow context — they get
  saved to a file; query it with `jq`, never read it raw.

## Debug checklist for user field reports

1. Reproduce with Playwright using mocks that match the report ("offline",
   "relay blocked" = abort those routes) before changing anything.
2. Check the report against the offline circuit-breaker: is `resetOnline()`
   called at the start of the action?
3. If data is missing for specific games: is the title in `data/bgg.json` ids?
   If not — Wikidata miss → needs the server token path (Publish).
4. If a publish "did nothing": read the issue the user actually submitted —
   is the ```json block in the description?
5. If the baked file misbehaves but BG_database.html is fine: suspect the bake
   (check the escaping invariant in CLAUDE.md), re-run `bake_galaxy.py`.
6. After the fix, re-test the *user's exact scenario*, then run the standard
   change loop and send the updated `BGG_Galaxy.html` with a plain-language
   explanation of what went wrong.

# 🪐 Board Game Galaxy — Ušákova sbírka

A solar-system-themed, single-file database of the board game collection
(**692 games** + **15 wishlist items**), built from `Board_Games_usakova_akce_4.xlsx`.

## New here? Watch the briefing

Open **`Galaxy_guide.html`** — an eleven-slide, self-playing walkthrough (about two minutes) that
covers finding a game, adding one, editing it, and the publish → sync loop. It plays like a video;
`←` `→` steer, `space` pauses, and the planets along the bottom jump to any slide.

## Which file to open

| If you… | Open | Why |
|---|---|---|
| want it to **always work, even with no internet** | **`BGG_Galaxy.html`** | Every game's BGG data (box art, ratings, genres) is stored *inside* the file. |
| are online, or use the hosted site | `BG_database.html` | Small file; it downloads the game data on start-up. **Without internet it has no data** and shows planets instead of box art. |

Both files have the same features. `index.html` is the original read-only version and
`BoardGames.html` an earlier step — kept for reference.

If a page ever says *"no built-in BoardGameGeek data"*, you opened `BG_database.html`
offline — switch to `BGG_Galaxy.html`. The 🩺 *Test relays* button in the 🛰️ Mission
control panel gives a plain-language verdict on what is and isn't working.

- 🔭 **Search** by English title, Czech/second-language title, or the BoardGameGeek name —
  including titles you edited yourself (accent- and case-insensitive, so `korist` finds *Kořist*)
- 🌍 **Filter** by language, player count, and genre
- 🌌 **Sort** by title, BGG rating, complexity, play time, or year
- 🪐 Click any card for full details (description, designer, mechanics, links)
- ✨ Separate **Wishlist** tab
- ☀️ **Add a new game**: click the hidden **`+` in the middle of the sun**. Type a title,
  and the dialog searches BoardGameGeek live — pick the right match and every attribute
  (box art, players, age, play time, rating, genre) is filled in automatically. Works for
  both Collection and Wishlist; your additions are saved in the browser (`localStorage`),
  marked with a ✦ *added* badge, and can be removed again from their detail view
- 🔄 **Sync a game** (`BG_database.html`, `BGG_Galaxy.html`): each detail view has a Sync button. When
  online it pulls the freshest **token-enriched** data from the hosted repo
  (`raw.githubusercontent.com …/data/bgg.json`); offline it uses the baked-in data; and for a brand-new
  game not in any data file it resolves live via **Wikidata → BoardGameGeek** right in the browser
  (no token needed client-side). Clicking Sync also resets the connectivity breaker, so it works even
  if an earlier offline moment disabled network calls. A footer **"Update all from data file"** button
  refreshes the whole collection from the online data at once.
- ➕ **Add a game** now searches **Wikidata** (browser-friendly, no token) to resolve the title to a
  BoardGameGeek entry and pulls its box art, rating, genre, players, etc. — so adding a game while
  online fills in real data even in the offline file. You can also **paste a BGG link or id**
  (e.g. `boardgamegeek.com/boardgame/297562/namiji`) straight into the title box — the dialog fetches
  that exact entry, which also covers games that aren't on Wikidata yet.
- 📴 **Add a game offline**: if the search can't reach the internet, the dialog says so and the save
  button switches to *Add offline (sync later)* — the game is stored with the basic info you typed.
  When you're back online, open the game and press **🔄 Sync** (or use **🚀 Publish** first so the
  server enriches it with the BGG token, then Sync) and the full data flows into both the offline
  file (re-generate it with *Download portable HTML*) and the online database.
- ✏️ **Edit a game** (`BG_database.html`, `BGG_Galaxy.html`): the detail view has an Edit button to fix
  **both titles** (English and Czech/second language — the search picks the new ones up immediately, and
  a rename keeps the game's BGG data), your own **Notes** (who borrowed it, missing pieces, where it came
  from), an **Alternative URL** for games neither BoardGameGeek nor Zatrolené hry covers (a Kickstarter,
  publisher or shop link — it appears as a link in the detail view, labelled 🚀 Kickstarter when it is one),
  a wrong box art (paste the correct image URL), relink the BGG id (with a *Re-fetch from this id* button),
  or override rating, genre, players, year, description, etc.
  Title, notes, alternative-URL and id corrections travel with 🚀 Publish, so the shared database gets
  them too — and both appear in the Excel export. Your edits are saved in the browser
  (`localStorage`), marked with a ✦ *edited* badge, win over future syncs, and can be undone with
  *Reset to original BGG data*. Works fully offline in `BGG_Galaxy.html`.
- 🚀 **Publish additions online**: footer button that pushes the games you've *added* (and any
  BGG-id corrections you made with Edit) back into the shared online database — no credentials in
  the file. It opens a pre-filled **GitHub issue** titled `[publish] …` containing your additions as
  JSON; you press *Submit new issue* (signed in to GitHub). The **Publish additions** workflow
  (`.github/workflows/publish.yml`, owner-only) merges them into `data/games.json`, which triggers
  the BGG enrichment run — so your additions reach the online database and hosted site automatically,
  then flow back to everyone's copies on their next Sync. (Adding to `data/games.json` is the one
  server-side write; everything else stays local to your browser.)
  **Timing**: after you press *Submit new issue*, the merge lands in under a minute and the BGG
  enrichment run takes ~5–10 minutes — then press 🔄 Sync (or *Update all from data file*).
  The bot comments on your issue with the result. Note the JSON must be **pasted in the issue
  description** — attaching it as a file does not work (the bot only reads the description text);
  the Publish button handles this for you, including a clipboard copy when the list is large.
- ⬇️ **Download portable HTML**: footer button that bakes the *current* state — your edits, added
  games, removals, and all BGG data — into a fresh self-contained `BGG_Galaxy.html` you can share.
  A person who opens it sees your version instantly, offline, with no localStorage needed.
- 🧾 **Add from invoice**: footer button that reads the game names out of a purchase invoice
  (`.pdf`, `.xlsx`, `.csv`, `.txt`, or pasted text) and checks each one against the collection, so a
  whole order can be added without hunting for duplicates by hand. Results come in three groups —
  **new** (ticked), **check these** (similar to something you own, e.g. *Ticket to Ride* next to
  *Ticket to Ride: Europe*), and **already in the galaxy** (locked). Prices, shipping, VAT, totals
  and item codes are filtered out, and the skipped lines can be expanded so nothing vanishes
  silently. The PDF reader is built into the file — no library, works offline — but it needs a PDF
  that contains **text**; a scan or photo has none, so use your phone's text recognition (iPhone Live
  Text, Google Lens) to copy the text off the image and paste it in.
- 📊 **Export to Excel**: footer button that saves the whole collection + wishlist as a real `.xlsx`
  file — no libraries, generated entirely in the browser. The file uses **the same layout the import
  wizard reads** (two sheets, *Collection* and *Wishlist*, with `Title / Název / Language / Players /
  Age / Notes / Link` columns), so you can edit it in Excel and feed it straight back through the
  import/comparison flow. The BGG detail columns that follow (id, rating, play time, complexity,
  categories, designers, box art…) are extra; the importer keeps the BGG id and ignores the rest.
- 🗑 **Remove any game** (`BG_database.html`): every game's detail view has a Remove button.
  Removals are remembered in the browser; a *Restore removed games* button in the footer undoes them
- 🔐 **Maintenance password**: the two destructive footer buttons — *Rescan galaxy* (throws away the
  cached BGG data) and *Restore removed games* (undoes your curation) — ask for the same passphrase
  that unlocks the spreadsheet import before they do anything. It stops an accidental click; it is
  not real security, since anyone holding the file can read it.
- 📦 **Import an updated spreadsheet** (`BG_database.html`): type
  **`usakova sbirka board game database`** into the command line at the very top row of the page.
  Pick the new `.xlsx` — it is parsed and compared with the database behind the scenes, and only
  the **delta** (games not yet in the database) is shown with checkboxes, separately for
  Collection and Wishlist. Confirm, and the newcomers are added and enriched from BGG automatically

## Optional: 100% BGG coverage with an API token

BGG's classic XML API now requires a personal token
(see [boardgamegeek.com/using_the_xml_api](https://boardgamegeek.com/using_the_xml_api)).
Without one, games are matched via Wikidata (verified against BGG, so never wrong — but
not every game is on Wikidata). For full coverage: create a token in your BGG account,
then add it in this repo under **Settings → Secrets and variables → Actions →
New repository secret**, name `BGG_TOKEN`. The next *Refresh BGG data* run will use
official BGG search and match essentially everything.

## Where the extra data comes from

The spreadsheet provides title, Czech name, language, players, age, notes and links.
Box art, genres, ratings, play times, complexity and descriptions are fetched
**live from the [BoardGameGeek XML API](https://boardgamegeek.com/wiki/page/BGG_XML_API2)
in your browser** the first time you open the page (takes a few minutes — watch the
🛰️ *Mission control* panel). Results are cached in `localStorage`, so every later
visit is instant. Use the **“Rescan galaxy”** button in the footer to refresh.

Games without a thumbnail (or not found on BGG) get a procedurally colored planet instead.

## Files

| File | Purpose |
|---|---|
| `BG_database.html` | **Latest version** — everything below plus remove-any-game and xlsx delta import |
| `BoardGames.html` | Database + add-game via the hidden `+` in the sun |
| `index.html` | Original read-only version of the database |
| `data/games.json` | Clean JSON extract of the spreadsheet (collection + wishlist) |

## Tip: host it (recommended — fixes relay issues)

A GitHub Actions workflow (`.github/workflows/pages.yml`) already deploys this repo to
**GitHub Pages** on every push. It currently fails because Pages is unavailable on
**private** repos under the free plan. To activate it:

1. GitHub → repo **Settings → General → Danger Zone → Change visibility → Make public**
2. GitHub → **Actions** tab → *Deploy to GitHub Pages* → **Run workflow** (or just push anything)
3. The database is then live at
   `https://smao41-online.github.io/Board-Games/BG_database.html`

Hosting matters: some BGG relays (notably corsproxy.io) refuse requests from locally-opened
files but work fine from a real website, so the hosted copy syncs far more reliably —
and works from your phone.

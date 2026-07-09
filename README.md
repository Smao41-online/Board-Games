# 🪐 Board Game Galaxy — Ušákova sbírka

A solar-system-themed, single-file database of the board game collection
(**692 games** + **15 wishlist items**), built from `Board_Games_usakova_akce_4.xlsx`.

## How to use

Just open **`BG_database.html`** in any browser — no server, no build step, no dependencies.
(`index.html` is the original read-only version; `BoardGames.html` adds the add-game feature;
`BG_database.html` is the latest and adds remove-any-game plus spreadsheet import.)

- 🔭 **Search** by English or Czech title
- 🌍 **Filter** by language, player count, and genre
- 🌌 **Sort** by title, BGG rating, complexity, play time, or year
- 🪐 Click any card for full details (description, designer, mechanics, links)
- ✨ Separate **Wishlist** tab
- ☀️ **Add a new game**: click the hidden **`+` in the middle of the sun**. Type a title,
  and the dialog searches BoardGameGeek live — pick the right match and every attribute
  (box art, players, age, play time, rating, genre) is filled in automatically. Works for
  both Collection and Wishlist; your additions are saved in the browser (`localStorage`),
  marked with a ✦ *added* badge, and can be removed again from their detail view
- 🗑 **Remove any game** (`BG_database.html`): every game's detail view has a Remove button.
  Removals are remembered in the browser; a *Restore removed games* button in the footer undoes them
- 📦 **Import an updated spreadsheet** (`BG_database.html`): type
  **`usakova sbirka board game database`** into the command line at the very top row of the page.
  Pick the new `.xlsx` — it is parsed and compared with the database behind the scenes, and only
  the **delta** (games not yet in the database) is shown with checkboxes, separately for
  Collection and Wishlist. Confirm, and the newcomers are added and enriched from BGG automatically

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

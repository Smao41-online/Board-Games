# 🪐 Board Game Galaxy — Ušákova sbírka

A solar-system-themed, single-file database of the board game collection
(**692 games** + **15 wishlist items**), built from `Board_Games_usakova_akce_4.xlsx`.

## How to use

Just open **`BoardGames.html`** in any browser — no server, no build step, no dependencies.
(`index.html` is the original read-only version; `BoardGames.html` adds the ability to add games.)

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
| `BoardGames.html` | The full app — database, theme, enrichment engine **and add-game feature** |
| `index.html` | Original read-only version of the database |
| `data/games.json` | Clean JSON extract of the spreadsheet (collection + wishlist) |

## Tip: host it

Enable **GitHub Pages** for this repo (Settings → Pages → deploy from branch) and the
database becomes a shareable website.

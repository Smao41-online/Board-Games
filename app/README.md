# 🪐 Galaxy App — the collection on your iPhone

An installable web app (PWA) that reads the **same database** as the PC galaxy, so
anything published from either side shows up on both.

**Install:** open <https://smao41-online.github.io/Board-Games/app/> in **Safari**
→ Share → **Add to Home Screen** → Add. It then runs full screen with its own icon,
works without signal, and the camera behaves like a normal app.

> Safari specifically — Chrome on iOS cannot install a web app to the home screen.

## What it does

| Tab | |
|---|---|
| 🪐 **Galaxy** | The whole collection. Search works on the English title, the Czech title and the BoardGameGeek name at once. Filter by language or player count, sort by rating, year or weight. |
| 📷 **Scan** | Two modes with clearly different frames: **▌▌ Barcode** (a narrow yellow slot — hold the barcode in it) and **🔤 Title on the box** (a tall teal frame — fill it with just the game's name, then tap *Read this title*). Either way you get the shop verdict: **✓ you own this / ✦ wishlist / ✕ new**. |
| 🎲 **Tonight** | Players, time, genre and weight → **suggestions** from games you own, best rated first. The criteria used are printed above the results. |
| ⋯ **More** | Publish, share, refresh, remembered barcodes, install help, diagnostics. |

The hidden `+` from the PC galaxy is the **sun button**, bottom right: add a game by
hand, or paste a BoardGameGeek link and it fills itself in.

## The barcode index

BoardGameGeek has no barcode lookup, and public barcode databases cover Czech
editions poorly. So the app learns:

1. Scan an unknown barcode → it asks several public databases for a guess
2. You get a clear **⚠️ unconfirmed** warning, and name the game from a search box over your own collection
3. That barcode is remembered **for good**, works offline from then on, and travels
   to everyone else when you publish

The second scan of any box is instant and needs no connection.

## Publishing from the phone

Add or edit on the phone → **More → Publish** → a pre-filled GitHub issue opens →
press *Submit new issue*. The usual robot merges it, fetches the BoardGameGeek data
and replies with what it found, per game. Press ⟳ afterwards to pull it back in.

## Files

| File | Purpose |
|---|---|
| `app/index.html` | The whole app |
| `app/sw.js` | Service worker — offline shell, cached collection and box art |
| `app/manifest.webmanifest` | Name, icons, full-screen behaviour |
| `app/vendor/zxing.min.js` | Barcode decoder, bundled so scanning works offline |
| `.github/workflows/pages-app.yml` | Copies `app/` into the published site |

Everything else on this branch is inherited from the PC galaxy and is not used by
the app except `data/games.json` and `data/bgg.json`.

## Adding a game by hand

The sun button searches **both** your galaxy (so you do not add a duplicate) **and**
BoardGameGeek live, via Wikidata and the public relays — pick a result and the box
art, rating, players and play time come with it. Pasting a BGG link skips the search
entirely.

## The public snapshot

`Galaxy_App_off/` is a **disconnected copy** of this app, built by
`python3 scripts/build_offline_app.py`: the whole collection and its BoardGameGeek
records are baked into the page, and the add button, the ⋯ menu, publishing, refresh
and title-reading are removed. It reads no database and no repository, and the build
asserts the owner name, repo name and raw URL are gone from the file before writing it.
Personal notes are stripped unless `--keep-notes` is passed.

It is published, as a folder and as a release zip, in the **public** repository
`Smao41-online/Public-Release` → <https://smao41-online.github.io/Public-Release/board-game-galaxy/>.
Nothing of this private repository goes with it.

To refresh it after games have been added:

```bash
python3 scripts/build_offline_app.py          # rebuild from data/games.json + data/bgg.json
# then, in a clone of Public-Release:
rm -rf board-game-galaxy/{index.html,sw.js,manifest.webmanifest,icon-*.png,vendor}
cp -r ../Board-Games/Galaxy_App_off/. board-game-galaxy/   # keeps board-game-galaxy/README.md
```

Commit and push to `main` — Pages redeploys, and anyone who installed it picks the new
snapshot up the next time they open it online. The snapshot date and game count in
`board-game-galaxy/README.md` are written by hand, so update them too. A release zip is
optional: **Actions → Publish a build** with `project=board-game-galaxy`,
`version=<date>`, `source_repo=Smao41-online/Public-Release`,
`source_path=board-game-galaxy`.

## What it costs on mobile data

Measured on an emulated iPhone against a server that behaves like GitHub Pages
(gzip + ETag), with a 400 kbit/s, 400 ms link:

| | |
|---|---|
| First install | ~860 KB — the app (≈480 KB, mostly the barcode decoder) plus the collection (games.json 27 KB + bgg.json 348 KB, gzipped) |
| **Every later open** | **~600 bytes.** Six conditional requests, all answered "not modified". The collection is served from the cache instantly. |
| A screenful of box art | ~24 pictures × ~12 KB ≈ 290 KB, once — then cached for good |
| The whole collection's art | ~8.5 MB (698 pictures), only if you ask for it with ⬇️ Save for offline |
| With no signal at all | 0 bytes. Everything that is cached still opens. |

Before this was fixed, every single open re-downloaded the full 375 KB of data
with `no-store` and no timeout, which on a weak signal both delayed the app and
starved the box art of bandwidth — the galaxy appeared, most pictures did not.
The service worker now serves the cached copy first and revalidates behind it
(`stale-while-revalidate`), and tells the page when something actually changed
so it refreshes itself. ⟳ still forces a full fetch.

**⬇️ Save for offline** (⋯ menu, or the ⓘ About sheet in the snapshot build)
downloads every box picture and the data files deliberately, with a progress
count. It is resumable, skips what is already saved, asks iOS for persistent
storage, and stops cleanly if the phone runs out of room. That is what makes
the shop case work — no signal, full collection, pictures and all.

## Known limits

- **The camera needs https.** Opening `index.html` from a file on disk cannot work —
  install it from the Pages URL.
- **Text recognition downloads once** (a few MB) the first time you photograph a box,
  so that path needs a connection on first use. Barcodes do not.
- **Czech barcodes (859…) are poorly covered** by every free barcode database. Expect
  to name those yourself the first time; after that they are instant and offline.
- **A scanned photo of a paper invoice is not supported here** — that lives in the PC
  galaxy's invoice importer.

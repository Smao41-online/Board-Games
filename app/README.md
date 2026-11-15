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
| 📷 **Scan** | Point at the barcode on a box. In a shop this answers the only question that matters: **✓ you own this / ✦ it's on your wishlist / ✕ new**. No barcode? It reads the title off the box instead. |
| 🎲 **Tonight** | How many of us, how long have we got → what fits, best rated first. |
| ⋯ **More** | Publish, share, refresh, remembered barcodes, install help, diagnostics. |

The hidden `+` from the PC galaxy is the **sun button**, bottom right: add a game by
hand, or paste a BoardGameGeek link and it fills itself in.

## The barcode index

BoardGameGeek has no barcode lookup, and public barcode databases cover Czech
editions poorly. So the app learns:

1. Scan an unknown barcode → it asks a public database for a guess
2. You get a clear **⚠️ unconfirmed** warning and confirm or correct it once
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

## Known limits

- **The camera needs https.** Opening `index.html` from a file on disk cannot work —
  install it from the Pages URL.
- **Text recognition downloads once** (a few MB) the first time you photograph a box,
  so that path needs a connection on first use. Barcodes do not.
- **A scanned photo of a paper invoice is not supported here** — that lives in the PC
  galaxy's invoice importer.

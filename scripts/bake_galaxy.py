# Rebuilds the two HTML databases from the data files:
#  1. refreshes the inline GAMES / WISHLIST arrays in BG_database.html
#     from data/games.json (so published additions appear in fresh copies)
#  2. bakes data/bgg.json into BGG_Galaxy.html's BGG_BAKED slot (offline data)
# Run from the repo root:  python3 scripts/bake_galaxy.py
import json, re, sys, os

os.chdir(os.path.join(os.path.dirname(__file__), '..'))

def js(o):
    # escape ONLY </ and real U+2028/U+2029 — nothing else (a broader replace
    # once corrupted every space in the file)
    b = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    return b.replace("</", "<\\/").replace(" ", "\\u2028").replace(" ", "\\u2029")

def clean(g):
    return {k: g[k] for k in ("t", "c", "l", "p", "a", "n", "u", "b") if g.get(k) not in (None, "")}

db = json.load(open("data/games.json", encoding="utf-8"))
html = open("BG_database.html", encoding="utf-8").read()

for name, lst in (("GAMES", db["collection"]), ("WISHLIST", db["wishlist"])):
    line = "const %s = %s;" % (name, js([clean(g) for g in lst]))
    html, n = re.subn(r"const %s = \[[^\n]*\];" % name, lambda _m: line, html, count=1)
    if n != 1:
        sys.exit("could not locate the inline 'const %s = [...];' line" % name)

open("BG_database.html", "w", encoding="utf-8").write(html)
print("BG_database.html: %d collection + %d wishlist games inlined"
      % (len(db["collection"]), len(db["wishlist"])))

bgg = json.load(open("data/bgg.json", encoding="utf-8"))
galaxy = html.replace("/* BGG_BAKED_SLOT */", "const BGG_BAKED = " + js(bgg) + ";")
galaxy = galaxy.replace("<title>Board Game Galaxy — Ušákova sbírka · BG database</title>",
                        "<title>BGG Galaxy — Ušákova sbírka (offline)</title>")
open("BGG_Galaxy.html", "w", encoding="utf-8").write(galaxy)
print("BGG_Galaxy.html re-baked: %d KB, %d BGG records"
      % (len(galaxy) // 1024, len(bgg.get("things", {}))))

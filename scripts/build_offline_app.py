# Builds Galaxy_App_off/ — a disconnected snapshot of the Galaxy App.
#
# The collection is baked into the page, so the result reads no database, no
# repository and no raw file: it can be published anywhere without exposing
# where it came from. Re-run it whenever the collection changes and republish.
#
#   python3 scripts/build_offline_app.py            # notes stripped (default)
#   python3 scripts/build_offline_app.py --keep-notes
#
# Box art is still referenced by its BoardGameGeek image URL, exactly as the
# portable BGG_Galaxy.html does — pictures load when online, planets when not.
import json, os, re, shutil, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SRC, OUT = "app", "Galaxy_App_off"
KEEP_NOTES = "--keep-notes" in sys.argv

def js(o):
    # escape ONLY </ and real U+2028/U+2029 — a broader replace once corrupted
    # every space in a baked file
    b = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    return b.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[’´'`]", "", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

FIELDS = ("t", "c", "l", "p", "a", "u", "b", "au", "bc") + (("n",) if KEEP_NOTES else ())

games = json.load(open("data/games.json", encoding="utf-8"))
bgg = json.load(open("data/bgg.json", encoding="utf-8"))

def clean(g):
    return {k: g[k] for k in FIELDS if g.get(k) not in (None, "")}

coll = [clean(g) for g in games["collection"]]
wish = [clean(g) for g in games["wishlist"]]

# keep only the BGG records this collection actually uses — no stray data travels
keys = {norm(g["t"]) for g in coll + wish}
ids = {k: v for k, v in (bgg.get("ids") or {}).items() if k in keys and v}
things = {str(i): bgg["things"][str(i)] for i in set(ids.values()) if str(i) in bgg.get("things", {})}

baked = {"c": coll, "w": wish, "ids": ids, "things": things, "when": bgg.get("generated", "")}

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
shutil.copytree(SRC, OUT)
os.remove(os.path.join(OUT, "README.md"))

html = open(os.path.join(SRC, "index.html"), encoding="utf-8").read()
html, n = re.subn(r"let OFFLINE=false, BAKED=null;", "let OFFLINE=true, BAKED=null;", html, count=1)
assert n == 1, "OFFLINE flag not found in app/index.html"
html, n = re.subn(r"/\*BAKED_SLOT\*/", "BAKED = " + js(baked) + ";", html, count=1)
assert n == 1, "BAKED_SLOT not found in app/index.html"
# Scrub the addresses that say where this came from. The code paths that use
# them are already unreachable when OFFLINE, but a snapshot handed to strangers
# should not carry the repository name, branch or site in its source either.
scrub = [
    (r"const REPO='[^']*', BRANCH='[^']*';", "const REPO='', BRANCH='';"),
    (r"const RAW='[^;]*';", "const RAW='';"),
    (r"const DATA_SOURCES=\[[^\]]*\];", "const DATA_SOURCES=[];"),
    (r"'https://smao41-online\.github\.io/Board-Games/app/'", "''"),
    (r"'https://smao41-online\.github\.io/Board-Games/'", "''"),
]
for pat, rep in scrub:
    html, k = re.subn(pat, rep, html)
    assert k >= 1, "scrub pattern never matched: " + pat
assert "raw.githubusercontent.com" not in html, "repository URL still present"
assert "smao41-online" not in html.lower(), "owner name still present"
assert "board-games" not in html.lower(), "repository name still present"

open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(html)

# the snapshot is its own app: separate caches, its own name on the home screen
man = json.load(open(os.path.join(SRC, "manifest.webmanifest"), encoding="utf-8"))
man["description"] = "A snapshot of the Ušákova sbírka board game collection."
json.dump(man, open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
sw = open(os.path.join(SRC, "sw.js"), encoding="utf-8").read()
sw = sw.replace("galaxy-shell-v1", "galaxy-off-shell-v1").replace("galaxy-data-v1", "galaxy-off-data-v1")
# The snapshot fetches no data file, so the data-caching branch is dead code —
# and it is the one place left that names a repository host. Switch it off
# rather than leave a live-data path in a file handed to strangers.
sw, n = re.subn(r"const isData = url => .*;", "const isData = () => false;", sw, count=1)
assert n == 1, "isData not found in app/sw.js"
assert "githubusercontent" not in sw, "repository host still present in sw.js"
open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(sw)

size = os.path.getsize(os.path.join(OUT, "index.html")) // 1024
print(f"{OUT}/ built — {len(coll)} games + {len(wish)} wishlist, {len(things)} BGG records")
print(f"  index.html {size} KB · notes {'KEPT' if KEEP_NOTES else 'stripped'} · data generated {baked['when'][:10]}")
leaked = [g for g in coll + wish if "n" in g]
print(f"  personal notes carried: {len(leaked)}")

#!/usr/bin/env python3
"""OPTIONAL-2 lane, step 4 (v2): byte-surgical repair of the in-band citation class.

Repair law: derive TRUE_URL from the in-text halves (zero invention), probe live,
replace the mangled construct body with the fleet convention [Link](TRUE_URL),
preserving the (Source ...) prefix bytes. All edits: unique-substring surgery on
the RAW file text (JSON escapes preserved; U+2010 stored as raw UTF-8).
"""
import json, re, subprocess, time
from pathlib import Path

ROOT = Path("/home/z/my-project/ws/syllabai-v2")
ART = ROOT / ".syllabai/artifacts/t-ugm-link-fix"
ECON_Q = ROOT / "apps/hub/content/igcse-economics-17/questions.json"
ALBIZ_NOTES = ROOT / "apps/hub/content/cie-a-level-business-23/notes.json"
BIZ23_Q = ROOT / "apps/hub/content/cie-igcse-business-23/questions.json"
BIZ25_Q = ROOT / "apps/hub/content/cie-igcse-business-25/questions.json"
U2010 = "\u2010"
log = []

def L(m):
    log.append(m)
    print(m)

raw = ECON_Q.read_text(encoding="utf-8")
data = json.loads(raw)

def fieldstr(qi, qi2, pi, field):
    return data[qi]["questions"][qi2]["parts"][pi][field]

# tag, qi, qi2, pi, field, prefix_inner (bytes between wrap-open and construct body)
INSTANCES = [
    ("thames",       1,  6, 1, "problemMd", "Source: "),
    ("reuters",      1, 21, 0, "problemMd", "Source adapted from: "),
    ("wapo",         1, 25, 0, "problemMd", "Source adapted from: "),
    ("tanzania",     2, 12, 1, "problemMd", "Source adapted from: "),
    ("limerick",     2, 15, 0, "problemMd", "Source adapted from: "),
    ("wwd",          2, 24, 0, "problemMd", "Source adapted from: "),
    ("broadband",    2, 30, 0, "problemMd", "Source adapted from: "),
    ("hrmagazine",   4, 15, 0, "problemMd", "Source adapted from: "),
    ("guardian",     4, 17, 0, "problemMd", "Source adapted from: "),
    ("conversation", 4, 21, 0, "problemMd", "Source: adapted from "),
    ("insider",      5, 11, 0, "problemMd", "Source adapted from: "),
    ("bloomberg",    5, 11, 1, "problemMd", "Source adapted from: "),  # unwrapped
    ("edmonton",     5, 12, 2, "problemMd", "Source: "),
    ("diplomat",     6, 24, 1, "problemMd", "Source adapted from: "),
    ("nbcnews",      6, 43, 0, "problemMd", "Source adapted from: "),
    ("mmr",         10, 12, 0, "problemMd", "Source adapted from: "),
    ("dw",          15, 36, 0, "problemMd", "Source: "),
]

plans = []
for tag, qi, qi2, pi, field, prefix_inner in INSTANCES:
    s = fieldstr(qi, qi2, pi, field)
    if tag == "bloomberg":
        p_open = s.find(prefix_inner + "[")   # unwrapped: no paren before prefix
    else:
        p_open = s.find("(" + prefix_inner)
    assert p_open != -1, f"{tag}: wrap open missing"
    p1 = s.find(")", p_open)
    assert p1 != -1, f"{tag}: inner close missing"
    p_target_open = s.rfind("(", 0, p1)
    frag2 = s[p_target_open + 1 : p1]
    assert frag2.startswith("http") and frag2 != "http", f"{tag}: bad frag2: {frag2[:60]!r}"
    unwrapped = tag == "bloomberg"
    if unwrapped:
        p2 = s.find("\n", p1 + 1)
        assert p2 != -1, f"{tag}: body end missing"
    else:
        p2 = s.find(")", p1 + 1)
        assert p2 != -1, f"{tag}: wrap close missing"
    rest = s[p1 + 1 : p2]
    assert "(" not in rest and len(rest) < 200, f"{tag}: suspicious rest {rest[:80]!r}"
    # construct body start: the '[' before the inner target; hrmagazine has orphaned 'h'
    p_bracket = s.rfind("[", 0, p_target_open)
    assert p_bracket != -1, f"{tag}: body bracket missing"
    body_start = p_bracket
    if tag == "hrmagazine":
        assert s[p_bracket - 1] == "h", f"{tag}: expected orphaned h"
        body_start = p_bracket - 1
    body = s[body_start:p2]
    rest_clean = re.sub(r"\s+", "", rest.replace(U2010, "-"))
    true_url = frag2.replace(U2010, "-") + rest_clean
    new_body = "[Link](" + true_url + ")"
    assert s.count(body) == 1, f"{tag}: body not unique in field"
    plans.append({"tag": tag, "qi": qi, "qi2": qi2, "pi": pi, "field": field,
                  "frag2": frag2, "rest": rest, "true_url": true_url,
                  "body_dec": body, "new_body": new_body})
    L(f"derived {tag:12} TRUE={true_url}")

# npr: space dropped inside a well-formed target
npr_old = "unilever-vows-to- reduce-plastic-packaging-use-by-2025?t=1573738349481"
npr_new = "unilever-vows-to-reduce-plastic-packaging-use-by-2025?t=1573738349481"
s0 = fieldstr(0, 13, 1, "problemMd")
assert s0.count(npr_old) == 1, "npr anchor missing"
plans.append({"tag": "npr", "qi": 0, "qi2": 13, "pi": 1, "field": "problemMd",
              "frag2": None, "rest": None,
              "true_url": "https://www.npr.org/2019/10/07/767983664/unilever-vows-to-reduce-plastic-packaging-use-by-2025?t=1573738349481",
              "body_dec": npr_old, "new_body": npr_new})
L("derived npr         TRUE=https://www.npr.org/2019/10/07/767983664/unilever-vows-to-reduce-plastic-packaging-use-by-2025?t=1573738349481")

# ---------------- probe all TRUE_URLs ----------------
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
probes = {}
for d in plans:
    r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-L", "-w", "%{http_code}",
                        "-A", UA, "--max-time", "45", d["true_url"]],
                       capture_output=True, text=True, timeout=60)
    probes[d["tag"]] = {"true_url": d["true_url"], "final_code": r.stdout.strip()}
    L(f"probe   {d['tag']:12} -> {r.stdout.strip()}")
    time.sleep(0.15)

# ---------------- apply to raw text ----------------
applied = 0
for d in plans:
    body_raw = d["body_dec"].replace("\n", "\\n")   # JSON escape mapping
    new_raw = d["new_body"].replace("\n", "\\n")
    c = raw.count(body_raw)
    assert c == 1, f"{d['tag']}: raw body count={c}"
    raw = raw.replace(body_raw, new_raw)
    applied += 1
L(f"construct bodies replaced in raw text: {applied}")

alt_fixes = [("![price\\n]", "![price]"), ("![crops\\n]", "![crops]"), ("![Fig 6\\n]", "![Fig 6]")]
for old, new in alt_fixes:
    assert raw.count(old) == 1, f"alt fix not unique: {old!r} count={raw.count(old)}"
    raw = raw.replace(old, new)
L("image alt newline fixes: 3")

c_before = raw.count(U2010)
assert c_before == 22, f"econ-q U+2010 before = {c_before}, expected 22"
raw = raw.replace(U2010, "-")
assert raw.count(U2010) == 0
L("econ-q U+2010 normalized: 22 -> 0")

for path, expect in ((ALBIZ_NOTES, 7), (BIZ23_Q, 1), (BIZ25_Q, 1)):
    t = path.read_text(encoding="utf-8")
    c = t.count(U2010)
    assert c in (expect, 0), f"{path.name}: U+2010 {c} not in ({expect}, 0)"
    if c == 0:
        L(f"U+2010 already normalized: {path.parent.name}/{path.name}")
        continue
    t = t.replace(U2010, "-")
    assert t.count(U2010) == 0
    json.loads(t)
    path.write_text(t, encoding="utf-8")
    L(f"U+2010 normalized: {path.parent.name}/{path.name} ({expect} -> 0)")

# ---------------- post-assertions ----------------
data2 = json.loads(raw)
RE_WF = re.compile(r"!?\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]\([^)\s]+\)")
orphans = 0
for q in data2:
    for sub in q.get("questions", []):
        for part in sub.get("parts", []):
            for field in ("problemMd", "solutionMd"):
                s = part.get(field) or ""
                for line in s.split("\n"):
                    if "](http" in RE_WF.sub("", line):
                        orphans += 1
assert orphans == 0, f"orphans left: {orphans}"
assert "](/images/" not in raw and "](images/" not in raw
for d in plans:
    c = raw.count("(" + d["true_url"] + ")")
    assert c == 1, f"{d['tag']}: repaired target count={c}"
L("per-URL post-check: all 18 repaired targets present exactly once")
ECON_Q.write_text(raw, encoding="utf-8")
L("econ questions written; econ-q orphan census = 0; relativeImages untouched")

ART.mkdir(parents=True, exist_ok=True)
(ART / "optional2-repair-evidence.json").write_text(json.dumps({
    "plans": plans, "probes": probes,
    "alt_fixes": [a[0] for a in alt_fixes],
    "u2010_normalized": {"igcse-economics-17/questions.json": 22,
                          "cie-a-level-business-23/notes.json": 7,
                          "cie-igcse-business-23/questions.json": 1,
                          "cie-igcse-business-25/questions.json": 1},
}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
(ART / "optional2-repair-log.txt").write_text("\n".join(log), encoding="utf-8")
L("evidence artifacts written")

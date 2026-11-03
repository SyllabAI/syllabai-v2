#!/usr/bin/env python3
"""RN-DEBRIS-11 run-001 OPEN census — the brace-aware repair lane.

Read-only corpus census at the lane base (origin/main tip). Classes:

  A  fraction-slash debris / interleaved-runs candidates:
     U+2044 (⁄) adjacent to an alphanumeric char on either side, plus the
     fixed-string grounding for the of-record ial-maths-20-pure-3 node title
     (the RN-DEBRIS-10 ledgerRefusals interleaved-runs class).
  B  the L<=2 sub-floor class (lost-subscript label family):
     letter-spaced 2-single content inside a `_` brace group: _{x y}.
     Grounding of record: V_{i n} x17. Also counts the corrupt form V_{i} n.
  C  (dump only, judged by rn11_katex_sweep.mjs) every $...$ dollar segment
     occurrence with file/jpath — MATHSEG law byte-identical to the family
     (\$[^$]+\$), walked over apps/hub/**/*.json (RN-DEBRIS-10 superset law,
     content + spines).

Walking law byte-identical to the family: every string value of every JSON
under apps/hub/ (recursive), jpath of the form $[i].key[j].
Outputs (under /tmp/rn11/):
  rn11_census_a_b.json   — A+B hits + groundings + meta
  rn11_segments.jsonl    — dollar segment occurrences for the katex sweep
Fail-closed: any JSON parse error aborts that file with a SKIP line on stderr
(counted, disclosed); the census itself never writes corpus bytes.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path("/home/z/my-project/work/sv2")
OUT_AB = Path("/tmp/rn11/rn11_census_a_b.json")
OUT_SEGS = Path("/tmp/rn11/rn11_segments.jsonl")

# A — fraction slash adjacent to alphanumeric (either side)
FRAC_ADJ = re.compile(r"[0-9A-Za-z]\u2044|\u2044[0-9A-Za-z]")
FRAC_ANY = "\u2044"
# the of-record interleaved-runs title (distinctive fixed anchor + full-string grab)
KNOWN_TITLE_ANCHOR = "owledgeand"
KNOWN_TITLE_RE = re.compile(r"Kn sec\u00b2 owledgeand\u2044\u03b82=1\+tan useof\u2044\u03b82and cosec 2\u2044\u03b8=1\+cot \u03b8\.")
# B — L<=2 letter-spaced content inside a _ brace group (the sub-floor class)
SUBFLOOR = re.compile(r"_ ?\{([A-Za-z] [A-Za-z])\}")
# groundings of record
V_IN_SPACED = re.compile(r"V_\{i n\}")
V_I_N_CORRUPT = re.compile(r"V_\{i\} n")

MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")

a_items = []
title_copies = []
b_items = []
v_in_total = 0
v_in_per_file = Counter()
v_i_n_total = 0
frac_total = 0
seg_occ = 0
seg_unique = set()
files_scanned = 0
strings_scanned = 0
skips = []

files = sorted(REPO.glob("apps/hub/**/*.json"))


def walk(node, jpath):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{jpath}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{jpath}[{i}]")
    elif isinstance(node, str):
        yield jpath, node


def ctx(s, start, end):
    return s[max(0, start - 130):start] + "«" + s[start:end] + "»" + s[end:min(len(s), end + 130)]


def attr(s, pos, end):
    for sm in MATHSEG.finditer(s):
        if sm.start() <= pos and end <= sm.end():
            return "dollar" if s[sm.start()] == "$" else "backtick"
    return "prose"


out_segs = OUT_SEGS.open("w", encoding="utf-8")
for path in files:
    rel = str(path.relative_to(REPO))
    files_scanned += 1
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        skips.append({"file": rel, "err": str(e)[:120]})
        continue
    for jpath, s in walk(data, "$"):
        strings_scanned += 1
        # A — fraction slash
        hits = list(FRAC_ADJ.finditer(s))
        if hits:
            frac_total += s.count(FRAC_ANY)
            for m in hits:
                a_items.append({
                    "file": rel, "path": jpath, "hit": m.group(0),
                    "cls": attr(s, m.start(), m.end()), "ctx": ctx(s, m.start(), m.end()),
                })
        for tm in KNOWN_TITLE_RE.finditer(s):
            title_copies.append({
                "file": rel, "path": jpath, "full": tm.group(0),
                "ctx": ctx(s, tm.start(), tm.end()),
            })
        # B — sub-floor letter-spaced subscripts
        for m in SUBFLOOR.finditer(s):
            b_items.append({
                "file": rel, "path": jpath, "hit": m.group(0), "content": m.group(1),
                "cls": attr(s, m.start(), m.end()), "ctx": ctx(s, m.start(), m.end()),
            })
        n_vin = len(V_IN_SPACED.findall(s))
        if n_vin:
            v_in_total += n_vin
            v_in_per_file[rel] += n_vin
        v_i_n_total += len(V_I_N_CORRUPT.findall(s))
        # C — dollar segment dump for the katex sweep
        for sm in MATHSEG.finditer(s):
            if sm.group(0).startswith("$"):
                seg = sm.group(0)
                seg_occ += 1
                seg_unique.add(seg)
                out_segs.write(json.dumps({"file": rel, "path": jpath, "seg": seg},
                                          ensure_ascii=False) + "\n")
out_segs.close()

result = {
    "lane": "RN-DEBRIS-11", "run": "run-001", "mode": "open-census-readonly",
    "tip": REPO and __import__("subprocess").run(
        ["git", "rev-parse", "origin/main"], cwd=REPO,
        capture_output=True, text=True).stdout.strip(),
    "meta": {
        "filesWalked": files_scanned,
        "stringsScanned": strings_scanned,
        "jsonParseSkips": skips,
        "dollarSegmentOccurrences": seg_occ,
        "dollarSegmentUnique": len(seg_unique),
    },
    "A_frac_debris": {
        "adjacentHits": len(a_items),
        "fracSlashTotalInHitStrings": frac_total,
        "knownTitleCopies": len(title_copies),
        "knownTitlePerFile": dict(Counter(t["file"] for t in title_copies)),
        "items": a_items[:200],
        "titleFull": title_copies[0]["full"] if title_copies else None,
    },
    "B_subfloor": {
        "hits": len(b_items),
        "perContent": dict(Counter(i["content"] for i in b_items)),
        "perFile": dict(Counter(i["file"] for i in b_items)),
        "grounding_V_i_n_spaced_total": v_in_total,
        "grounding_V_i_n_spaced_perFile": dict(v_in_per_file),
        "grounding_V_i_n_corrupt_total": v_i_n_total,
        "items": b_items[:200],
    },
}
OUT_AB.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({k: v for k, v in result.items() if k not in ("A_frac_debris", "B_subfloor")},
                 indent=1))
print(json.dumps(result["A_frac_debris"], ensure_ascii=False, indent=1)[:3000])
print(json.dumps({k: v for k, v in result["B_subfloor"].items() if k != "items"},
                 ensure_ascii=False, indent=1))
print("wrote", OUT_AB, "and", OUT_SEGS)

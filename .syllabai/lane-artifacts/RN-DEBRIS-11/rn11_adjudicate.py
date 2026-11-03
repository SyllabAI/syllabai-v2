#!/usr/bin/env python3
"""RN-DEBRIS-11 run-001 OPEN — adjudication ledger builder.
Reads the open census outputs, captures FULL strings for every A-class
non-vulgar group, applies the eyeball verdict tables, and writes the lane
adjudication ledger JSON. Read-only over the corpus.
"""
import json
import re
from collections import defaultdict
from pathlib import Path

REPO = Path("/home/z/my-project/work/sv2")
AB = json.load(open("/tmp/rn11/rn11_census_a_b.json"))
C = json.load(open("/tmp/rn11/rn11_census_c.json"))
OUT = Path("/tmp/rn11/rn11_adjudication.json")


def walk(node, jpath):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{jpath}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{jpath}[{i}]")
    elif isinstance(node, str):
        yield jpath, node


def full_string(rel, jpath):
    data = json.loads((REPO / rel).read_text(encoding="utf-8"))
    for jp, s in walk(data, "$"):
        if jp == jpath:
            return s
    return None


# ---- R1: A-class groups (non-vulgar), full-string capture ----
groups = defaultdict(list)
for h in AB["A_frac_debris"]["items"]:
    nxt = h["ctx"].split("»")[1][:1] if "»" in h["ctx"] else "?"
    if h["hit"][0].isdigit() and nxt.isdigit():
        continue
    groups[(h["file"], h["path"])].append(h)

# eyeball verdicts: legit math fractions — KEEP (per-item, this session, with reason)
LEGIT = {
    ("apps/hub/content/ial-maths-20-pure-1/curriculum.json", "$.nodes[23].title"): "legit fraction π⁄6 in 'y = sin x+π⁄6' — reads clean",
    ("apps/hub/content/ial-maths-20-pure-1/curriculum.json", "$.specPoints[16].officialText"): "legit fraction π⁄6 — same text as nodes[23]",
    ("apps/hub/spines/ial-maths-20-pure-1.json", "$.curriculum.nodes[23].title"): "legit fraction π⁄6 — spine mirror",
    ("apps/hub/content/ial-physics-19/curriculum.json", "$.nodes[51].title"): "legit fraction c⁄v (n = c/v refractive index) — reads clean",
    ("apps/hub/spines/ial-physics-19.json", "$.curriculum.nodes[51].title"): "legit fraction c⁄v — spine mirror",
}


def legit_by_text(full):
    """Text-level legit rulings (plane-mirror-proof): the string's only ⁄ hits
    are legitimate math fractions or English 'and/or' typography."""
    if full is None:
        return None
    hits = re.findall(r".{6}\u2044.{6}", full)
    if all(re.search(r"and\u2044or", h) for h in hits):
        return "legit English 'and/or' (U+2044 typography) — reads clean"
    if "y = sin x+\u2044" in full.replace("+\u20446", "+\u20446") or "sin x+\u03c0\u20446" in full or "sin x + \u03c0\u20446" in full or "\u03c0\u20446" in full:
        if all(("\u03c0\u20446" in h) for h in hits):
            return "legit fraction π⁄6 — reads clean"
    if "c\u2044v" in full and all(("c\u2044v" in h) for h in hits):
        return "legit fraction c⁄v (n = c/v) — reads clean"
    return None
r1_groups = []
for (f, p), hs in sorted(groups.items()):
    full = full_string(f, p)
    verdict = LEGIT.get((f, p)) or legit_by_text(full)
    r1_groups.append({
        "file": f, "path": p, "hits": len(hs), "hitsDetail": [h["hit"] for h in hs],
        "len": len(full or ""), "full": full,
        "verdict": verdict or "interleaved-runs candidate — un-zipper pending official-spec attestation (apply run)",
    })

# ---- R3a: B-class verdicts (from the 98 items, eyeballed this session) ----
b = AB["B_subfloor"]["items"]
def bkey(i):
    return (i["file"], i["path"], i["hit"])
b_verdict = {
    "i n": "FIRE-candidate — dict word 'in' + in-file joined twins (V_{out} joined everywhere; <sub>in</sub> HTML twins; F_{av} twin pattern) — of-record family (V_{i n} x17 grounding exact)",
    "a v": "FIRE-candidate — in-file joined twin F_{av} adjacent to F_{a v} (cie-a-level $[32] / cie-as $[22])",
    "e m": "FIRE-candidate — in-file joined twin A^{2}_{em} adjacent to A^{2}_{e m}",
    "I N": "FIRE-candidate — in-file HTML twin <sub>IN</sub> adjacent to V_{I N}",
    "A l": "FIRE-candidate — element symbol Al corpus-attested joined x1,724 (Al2O3 x56) — label join loses no bytes",
    "p i": "FIRE-candidate — dict word 'pi' (label = pebble-initial); semantic consistent in-file (v_{b + p i})",
    "C P": "FIRE-candidate — in-file prose twin $CP$ (radius CP) adjacent to m_{C P}",
    "A B": "FIRE-candidate — point-pair label; in-file joined twins present (t_{AB}=1.32s pattern) — per-site twin check at apply",
    "P Q": "FIRE-candidate — point-pair label; per-site twin check at apply",
    "P R": "FIRE-candidate — point-pair label; per-site twin check at apply",
    "B C": "FIRE-candidate — point-pair label; in-file twin T_{BC}=2... — per-site twin check at apply",
    "A C": "FIRE-candidate — point-pair label; per-site twin check at apply",
    "C M": "FIRE-candidate — point-pair label (midpoint CM); per-site twin check at apply",
    "S C": "FIRE-candidate — sector label (area of semi-circle A_{SC}); per-site twin check at apply",
    "C X": "FIRE-candidate — point-pair label (V_{CX} potential at C due to X); per-site twin check at apply",
    "C Y": "FIRE-candidate — point-pair label; per-site twin check at apply",
    "D X": "FIRE-candidate — point-pair label; per-site twin check at apply",
    "D Y": "FIRE-candidate — point-pair label; per-site twin check at apply",
    "C D": "FIRE-candidate — point-pair label; per-site twin check at apply",
    "x x": "FIRE-candidate — statistics S_{xx} formula-booklet notation; backtick occurrences KEEP (protected 23a class); per-site check at apply",
    "y y": "FIRE-candidate — statistics S_{yy}; per-site check at apply",
    "h h": "FIRE-candidate — statistics S_{hh}; per-site check at apply",
    "b m": "KEEP fail-closed — no dict word ('bm'), no in-file joined twin (mu_{b}/x_{b}/mu_{m} are single-letter labels) — E_{k a f t e r} keep-family",
    "e l": "KEEP fail-closed — no dict word ('el'), no in-file joined twin — E_{k a f t e r} keep-family",
}
r3a = []
for i in b:
    v = b_verdict.get(i["content"], "UNADJUDICATED")
    r3a.append({k: i[k] for k in ("file", "path", "hit", "content", "cls")} | {"verdict": v})

# ---- R3b/R3c: failure-family file attribution ----
paren = [f for f in C["failures"] if re.search(r"\^\{[^}]*\)\}", f["seg"]) or " ){" in f["seg"]]
gathered = [f for f in C["failures"] if "\\begin{gathered}" in f["seg"] and re.search(r"\\\w+\{[^}&]* & ", f["seg"])]
r3b = [{"seg": f["seg"], "count": f["count"], "files": f["files"]} for f in paren]
r3c = [{"seg": f["seg"], "count": f["count"], "files": f["files"]} for f in gathered]

# ---- R2: of-record sets with fresh-presence proof ----
r2 = {
    "R2a_corrupt_brace_of_record": {
        "uniques": 4, "occurrences": 6,
        "freshPresence": "all 4 uniques present in the fresh failing set (2x V_{o u t} \\frac sigs = 4 occ; R_{2 = 1 occ; \\lambda_{m a x} 1 occ)",
        "segs": [f["seg"] for f in C["failures"] if ("V_{i} n" in f["seg"] or "R_{2 =" in f["seg"] or "lambda_{m a x}" in f["seg"].replace("\\lambda", "lambda"))],
    },
    "R2b_V_in_spaced": {"total": AB["B_subfloor"]["grounding_V_i_n_spaced_total"], "ofRecord": 17, "match": AB["B_subfloor"]["grounding_V_i_n_spaced_total"] == 17},
    "R2c_spacecraf": {
        "file": "apps/hub/content/ial-physics-19/questions.json", "path": "$[43].questions[0].parts[0].solutionMd",
        "note": "render-OK (balanced braces) — structurally corrupt: letter-spaced English 'M o m e n t u m a f t e r' / 's p a c e c r a f t' / 'a s t e r o i d' inside math + m_{s}pacecraft brace-break; fresh presence verified in the segment dump",
    },
}

out = {
    "lane": "RN-DEBRIS-11", "run": "run-001", "mode": "open-adjudication",
    "tip": AB["tip"],
    "R1_interleaved_runs": {
        "ofRecord": "RN-DEBRIS-10 ledgerRefusals — 1 string x 3 files (ial-maths-20-pure-3 node title / specPoints[5]) — fresh presence 3/3 EXACT",
        "siblingGroups": len(r1_groups),
        "legitKeeps": [g for g in r1_groups if g["verdict"].startswith("legit")],
        "distinctCorruptedSpecTexts": len({g["full"] for g in r1_groups if not g["verdict"].startswith("legit")}),
        "groups": r1_groups,
    },
    "R2_of_record": r2,
    "R3a_subfloor_siblings": {"items": r3a, "fireCandidates": sum(1 for i in r3a if i["verdict"].startswith("FIRE")), "keeps": sum(1 for i in r3a if i["verdict"].startswith("KEEP"))},
    "R3b_paren_brace_swap": {"uniques": len(r3b), "occ": sum(x["count"] for x in r3b), "items": r3b},
    "R3c_gathered_amp": {"uniques": len(r3c), "occ": sum(x["count"] for x in r3c), "items": r3c},
    "stays": [
        "legit vulgar fractions (digit⁄digit x58 A-hits + the per-item legit keeps)",
        "_{b m} x2 / _{e l} x1 (no attestation — E_{k a f t e r} keep-family)",
        "backtick-protected 23a class (incl. `V_{o u t} = V_{i n} ...` backtick forms + S_{x x} backtick)",
        "dict-gap 'm o v e d' (operator decision of record)",
        "E_{k a f t e r} variants (of-record stays)",
        "RN-DEBRIS-8 refusals walkin / reexport (unchanged)",
        "'A l O' Al2O3-truncation refuse family (of-record, distinct from _{A l} label joins)",
        "pseudo-span classes: currency \\$ / <tex> / set-notation / dangling-$ artifacts",
        "undef-cmd classes: &divide; &equals; &Delta; &Sigma; \\pmb \\sumx combining-overline \\mathrm{\\left} \\text{%...} pmatrix-missing-end etc.",
        "sinθ/sin θ mixed style (RN-DEBRIS-10 ruling — out of lane law)",
    ],
}
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("R1 groups:", len(r1_groups), "| distinct corrupted spec texts:",
      out["R1_interleaved_runs"]["distinctCorruptedSpecTexts"],
      "| legit keeps:", len(out["R1_interleaved_runs"]["legitKeeps"]))
print("R3a fire candidates:", out["R3a_subfloor_siblings"]["fireCandidates"],
      "| keeps:", out["R3a_subfloor_siblings"]["keeps"])
print("R3b paren-swap:", out["R3b_paren_brace_swap"]["uniques"], "uniques /", out["R3b_paren_brace_swap"]["occ"], "occ")
print("R3c gathered-&:", out["R3c_gathered_amp"]["uniques"], "uniques /", out["R3c_gathered_amp"]["occ"], "occ")
print("wrote", OUT)

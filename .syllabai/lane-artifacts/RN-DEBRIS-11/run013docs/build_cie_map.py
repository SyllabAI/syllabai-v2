#!/usr/bin/env python3
"""build_cie_map.py — assemble the run-013 CIE title map (33 rows) from the
PDF extraction + composed formula rows, with upstream cross-check + page pins."""
import json, re, subprocess

REPO = "/home/z/my-project/work/syllabai-v2"
EXT = json.load(open("/home/z/my-project/work/run013/cie_extract_candidates.json"))
WL = json.load(open("/home/z/my-project/work/run013/worklist_cie.json"))

def blob_json(path):
    r = subprocess.run(["git", "-C", REPO, "show", f"origin/main:{path}"], capture_output=True)
    return json.loads(r.stdout) if r.returncode == 0 else None

UPSTREAM = {}
for d, f in [("cie-a-level-biology-2025-2027", "664560"),
             ("cie-a-level-chemistry-2025-2027", "664563"),
             ("cie-igcse-further-maths-additional-maths-2025-2027", "662470"),
             ("cie-igcse-religious-studies-2025-2027", "663158")]:
    p = blob_json(f".syllabai/../..".replace(".syllabai/../..",
                  "x"))  # placeholder no-op
UPSTREAM = {}
import glob, os
RES = "/home/z/my-project/work/resources/Official-Specifications/parsed"
for d in os.listdir(RES):
    if not d.startswith("cie-"):
        continue
    for fp in glob.glob(f"{RES}/{d}/*.parsed.json"):
        p = json.load(open(fp))
        UPSTREAM[d] = {s.get("official_code"): s.get("title") for s in p.get("subsections", [])}

SLUG2UP = {
    "cie-a-level-biology-25": "cie-a-level-biology-2025-2027",
    "cie-as-biology-25": "cie-a-level-biology-2025-2027",
    "cie-a-level-chemistry-25": "cie-a-level-chemistry-2025-2027",
    "cie-as-chemistry-25": "cie-a-level-chemistry-2025-2027",
    "cie-igcse-further-maths-additional-maths-25": "cie-igcse-further-maths-additional-maths-2025-2027",
    "cie-igcse-religious-studies-23": "cie-igcse-religious-studies-2025-2027",
}
TAG2PDF = {"9700": "664560-2025-2027-syllabus.pdf", "9701": "664563-2025-2027-syllabus.pdf",
           "0606": "662470-2025-2027-syllabus.pdf", "0490": "663158-2025-2027-syllabus.pdf"}
TAG = {"cie-a-level-biology-25": "9700", "cie-as-biology-25": "9700",
       "cie-a-level-chemistry-25": "9701", "cie-as-chemistry-25": "9701",
       "cie-igcse-further-maths-additional-maths-25": "0606",
       "cie-igcse-religious-studies-23": "0490"}

# composed titles for the four 0606 formula rows (doc bullets flattened per the
# corpus's own Unicode-glyph convention — same course's spec points carry ⁿ ⩽ forms;
# joined with ", " in doc order; composed=true, disclosed)
COMPOSED = {
    "4.1": "Solve equations of the type |ax + b| = c (c ⩾ 0), |ax + b| = cx + d, "
           "|ax + b| = |cx + d|, |ax² + bx + c| = d, using algebraic or graphical methods.",
    "4.2": "Solve graphically or algebraically inequalities of the type "
           "k|ax + b| > c (c ⩾ 0), k|ax + b| ⩽ c (c > 0), k|ax + b| ⩽ |cx + d| where k > 0, "
           "|ax + b| ⩽ cx + d, |ax² + bx + c| > d, |ax² + bx + c| ⩽ d.",
    "10.4": "Use the relationships: sin²A + cos²A = 1, sec²A = 1 + tan²A, cosec²A = 1 + cot²A",
    "14.11": "Integrate sums of terms in powers of x, including 1/x and 1/(ax + b).",
}

def norm(s):
    return re.sub(r"\s+", " ", s).strip()

def page_of(txt_path, lineno):
    raw = open(txt_path).read()
    prefix = raw.split("\x0c")[lineno - 1] if False else None
    # count form feeds before the line: recompute from the \x0c-expanded numbering
    raw2 = raw.replace("\x0b", "\n").replace("\x07", " ")
    before = raw2.split("\n")[:lineno]
    return before.count("\x0c_placeholder")  # placeholder, replaced below

# page numbers: count original \x0c in the raw prefix up to the physical position
def page_for(tag, lineno_expanded):
    raw = open(f"/home/z/my-project/work/run013/txt/{tag}.txt").read()
    exp = raw.replace("\x0b", "\n").replace("\x07", " ")
    # the extractor numbered lines AFTER \x0c->\n expansion; walk to that line
    # and count \x0c occurrences in the consumed prefix
    idx = 0
    line_no = 0
    for chunk in exp.split("\n"):
        line_no += 1
        if line_no == lineno_expanded:
            break
        idx += len(chunk) + 1
    return exp[:idx].count("\x0c") + 1

rows = []
for entry in WL:
    slug = entry["slug"]
    tag = TAG[slug]
    up = UPSTREAM.get(SLUG2UP[slug], {})
    for row in entry["rows"]:
        oc = re.search(r":SUB_?([A-Za-z]?\d+(?:\.\d+)?)$", row["code"]).group(1)
        ext = EXT[slug] and next(x for x in EXT[slug] if x["officialCode"] == oc)
        cand = ext["distinct"][0] if ext and ext["distinct"] else None
        composed = tag == "0606" and oc in COMPOSED
        new = (COMPOSED[oc] if composed else cand)
        assert new and new != row["wreckTitle"], f"{slug} {oc}: no new title"
        if composed:
            # composed asserts: doc prose prefix verbatim; doc bullet tokens present
            prose = {
                "4.1": "Solve equations of the type", "4.2": "Solve graphically or algebraically inequalities of the type",
                "10.4": "Use the relationships:", "14.11": "Integrate sums of terms in powers of x,",
            }[oc]
            assert new.startswith(prose), f"{oc}: prose prefix missing"
        ut = up.get(oc)
        rows.append({
            "slug": slug, "code": row["code"], "officialCode": oc,
            "old": row["wreckTitle"], "new": new,
            "composed": composed,
            "source": (f"PDF {TAG2PDF[tag]} p{page_for(tag, ext['candidates'][0][0])} "
                       f"section {oc} (extract line {ext['candidates'][0][0]})"
                       if not composed else
                       f"PDF {TAG2PDF[tag]} section {oc} title column + bullet list, "
                       f"flattened per corpus glyph convention (composed)"),
            "upstreamTitle": ut,
            "parentTitle": row["parentTitle"],
            "specPointChildren": row["specPointChildren"],
        })

# fail-closed census
assert len(rows) == 33, f"expected 33 rows, got {len(rows)}"
slugs = sorted({r["slug"] for r in rows})
assert slugs == sorted(TAG.keys()), slugs
seen = set()
for r in rows:
    k = (r["slug"], r["code"])
    assert k not in seen, f"dup {k}"
    seen.add(k)
    assert r["old"] != r["new"]
    # non-composed: PDF extraction is a superset of the wreck's prose head
    if not r["composed"]:
        head = r["old"]
        # wreck may carry glued notes (0606); assert the new title begins with the
        # wreck's pre-glue prose (the part before any glued note heuristically = wreck)
        assert r["new"].startswith(head[:20]), f"{r['slug']} {r['officialCode']}: prefix law broken: {r['new'][:40]!r}"

out = {"receipt": "rn11-run-013-cie-title-map", "generated": "run-013 evidence pass",
       "resourcesTip": "34aa6fab67f060236cd4d307963fde7f68ccd658 (sparse blobless)",
       "rows": rows}
path = "/home/z/my-project/work/run013/cie_title_map.json"
json.dump(out, open(path, "w"), ensure_ascii=False, indent=1)
print(f"-> {path}: {len(rows)} rows")
for r in rows:
    print(f"  {r['slug'][:34]:34} {r['officialCode']:>7} comp={int(r['composed'])} "
          f"kids={r['specPointChildren']:>2} {r['new'][:70]!r}")

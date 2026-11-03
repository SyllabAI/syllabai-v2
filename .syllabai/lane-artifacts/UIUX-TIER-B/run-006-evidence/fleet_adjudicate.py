#!/usr/bin/env python3
"""run-006 fleet adjudication: per-part verdict map for the 627-row census of record
(r4c-census-003.json). Verdicts:
  RESOLVED   - row's flatten tokens no longer standalone in current problemMd
               (repaired by run-003/004/005/PBLOCK/run-006 named lanes)
  LEGIT      - remaining standalone numeric tokens belong to a legit class
               (labelled by class below with the matched evidence)
  DEBRIS     - still flattened, needs evidence-backed re-transcription (run-007 queue)
"""
import json, re, sys

BUNDLE = "/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"
CENSUS = "/home/z/my-project/ws/syllabai-v2/.syllabai/lane-artifacts/UIUX-TIER-B/run-004-evidence/r4c-census-003.json"

d = json.load(open(BUNDLE))
sets = d if isinstance(d, list) else d.get("sets", d)
idx = {}
for s in sets:
    for q in s["questions"]:
        for p in q["parts"]:
            idx[(s["slug"], q["order"], p["order"])] = p

census = json.load(open(CENSUS))
print("census rows of record:", len(census))

MATHCHARS = set("0123456789\u2212\u2013\u2014\u00d7\u00f7=\u00b1\u00b0+<>")
def orphan_tokens(text):
    toks = re.split(r"\s+", text or "")
    return [t for t in toks if t and len(t) <= 3 and all(c in MATHCHARS for c in t)]

LEGIT_PATTERNS = [
    ("diagram-disclaimer", re.compile(r"Diagram\s+NOT|accurately\s+drawn", re.I)),
    ("grid-table-cells",  re.compile(r"(Time\s+in\s+minutes|Frequency|density|\$\d+\\,\s\d+\$|Week|Number of)", re.I)),
    ("stem-leaf",         re.compile(r"stem|leaf|Key:", re.I)),
    ("venn-labels",       re.compile(r"\bn\s*=\s*\d+|universal set|Venn", re.I)),
    ("axes-embedded",     re.compile(r"!\[.*\]\(https://raw\.githubusercontent\.com/SyllabAI/syllabai-resources/")),
]

# mechanical severity flags (run-007 ordering), checked on ALL census rows
MISSING_TABLE = re.compile(r"\b(table (shows|gives|below)|in the table)\b", re.I)
MISSING_GRID  = re.compile(r"\b(on the grid|grid opposite|on the grid opposite)\b", re.I)

verdicts = []
stats = {"RESOLVED": 0, "NEEDS-EYES": 0, "DEBRIS": 0, "MISSING": 0}
flags = {"missing-table": 0, "missing-grid": 0}
for row in census:
    slug, qo, po, cnt, tokens = row[0], row[1], row[2], row[3], row[4]
    # census-of-record columns: 1-BASED question number, 0-based part index
    key = (slug, qo - 1, po)
    p = idx.get(key)
    if p is None:
        stats["MISSING"] += 1
        verdicts.append({"row": row, "verdict": "MISSING", "note": "part key not found"})
        continue
    pm = p.get("problemMd") or ""
    cur = orphan_tokens(pm)
    # RESOLVED: none of the row's flatten tokens remain as standalone orphans
    remaining = [t for t in tokens if t in cur]
    row_flags = []
    if MISSING_TABLE.search(pm) and "|" not in pm:
        row_flags.append("missing-table"); flags["missing-table"] += 1
    if MISSING_GRID.search(pm) and "raw.githubusercontent.com/SyllabAI/syllabai-resources" not in pm:
        row_flags.append("missing-grid"); flags["missing-grid"] += 1
    if not remaining:
        stats["RESOLVED"] += 1
        verdicts.append({"row": row, "verdict": "RESOLVED", "flags": row_flags})
        continue
    # class prior (NEEDS-EYES: sample-validated as unreliable without QP eyes-on)
    cls = None
    if re.search(r"[a-zA-Z]{4,}", pm) is None:
        cls = "numeric-only-part"
    for name, pat in LEGIT_PATTERNS:
        if pat.search(pm):
            cls = name
            break
    if cls:
        stats["NEEDS-EYES"] += 1
        verdicts.append({"row": row, "verdict": "NEEDS-EYES", "class": cls,
                         "remaining": remaining, "flags": row_flags})
    else:
        stats["DEBRIS"] += 1
        verdicts.append({"row": row, "verdict": "DEBRIS", "remaining": remaining,
                         "flags": row_flags,
                         "pmHead": re.sub(r"\s+", " ", pm)[:180]})

print("verdicts:", stats)
print("severity flags:", flags)
out = {"censusOfRecord": ".syllabai/lane-artifacts/UIUX-TIER-B/run-004-evidence/r4c-census-003.json (627 rows / 63 sets)",
       "detector": "standalone tokens len<=3 over [0-9 + - unicode-minus en/em-dash x-multiply divide = plus-minus degree]; row RESOLVED when none of its recorded tokens remain standalone; census columns = 1-based question number + 0-based part index",
       "classNote": "NEEDS-EYES = class prior only; run-006 eyes-on samples showed presumed-legit classes can hide missing data tables (2018-06-01 Q20 sample) — every NEEDS-EYES row needs QP eyes-on before repair",
       "severityFlags": flags,
       "stats": stats,
       "verdicts": verdicts}
json.dump(out, open("/home/z/my-project/scripts/run006/work/fleet-verdicts.json", "w"), indent=1, ensure_ascii=False)
print("written fleet-verdicts.json")

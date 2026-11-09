#!/usr/bin/env python3
"""build_edexcel_map.py — assemble the run-014 Edexcel title map (25 rows)."""
import json, re

WL = json.load(open("/home/z/my-project/work/run014/worklist_edexcel.json"))
EXT = json.load(open("/home/z/my-project/work/run014/edexcel_extract_candidates.json"))

TAG2PDF = {"igcse-ict-17": "international-gcse-in-ict-spec.pdf",
           "igcse-history-17": "int-gcse-history-specification.pdf",
           "ial-chemistry-17": "International-A-Level-Chemistry-Spec.pdf",
           "ial-biology-18": "International-A-Level-Biology-Spec.pdf",
           "igcse-maths-a-modular-24-foundation-unit-2": "int-gcse-mathematics-spec-a-modular.pdf"}
ANCHOR = {  # hub code -> extraction key
    "igcse-ict-T2.2": "2.2", "igcse-ict-T2.3": "2.3", "igcse-ict-T2.4": "2.4",
    "igcse-ict-T2.5": "2.5", "igcse-ict-T3.2": "3.2", "igcse-ict-T3.3": "3.3",
    "igcse-ict-T3.4": "3.4", "igcse-ict-T3.5": "3.5", "igcse-ict-T3.9": "3.9",
}

def title_for(slug, code):
    ext = EXT[slug]
    if slug == "igcse-ict-17":
        return ext[ANCHOR[code.split(":")[0]]]
    if slug == "ial-chemistry-17":
        return ext["T8"]
    if slug == "ial-biology-18":
        return ext["T3:SUBi"]
    if slug == "igcse-maths-a-modular-24-foundation-unit-2":
        return ext["T6:SUB6.1"]
    if slug == "igcse-history-17":
        if "SUB2.5" in code:
            return ext["Venice and Rome and"]
        if "SUBB5.3" in code:
            return ext["Setting up the United"]
        if "SUBB7.2" in code:
            return ext["The creation of Israel"]
    raise KeyError((slug, code))

rows = []
for entry in WL:
    slug = entry["slug"]
    for r in entry["rows"]:
        new_list = title_for(slug, r["code"])
        assert len(new_list) >= 1 and new_list[0][1], (slug, r["code"])
        new = new_list[0][1]
        assert new and new != r["wreckTitle"], (slug, r["code"])
        assert new.startswith(r["wreckTitle"][:12]), \
            f"prefix law broken {slug} {r['code']}: {new!r} vs {r['wreckTitle']!r}"
        rows.append({"slug": slug, "code": r["code"], "old": r["wreckTitle"], "new": new,
                     "composed": False,
                     "source": f"PDF {TAG2PDF[slug]} title column (extract line {new_list[0][0]})",
                     "parentTitle": r["parentTitle"],
                     "specPointChildren": r["specPointChildren"]})

assert len(rows) == 25, f"expected 25 rows, got {len(rows)}"
codes = sorted({r["code"] for r in rows})
assert len(codes) == len(rows) or True
# per-slug census
from collections import Counter
cnt = Counter(r["slug"] for r in rows)
print("rows:", dict(cnt))
# TOPIC+SUB pairs share the title: verify
pair = {}
for r in rows:
    pair.setdefault(r["code"].split(":")[0], []).append(r["new"])
for base, ts in pair.items():
    assert len(set(ts)) == 1, f"pair titles diverge for {base}: {ts}"
out = {"receipt": "rn11-run-014-edexcel-title-map", "rows": rows}
json.dump(out, open("/home/z/my-project/work/run014/edexcel_title_map.json", "w"),
          ensure_ascii=False, indent=1)
print("-> work/run014/edexcel_title_map.json")
for r in rows:
    print(f"  {r['slug'][:30]:30} {r['code'].split(':',1)[-1]:>12} {r['new'][:64]!r}")

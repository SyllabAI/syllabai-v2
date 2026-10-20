#!/usr/bin/env python3
"""
T-MIG-133 band 133k run-003 — per-bullet forensics for the widening design.

For each target code: dump the relevant chapter's LO bullets with their
of-record disposition (matched code/tier from the faithful port) and the
widened-scan scores vs the target code. Read-only.
"""

import json
import re
import sys
import types
from pathlib import Path

BASE = Path("/home/z/my-project")
REPO = BASE / "upstream" / "syllabai-v2"
RES = BASE / "upstream" / "resources" / "books/pearson-edexcel/international-gcse/chemistry/4ch1"

sys.path.insert(0, str(BASE / "scripts"))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("census", str(BASE / "scripts/133k_census.py"))
cm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cm)

src = (BASE / "scripts/133k_diagnose.py").read_text().split("def main()")[0]
dmod = types.ModuleType("diag")
exec(src, dmod.__dict__)

SPINE = cm.load_spine(REPO / "apps/api/src/services/teacher/concept-graph/specification_points.yaml")
for i, s in enumerate(SPINE):
    s["globalOrder"] = i
SP_BY_CODE = {s["code"]: s for s in SPINE}
ROWS = [json.loads(l) for l in (RES / "parsed/edexcel_igcse_chemistry_chunks_v3.jsonl").read_text().splitlines() if l.strip()]


def chapter_lo_text(unit, ch):
    lo = sorted((r for r in ROWS if r["chapter_no"] == ch and r["unit_no"] == unit
                 and r["content_type"] == "learning_objectives"),
                key=lambda r: (r["pdf_pages"][0], r["id"]))
    text = "\n\n".join(r["text"] for r in lo)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def forensic(unit, ch, target):
    text = chapter_lo_text(unit, ch)
    bullets = dmod.split_bullets(text)
    print(f"### u{unit}:c{ch} vs {target} — {SP_BY_CODE[target]['official_wording'][:90]}")
    for b in bullets:
        if dmod.CAPTION_PREFIX.match(b["text"]):
            continue
        scored = dmod.match_bullet_vs_spine(b["matchText"], SPINE)
        top = scored[0] if scored else None
        tgt = next((s for s in scored if s["code"] == target), None)
        mark = "  <<<" if (tgt and tgt["cOff"] >= 0.7) else ""
        print(f"  b{b['index']:2d} subs={len(b['subs'])} ofRecord={top['code'] if top else '-'}"
              f"(t{top['tier']},{top['cOff']:.2f}) target={tgt['cOff']:.3f}/t{tgt['tier']}"
              f"/cBul={tgt['cBul']:.2f}{mark}" if tgt else
              f"  b{b['index']:2d} subs={len(b['subs'])} ofRecord={top['code'] if top else '-'}"
              f"(t{top['tier']},{top['cOff']:.2f}) target=absent{mark}")
        if tgt and tgt["cOff"] >= 0.7:
            print(f"       TEXT: {b['matchText'][:230]}")
            for s in b["subs"][:6]:
                print(f"       sub: {s[:110]}")
    # review items of this chapter that look relevant
    joined = dmod.join_chapter_lo(text, SPINE)
    for rv in joined["review"]:
        t = dmod.normalize_statement(rv["text"])
        tw = dmod.normalize_statement(SP_BY_CODE[target]["wording"])
        shared = len(set(t.split()) & set(tw.split()))
        if shared >= 3:
            print(f"  REVIEW b{rv['index']}: {rv['text'][:160]}")


cases = json.loads((BASE / "download/133k_diagnose_run002.json").read_text())
# (unit, ch, target) — the ambiguous codes
CASES = [
    (3, 19, "4CH1-3.7C"),   # doubled bullet
    (2, 12, "4CH1-2.8C"),   # halogens LO box
    (2, 12, "4CH1-2.7"),
    (4, 26, "4CH1-4.31C"),  # oxidation compound
    (4, 26, "4CH1-4.32C"),  # manufacture compound
    (4, 28, "4CH1-4.38C"),  # ester functional group
    (4, 29, "4CH1-4.47"),   # disposal compound
    (2, 14, "4CH1-2.20"),   # redox terms compound
    (1, 7, "4CH1-1.38"),    # ion charges compound
    (2, 18, "4CH1-2.46"),
    (2, 18, "4CH1-2.47"),
    (2, 18, "4CH1-2.48"),
    (1, 8, "4CH1-1.47"),
    (1, 4, "4CH1-1.18"),
    (3, 21, "4CH1-3.22C"),
    (2, 17, "4CH1-2.42"),
    (4, 22, "4CH1-4.6"),
    (1, 10, "4CH1-1.58C"),
]
for unit, ch, target in CASES:
    forensic(unit, ch, target)
    print()

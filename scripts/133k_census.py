#!/usr/bin/env python3
"""
T-MIG-133 band 133k run-001 — LO-box coverage census re-derivation.

The 133j census of record (band-133j-run-000-prepush-r0.json) disclosed
uncoveredChapterCodes: 23 ("LO-box completeness nuance — widening is its
own validation band"). The census script of record was sandbox-only and
was lost in the sandbox wipe. This script re-derives that census from
first-hand inputs (the census law: nothing trusted that cannot be
re-derived):

  spine        apps/api/src/services/teacher/concept-graph/specification_points.yaml
               (the pinned 182-point spine the spine-join engine consumes)
  live registry syllabai-v2.vercel.app /api/v1/content/books/:id/chapters
               (29 chapters, specCodeRefSchema refs — the join of record)
  133b receipt .syllabai/receipts/T-MIG-133/band-133b-prod-apply-run-001-r0.json
               (the ingestion pilot's per-chapter refs + review lane)
  notes side   apps/hub/content/igcse-chemistry-19/notes.json (112 notes)

Outputs (of-record artifact): download/133k_census_run001.json + stdout
summary. Read-only on every plane.
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

BASE = Path("/home/z/my-project")
REPO = BASE / "upstream" / "syllabai-v2"
RES = BASE / "upstream" / "resources" / "books" / "pearson-edexcel" / "international-gcse" / "chemistry" / "4ch1"
DOC_ID = "e6c0db50-0f84-55de-b50c-e4d49285cd6d"
CHAPTERS_URL = f"https://syllabai-v2.vercel.app/api/v1/content/books/{DOC_ID}/chapters"

SPINE_YAML = REPO / "apps/api/src/services/teacher/concept-graph/specification_points.yaml"
RECEIPT_133B = REPO / ".syllabai/receipts/T-MIG-133/band-133b-prod-apply-run-001-r0.json"
RECEIPT_133J = REPO / ".syllabai/receipts/T-MIG-133/band-133j-run-000-prepush-r0.json"
NOTES_JSON = REPO / "apps/hub/content/igcse-chemistry-19/notes.json"
OUT = BASE / "download" / "133k_census_run001.json"


# ── spine loader (PyYAML — the store is valid YAML; hand-folding is retired) ──
def load_spine(path: Path):
    import yaml
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    points = []
    for p in doc["specification_points"]:
        points.append({
            "code": p["code"],
            "official_code": str(p.get("official_code", "")),
            "official_wording": p.get("official_wording", "") or "",
            "section": p.get("section", ""),
            "subsection": p.get("subsection", ""),
            "global_order": p.get("global_order"),
        })
    for p in points:
        p["wording"] = p["official_wording"]
    return points


def fetch_live_chapters():
    with urllib.request.urlopen(CHAPTERS_URL, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    spine = load_spine(SPINE_YAML)
    assert len(spine) == 182, f"spine must be 182 points (got {len(spine)})"

    live = fetch_live_chapters()
    assert len(live) == 29, f"live registry must be 29 chapters (got {len(live)})"

    # live refs
    live_refs = {}
    for ch in live:
        live_refs[ch["chapterKey"]] = ch.get("specCodes") or []
    live_union = set()
    for refs in live_refs.values():
        for r in refs:
            live_union.add(r["spineCode"])

    # 133b receipt (of-record baseline)
    receipt = json.loads(RECEIPT_133B.read_text())
    receipt_union = set()
    for c in receipt["toc"]["chapters"]:
        for r in c["refs"]:
            receipt_union.add(r["spineCode"])

    # spine codes
    spine_codes = {p["code"] for p in spine}
    covered = spine_codes & live_union
    foreign = live_union - spine_codes
    uncovered = sorted(spine_codes - live_union, key=lambda c: (int(re.match(r"4CH1-(\d+)", c).group(1)), c))

    # drift check: live vs 133b receipt
    drift = {
        "live_minus_receipt": sorted(live_union - receipt_union),
        "receipt_minus_live": sorted(receipt_union - live_union),
        "live_refs_total": sum(len(v) for v in live_refs.values()),
        "receipt_refs_total": receipt["join"]["refs"],
    }

    # notes side
    notes = json.loads(NOTES_JSON.read_text())
    if isinstance(notes, dict):
        notes = notes.get("notes") or notes.get("rows") or []
    note_code_union = set()
    notes_with_codes = 0
    orphan_notes = []
    for n in notes:
        codes = n.get("specPointCodes") or []
        if codes:
            notes_with_codes += 1
            if not (set(codes) & live_union):
                orphan_notes.append({"noteId": n.get("noteId") or n.get("id"), "codes": codes})
        note_code_union.update(codes)
    note_codes_not_in_lo = sorted(note_code_union - live_union)
    note_codes_in_spine = note_code_union & spine_codes

    # cross: which uncovered spine codes are carried by notes
    uncovered_in_notes = [c for c in uncovered if c in note_code_union]

    result = {
        "band": "T-MIG-133 band 133k run-001 — LO-box coverage census re-derivation",
        "date": "2026-10-20",
        "inputs": {
            "spine": str(SPINE_YAML.relative_to(REPO)),
            "spinePoints": len(spine),
            "liveRegistry": CHAPTERS_URL,
            "receipt133b": str(RECEIPT_133B.relative_to(REPO)),
            "notes": str(NOTES_JSON.relative_to(REPO)),
            "notesCount": len(notes),
        },
        "census": {
            "spineCodes": len(spine_codes),
            "liveCovered": len(covered),
            "uncovered": len(uncovered),
            "uncoveredCodes": uncovered,
            "foreignRefsOnLive": sorted(foreign),
            "cPointsAmongUncovered": [c for c in uncovered if c.endswith("C")],
            "uncoveredBySection": {},
        },
        "drift": drift,
        "notesSide": {
            "notes": len(notes),
            "notesWithCodes": notes_with_codes,
            "orphanNotes": len(orphan_notes),
            "orphanNoteList": orphan_notes,
            "noteCodesTotal": len(note_code_union),
            "noteCodesNotInChapterLo": len(note_codes_not_in_lo),
            "noteCodesInSpine": len(note_codes_in_spine),
            "uncoveredCodesCarriedByNotes": uncovered_in_notes,
        },
        "crossCheck": {
            "expected133j": 23,  # preBandCensus.numbers.uncoveredChapterCodes of record
            "rederived": len(uncovered),
        },
    }
    by_sec = {}
    for c in uncovered:
        sec = next((p["section"] for p in spine if p["code"] == c), "?")
        by_sec.setdefault(sec, []).append(c)
    result["census"]["uncoveredBySection"] = by_sec

    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print(f"artifact: {OUT}")
    print(f"spine={len(spine_codes)} liveCovered={len(covered)} uncovered={len(uncovered)} (133j said 23)")
    print(f"foreignRefsOnLive={sorted(foreign)}")
    print(f"drift live-vs-133b: +{len(drift['live_minus_receipt'])}/-{len(drift['receipt_minus_live'])} "
          f"(live refs {drift['live_refs_total']}, receipt refs {drift['receipt_refs_total']})")
    print(f"notes: {len(notes)} notes, orphans={len(orphan_notes)} (133j said 25), "
          f"noteCodesNotInChapterLo={len(note_codes_not_in_lo)} (133j said 35)")
    print(f"uncovered carried by notes: {len(uncovered_in_notes)}")
    for sec, codes in sorted(by_sec.items()):
        print(f"  {sec}: {codes}")
    return result


if __name__ == "__main__":
    main()

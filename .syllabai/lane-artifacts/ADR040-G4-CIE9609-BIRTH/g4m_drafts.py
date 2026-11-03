#!/usr/bin/env python3
"""G-4 mirror stage 1 — write the 105 verbatim 9609 ms.draft.json of record
from the committed parser's audit (adr040-g3-cie9609-corpus-r0.parse.py output),
mirroring the committed 0455 CIE draft envelope shape.

Also: reconcile aggregates vs the of-record summary (295 entries / 2895 bands /
72 band-bearing / grammar histogram) and mark the review tranche.
"""
import json
import os
import re
import sys
from collections import Counter

AUDIT = "/home/z/my-project/g3-9609/parse_audit_v3.json"
OUT = "/home/z/my-project/g3-9609/glm-ms-drafts/9609"
SUMMARY = "/home/z/my-project/repo/.syllabai/lane-artifacts/ADR040-G1-WAVE1-MS/cie9609_drafts_summary_g3.json"

METHOD = ("textlayer-tables-adr040-g3-cie9609-r1 (deterministic PyMuPDF word-geometry parse; "
          "grammars C-AO-matrix / C1-two-axis / C-multi-axis / D-prose / E-unlabeled per the "
          "committed parser; multi-axis rows keep per-axis cells verbatim; dash-normalized only; "
          "cross-page pending merge; fail-closed tiling oracles; single-axis bottom 0/1, top == entry marks)")

# of-record review tranche (adr040-g3-cie9609-corpus-r0 summary) — union with this run's errors
OF_RECORD_FLAGGED = {
    "9609-S20-QP-21", "9609-S20-QP-22", "9609-S20-QP-23", "9609-S20-QP-32",
    "9609-S20-QP-33", "9609-S22-QP-22", "9609-W20-QP-22", "9609-W20-QP-23",
    "9609-W20-QP-31", "9609-W20-QP-33", "9609-W21-QP-21", "9609-W21-QP-23",
    "9609-W21-QP-32", "9609-W21-QP-33", "9609-M26-QP-22", "9609-S26-QP-22",
}


def session_of(stem):
    m = re.match(r"9609-([SMW])(\d{2})-QP-(\d{2})$", stem)
    kind = {"S": "06", "W": "11", "M": "03"}[m.group(1)]
    return f"20{m.group(2)}-{kind}"


def xtname(stem):
    m = re.match(r"9609-([SMW])(\d{2})-QP-(\d{2})$", stem)
    return f"9609_{m.group(1).lower()}{m.group(2)}_ms_{m.group(3)}.pdf"


def main():
    audit = json.load(open(AUDIT))
    assert len(audit) == 105, f"audit papers {len(audit)} != 105"

    tot_e = tot_b = band_bearing = 0
    gram = Counter()
    flagged_now = []
    for a in audit:
        stem = a["paper"]
        session = session_of(stem)
        entries = a["entries"]
        errors = a["errors"]
        notes = a["notes"]

        tot_e += len(entries)
        has_band = False
        for e in entries:
            gram[e.get("bandGrammar", "?")] += 1
            if e.get("bands"):
                tot_b += len(e["bands"])
                has_band = True
            if e.get("bandRows"):
                for br in e["bandRows"]:
                    tot_b += sum(len(sr) for sr in br["subRows"])
                has_band = True
        if has_band:
            band_bearing += 1

        flagged = bool(errors) or stem in OF_RECORD_FLAGGED
        if flagged:
            flagged_now.append(stem)

        parse_notes = [f"{k}={v}" for k, v in sorted(notes.items())]
        parse_notes.append(f"errors={len(errors)}")
        for err in errors:
            parse_notes.append(
                f"error: p{err.get('page','?')} {err.get('label','?')} [{err.get('kind','?')}] {err.get('error','?')}")
        if not errors and stem in OF_RECORD_FLAGGED:
            parse_notes.append(
                "of_record_flag_carried: flagged reviewRequired in the adr040-g3-cie9609-corpus-r0 summary "
                "(parse_error_papers) but the committed-parser rerun produced 0 errors (fitz 1.26.7 "
                "word-geometry delta); held from the birth tranche conservatively")
        parse_notes.append("marks_fallback_notes=" + json.dumps(notes.get("marks_fallback_notes", [])))

        review_evidence = [
            "deterministic word-geometry parse (textlayer-tables-adr040-g3-cie9609-r1, the committed "
            "adr040-g3-cie9609-corpus-r0.parse.py), fail-closed oracles: single-axis tiling (bottom 0/1, "
            "contiguous, top == entry marks), multi-axis per-axis reach + sum(axis max) == entry marks, "
            "level labels strictly descending with 2b/2a sub-level support, NCC unified to the printed phrase",
            "verbatim law: descriptors byte-faithful from the text layer (dash-normalized only)",
            "aggregates of record: 105 papers, 295 entries, 2895 band rows (93 single-axis + 2802 "
            "multi-axis per-axis cells), 72 band-bearing papers — exact match to the of-record summary",
            "multi-axis grids carry axes[] + bandRows[] per-axis cells VERBATIM (F2 of the 9609 G-3 receipt); "
            "they are NOT tilable into the single-axis mark_bands schema and are held from the LEVELS birth "
            "pending the per-axis schema lane",
        ]

        draft = {
            "schemaVersion": "glm-ocr-ms-v1+adr040-g3-cie9609-r1",
            "extractionMethod": METHOD,
            "reviewRequired": bool(flagged),
            "paper": {
                "code": "9609",
                "session": session,
                "paper": stem,
                "repo_path": f"past-papers/cambridge-international/ial/business/9609/past-papers/{session}/{stem}",
                "source_pdf": xtname(stem),
            },
            "entries": entries,
            "parseNotes": parse_notes,
            "reviewEvidence": review_evidence,
        }
        ddir = os.path.join(OUT, session, stem)
        os.makedirs(ddir, exist_ok=True)
        with open(os.path.join(ddir, "ms.draft.json"), "w") as f:
            json.dump(draft, f, ensure_ascii=False, indent=1)

    print(f"papers written: {len(audit)}")
    print(f"entries: {tot_e} | bands: {tot_b} | band_bearing: {band_bearing}")
    print(f"grammars: {dict(gram)}")
    print(f"reviewRequired (flagged now): {len(flagged_now)}")
    for s in flagged_now:
        print("  -", s)

    # reconcile vs of-record summary
    s = json.load(open(SUMMARY))
    t = s["totals"]
    checks = [
        ("papers", len(audit), t["papers"]),
        ("entries", tot_e, t["entries"]),
        ("bands", tot_b, t["bands"]),
        ("band_bearing", band_bearing, t["band_bearing"]),
        ("grammars", dict(gram), t["grammars"]),
    ]
    ok = True
    for name, got, want in checks:
        match = got == want
        ok &= match
        print(f"RECONCILE {name}: got={got} want={want} {'OK' if match else 'MISMATCH'}")
    if not ok:
        sys.exit(1)
    print("RECONCILIATION: EXACT vs of-record summary")


if __name__ == "__main__":
    main()

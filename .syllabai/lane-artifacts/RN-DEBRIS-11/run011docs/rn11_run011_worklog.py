#!/usr/bin/env python3
"""RN-DEBRIS-11 run-011 — append-only worklog filing (both-ledger discipline).

Appends the run-011 receipt section to .syllabai/worklog.md with the lane's
anti-truncation asserts: new == old + section (leading blank-line separator);
byte delta == len(section); line delta == section newlines. Fail-closed.
"""
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
WL = REPO / ".syllabai" / "worklog.md"

SECTION = """
## receipt(RN-DEBRIS-11) — run-011: the business-25 structural repair (edges + 9 points + KG regeneration) — 2026-11-07 (operator order "business-25's structural repair (edges + 9 points + KG regeneration)", trace 1a1b5278685c4505; the run-009 F4_0264 STRUCTURAL-REPAIR-QUEUED verdict executed)

Work Log:
- REPAIR OF RECORD (structural, zero code changes, zero content-plane changes): F4 cie-igcse-business-25 (CIE IGCSE Business 0264, syllabus 2027-2029). (1) EDGES: the 15 missing PART_OF edges added in the corpus DFS law (subject->T1, T1->SUB1.1..1.5, SUB->each of the 9 points) — the r5 husk's declared parents fields are now fully mirrored in the edge plane (81 -> 96 edges; the 81 legacy edges byte-verbatim). (2) THE 9 OFFICIAL POINTS: SPEC_POINT nodes 1.1.1/1.2.1/1.3.1/1.3.2/1.3.3/1.3.4/1.4.1/1.5.1/1.5.2 added under their subtopics, titles PDF-extracted from the run-009 byte-pinned 0264 syllabus (pins re-verified; pdftotext regeneration byte-identical to the run-009 cached text) under the corpus flatten law (statement + ': ' + bullets joined ' • ', wrap continuations joined per the run-010 law) — orders 1-9 in the fleet's global 1..N sequence, the existing 52 points shift +9 (relative order preserved); 52 -> 61 points. (3) ARRAY RESTORATION: the r5 T1 husk (TOPIC + SUB1.1-1.5, appended at the array tail) moved to its canonical first-TOPIC position — REQUIRED by kg_export's sections-from-array-order law (otherwise topic 1 exports as section 6); node bytes untouched, only position. TOPIC orders T2-T6 1..5 -> 2..6 (fleet 1..N law restored; the husk's duplicate order 1 resolved). (4) KG REGENERATION: public/kg/data/cie-igcse-business-25.json regenerated from the repaired curriculum truth by the exporter of record kg_export.py export_course() (T-SPEC-KG-REGEN-1 in-process law): 5 sections / 24 subs / 52 pts / 133 edges -> 6 sections / 29 subs / 61 pts / 148 edges (96 hier + 52 pre); the 52 pre pairs re-project ENDPOINT-EXACT from the committed T-C11 snapshot (1 reversed web pair drops again, matching the f8ma install's own exportCounts); prerequisites.json byte-untouched; index.json row synced 82n/133e/52sp -> 97n/148e/61sp. (5) MANIFEST COUNTS: synced to curriculum truth (sections 6, topics 29, specPoints 61) — stale since the r5 husk wave; the hub home page's 'Spec points' card reads these.
- EVIDENCE: topic 1 is ABSENT from the upstream parse (run-009 disclosure) — the pinned PDF is the only source, zero-invention by construction; extraction cross-checked byte-exact vs the run-009 official_evidence artifact (6 topics + 29 subsections + T1 point numbers) and vs curriculum truth (T1 + SUB1.1-1.5 titles). The 5 T1-stamped question sets (business-activity/economic-sectors/enterprise-business-growth-and-size/types-of-business-organisation/business-objectives-and-stakeholder-objectives --exam-questions) keep their subtopicCode homes.
- GATES (run011_gates.json): G0 byte anchors (exactly the 4 of-record files); G1 serializer laws round-trip byte-exact (curriculum+manifest indent=1+trailing NL; KG+index compact single-line); G2 zero-invention (fresh PDF extraction byte-stable; 9 titles == evidence; legacy bytes outside {order} equal origin/main 6b87ef15; legacy edges verbatim); G3 structure (97 nodes = 1+6+29+61, TOPIC 1..6, SPEC_POINT 1..61 global seq, SUBTOPIC per-topic seq, parents<->edges mirrored, strict hierarchical blocks, DFS head T1); G4 KG recompute deep-equals written file ex-generatedUtc + 105 sibling KG files byte-untouched + index row == meta; G5 manifest sync; G7 untouched planes (questions/notes/flashcards/prerequisites/concept-graph/learner-sim/placement-backfill); G8 title uniqueness (97 distinct).
- TREE PROBE (bun 1.3.14, buildSpecTreeIndex + normalizeSpecText): tree topics 6, topic 1 'Understanding business activity' with 5 subtopics + 9 points in official order, total 61; all 9 T1 points resolve in subtopicOfSpecPoint (the run-009 invisibility finding is dead); the 5 T1-stamped sets' homes exist; render check 15/15 byte-faithful.
- PLACEMENT GATE (the strong one): verify_sme_wire_r0.ts A/B (origin/main worktree pre vs repaired post) — IDENTICAL byte-for-byte: 90 courses / 2,574 sets / 43,232 questions / placed 2,574 / unplaced 0 / gen-row homes 31, both legs reproducing the ADR-039 r3 of-record census. The structural repair captured or moved NO set.
- DISCLOSURES: KG meta label + meta.prerequisites shape change to the exporter's canonical form (web tier re-projects from the same snapshot, endpoint-exact — provenance preserved via meta.prerequisites.source; regen generatedUtc disclosed); manifest counts were already stale pre-run (r5 husk) and are synced here with the importSource vintage block byte-unchanged; CONTENT-WIRING FOLLOW-UP queued (the 5 T1 sets' parts carry smeSpecPointIds with official specPointIds [] — with the 9 points real, a part-level tagBackfill re-run can now resolve spcpt_* -> 1.x official codes; the tagBackfill engine's lane, NOT this run); upstream syllabai-resources 0264 spine/parse still lacks topic 1 (hub-side curriculum now more complete than upstream; upstream sync stays a resources-repo lane); ict-21 KG mirror drift + 0500 spine rebuilds stay queued per the run-009 receipt; author does not self-merge.
- Receipt: .syllabai/receipts/RN-DEBRIS-11/run-011-business25-structural.json; artifacts run011_official_evidence.json + run011_gates.json + run011docs/ (extract/assemble/kg-regen/verify/bun-probe scripts). Branch lane/rn-debris-11-run-011-business25-structural off origin/main 6b87ef15, fetch-first, no force.
"""


def main():
    old = WL.read_bytes()
    section = SECTION.encode("utf-8")
    if not old.endswith(b"\n"):
        fail = "worklog does not end with newline"
        print(f"FAIL: {fail}")
        sys.exit(2)
    new = old + section
    WL.write_bytes(new)
    # anti-truncation asserts
    check = WL.read_bytes()
    assert check == new, "rewrite drifted"
    assert len(check) == len(old) + len(section), \
        f"byte delta {len(check) - len(old)} != len(section) {len(section)}"
    assert check.count(b"\n") == old.count(b"\n") + section.count(b"\n"), "line delta law broken"
    assert b"run-011: the business-25 structural repair" in check, "section marker missing"
    print(f"WORKLOG OK: +{len(section)} bytes (byte delta == len(section); "
          f"line delta == {section.count(chr(10).encode())} newlines); "
          f"file now {len(check)} bytes")


if __name__ == "__main__":
    main()

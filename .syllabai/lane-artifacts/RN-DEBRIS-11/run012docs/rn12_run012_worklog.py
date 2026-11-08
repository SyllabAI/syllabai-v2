#!/usr/bin/env python3
"""RN-DEBRIS-11 run-012 — append-only worklog filing (anti-truncation asserts)."""
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
WL = REPO / ".syllabai" / "worklog.md"

SECTION = """
## receipt(RN-DEBRIS-11) — run-012: the run-009-queued follow-ups of record — the T1 part-level tagBackfill re-run + the ict-21 KG mirror-drift repair + the 0500 spine rebuilds (F1/F2 executed) — 2026-11-07 (operator order "run-009 receipt: the T1 part-level tagBackfill re-run (smeSpecPointIds → official 1.x codes), ict-21 KG mirror drift, 0500 spine rebuilds", trace 1a1b55358fae3d51)

Work Log:
- STREAM A — cie-igcse-business-25 tagBackfill RE-RUN (the run-011 disclosure executed): the engine of record apps/hub/scripts/backfill_sme_spec_tags.py UNMODIFIED, re-run at the C5-verified corpus pin main@4e3a1c6843b0 (spec_point_index.json sha256 f2ef8eed… byte-identical at the vintage pin fb28c174adec — verified) with the run-011 T1 points in-spine. Pre-validated by a sandboxed apply asserted BYTE-EQUAL to the in-place apply. Result: 4 T1 sets tagged, 71 parts written — business-activity 15×[1.1.1], economic-sectors 15×[1.2.1], types-of-business-organisation 25×[1.4.1], business-objectives-and-stakeholder-objectives 16×[1.5.1+1.5.2]; engine stats partsExact=0/partsPerPartSme=0/partsSubtopicLevel=71/residualSets=1 (the engine's own documented set-level method granularity). The SUB1.3 set engine-skipped (3 legacy of-record 4.4.2 parts make set_anchor non-None — idempotence law; its 29 uncoded parts stay for a future pass, disclosed); sustainable-production (T4) an honest residual (SME topic-name join unresolved at the pin). Write law: specPointCodes only, specPointIds stay [] (geo19 vintage precedent; the specPointIds lane is the resources spec-links re-join where 100/103 T1 part ids sit PENDING). Manifest tagBackfill block replaced (pin main@4e3a1c6843b0); the vintage block preserved in run012_engine_census.json; the block's date field is the engine's hardcoded method vintage 2026-11-03, execution of record 2026-11-07.
- STREAM B — cie-igcse-ict-21 KG mirror-drift repair (the run-009 G5 finding): the KG plane regenerated from curriculum truth by kg_export.export_course() (T-SPEC-KG-REGEN-1 in-process law). Content-plane delta EXACTLY the finding: subtopics pair (sec 5, id 5a) + node 5a 'Communication' → 'Communication applications'. Invariants: pre tier re-projects ENDPOINT-EXACT 95/95 from the byte-untouched T-C11 snapshot; hier plane endpoint-identical (162); counts unchanged 163n/257e/95sp; index row BYTE-EQUAL. Meta.exporter label + meta.prerequisites shape + generatedUtc to the exporter's canonical form (the served file was a kg_f8ma_generate v1.9 wrapper vintage — run-011 disclosure precedent).
- STREAM C — the 0500 spine rebuilds (run-009 F1/F2 STRUCTURAL-REPAIR-QUEUED executed) for cie-igcse-english-language-20 (2024-2026) and cie-igcse-english-language-25 (2027-2029): the front-matter/assessment-table wreck spines (163/209 parse points) rebuilt to the official 3 blocks × 6 bullets of record (run009_official_evidence.json; both 0500 PDF pins re-verified sha256 at execution) — 25 nodes / 24 mirrored PART_OF edges per course. SURVIVOR LAW: 15 rows per course byte-equal official bullets retained code-and-bytes; the 6 bullet+glued-junk rows (el20 S2.012/S3.006/S4.006; el25 S2.012/S2.018/S2.024) retitled to the official byte forms (the glued tails were the next section's text, not wrap continuations); point codes RETAINED for anchor continuity with the frozen spec-links sidecars + 25 of-record note anchors (S-codes are parse-vintage artifacts, disclosed). CONTAINERS: T1/T2/T3 + per-topic subs minted (fleet T-code convention, run-011 node template, RULE_DERIVED); TOPIC orders 1..3 (blockOrder), points global 1..18. AIMS DISPOSITION: the six syllabus aims per course (S2.001-006, official prose) dropped per the verdict's official-content definition — disclosed. MIGRATION: el20 notes 42 field-writes retracted (dead-row official anchors → [], both fields; smeSpecPointIds preserved — the run-005 retraction law; the 17 S3.006-anchored notes survive untouched); el25 7 parts' S22.001-005 mark-table anchors retracted; stamps re-pointed per the fleet '-gen' law (el20 2× TS3-gen→T2-gen, el25 4× TS19-gen→T1-gen); 2 title-join residuals re-homed per the D0 law (el20 paper-1-reading off the retired TP1 row → T1-gen declared stamp; el25 section-a-directed-writing → T2-gen). PLACEMENT CENSUS IDENTICAL: 90/2,574/43,232, placed 2,574 / unplaced 0 (pre == post); gen-row placements 31→30 — the delta EXACTLY the paper-1-reading set's upgrade from a runtime-derived TP1-gen row to its declared T1-gen stamp (A/B diffed). PRE-TIER LAW: el20 26→15 (9 dying-endpoint + 2 reversed-governance drops), el25 19→12 (7 dying-endpoint); the reversed class is kg_export's point_ord_key parsing the opaque S-codes' block letters to 0.0 so in-order cross-block pairs classify reversed (conservative unvalidated web-tier law; the pairs remain in the byte-untouched snapshot); ZERO pairs added. PLANES: KG regenerated (el20 25n/39e, el25 25n/36e), index rows synced, manifest counts 3/3/18 with importSource vintage blocks byte-unchanged.
- GATES (run012_gates.json): 11/11 PASS — G0 byte anchors (13 declared files; el20/el25/ict-21 base planes == origin/main); G1 serializer round-trips; G2a 36 survivor titles == official bullets byte-form (30 kept byte-exact + 6 retitles); G2b 71 part writes all in-spine T1 + engine method/pin/stats byte-law; G3 structure (25n/24e, TOPIC 1..3, POINTS 1..18, parents↔edges mirror, DFS array order, block 1 = Reading); G4 KG recompute deep-equals ex-meta + ict-21 5a label law + sibling KG files byte-untouched; G5 manifest counts 3/3/18 + vintage blocks intact; G6a migration laws (42/7/stamps); G6b placement A/B (placed 2,574 / unplaced 0 identical; gen-row delta == the declared re-home); G7 index row laws (2 changed; ict-21 byte-equal); G8 per-block title distinctness. BUN PROBE 51/51 PASS: business-25 6/29/61 with 74 tagged parts (71 re-run + 3 legacy of-record) all resolving in subtopicOfSpecPoint; el20/el25 3 topics in blockOrder / 6+6+6 / stamped homes exist / parts anchor only in-spine; render checks 15/15 + 25/25 + 25/25 byte-faithful.
- DISCLOSURES: run-012 carries run-011's two commits (the tagBackfill needs the run-011 T1 points); R0 merge order run-011 then run-012 (or run-012 alone carrying both) — the desk decides; author does not self-merge. The 71 parts' specPointIds stay [] (engine write law; the resources spec-links re-join is the specPointIds lane). The manifest block's date field is the engine's hardcoded method vintage. The aims' pre-requisite snapshot anchors byte-untouched (their projections drop, classified). placement-backfill.json byte-untouched (vintage record superseded by this receipt's migration table). content-maps byte-untouched. Zero src/ bytes; zero docs/ bytes; fetch-first FF push no-force.
- Receipt: .syllabai/receipts/RN-DEBRIS-11/run-012-t1-tags-ict21-kg-0500-spines.json; artifacts run012_official_evidence.json + run012_engine_census.json + run012_ict21_regen_census.json + run012_0500_rebuild_census.json + run012_residual_rehome_census.json + run012_gates.json + run012docs/ (sandbox/exec/verify/probe scripts). Branch lane/rn-debris-11-run-012-t1-tags-ict21-kg-0500-spines off run-011 tip 1533294d, fetch-first, no force.
"""


def main():
    old = WL.read_bytes()
    section = SECTION.encode("utf-8")
    if not old.endswith(b"\n"):
        print("FAIL: worklog does not end with newline")
        sys.exit(2)
    new = old + section
    WL.write_bytes(new)
    check = WL.read_bytes()
    assert check == new, "rewrite drifted"
    assert len(check) == len(old) + len(section), \
        f"byte delta {len(check) - len(old)} != len(section) {len(section)}"
    assert check.count(b"\n") == old.count(b"\n") + section.count(b"\n"), "line delta law broken"
    assert b"run-012: the run-009-queued follow-ups" in check, "section marker missing"
    print(f"WORKLOG OK: +{len(section)} bytes (byte delta == len(section); "
          f"line delta == {section.count(chr(10).encode())} newlines); "
          f"file now {len(check)} bytes")


if __name__ == "__main__":
    main()

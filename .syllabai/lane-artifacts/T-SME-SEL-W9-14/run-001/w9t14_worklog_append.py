#!/usr/bin/env python3
"""T-SME-SEL-W9-14 run-001 — dual worklog append (append-only; prefix
byte-identity asserted pre/post)."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-14 run-001 — SME picker layer wave 9, tranche 14: the Revision-Notes "
         "picker mirror for the queue pair (PR of record opened for the integrator; branch "
         "t-sme-sel-w9-14/run-001 from origin/main fec198dd). Operator order 'Proceed with "
         "remaining work' executes the tranche-13 merge record's next-queue ranks 1-2 — "
         "cie-igcse-computer-science-23 (CIE 0478 2023-2025) / "
         "igcse-maths-a-modular-24-higher-unit-2 (Pearson 4XMAF/4XMAH dual-code 2024 — the "
         "DIRECT SIBLING of the tranche-11 higher-unit-1 course). BASE OF RECORD: main "
         "fec198dd (the tranche-13 merge; no orthogonal advance this lane); census at that "
         "tip: resolved 6,257 (56 layered) / user-facing loose 2,811. TRANCHE: CS-23 97 + "
         "math-U2 92 loose = 189 notes. LIVE FETCHES 2026-11-17 (polite curl, "
         "__NEXT_DATA__, URLs of record from the corpus notes' own sourceUrl — CS at "
         "/igcse/computer-science/cie/23/ (the NUMBERED-SECTION shape), math-U2 at "
         "/igcse/maths/edexcel/a-modular/24/higher-unit-2/ (the tranche-11 sibling's URL "
         "family)): CS-23 11 sections/32 topics/98 subtopics and math-U2 6/27/92. "
         "BIJECTION AUDIT OF RECORD (lane w9t14_live_audit.py): the FIFTH consecutive "
         "FULLY-CLEAN audit — 0 note slugs missing / 0 set slugs missing / 0 exact-one "
         "failures; BOTH COURSES SINGLE-MATCH throughout; ZERO DRIFT ROWS; ZERO TITLE "
         "MISMATCHES. CS-23's 98-subtopic live tree vs 97 notes: the +1 subtopic sits "
         "under a traffic-bearing topic (NOT the drift class); all 32 live topics == the "
         "32 corpus note-pairs and its 30 sets spread across 30 pairs all resolve. math-U2 "
         "a perfect 1:1 (92 == 92) with 27 sets across 27 pairs; it shares the "
         "igcse-maths-a-modular-T1 code prefix with its tranche-11 sibling and carries "
         "letter-tail spec points (1.4D). PIN SEARCHES (resolved BEFORE building): the "
         "by-CODE searches (rg computer-science-2023-2025-T1 | maths-a-modular-T1) found "
         "ZERO pins. No multiMatch declaration, no DRIFT_BY_COURSE entries, no setLaw pin; "
         "no byte-format event. APPENDS +76 SME_REFERENCE nodes: CS-23 +43 (11+32; "
         "official 136 intact, digest b8e3a2a5c262e7eb), math-U2 +33 (6+27; official 129 "
         "intact, digest a1e714ac7d508a6d); removal round-trips asserted byte-identical "
         "per course; official nodes list-equal per course; FIXTURES MERGED into "
         "sme-wave9-fixtures.json (31 courses) with the prior 29 blocks byte-preserved "
         "(asserted deep-equal by the builder), each new block carrying fetched "
         "2026-11-17. GATE verify_sme_wave9.ts extended to 31 courses: PASS — spine "
         "digests + 17 section rows + 59 topic rows all SME_REFERENCE verbatim, per-row "
         "CORPUS counts pinned through the resolution law, CS ALL 97 notes + 30 sets "
         "resolve, math-U2 ALL 92 notes + 27 sets resolve, drift rows exactly documented "
         "(none on both), deep links resolve, official tree.topics carries zero SME codes "
         "(the header edit hit a line-wrap mismatch on the first attempt — the +tranche-13 "
         "text sits inline — and was re-applied with the exact strings; the gate re-verified "
         "PASS after). NO WAVE-8 PROBE ROTATION THIS TRANCHE: bio-mod-U1 holds the no-layer "
         "probe slot from the tranche-11 rotation #5 and stays no-layer — the roster is "
         "UNTOUCHED (verify_sme_wave8.ts byte-unchanged). LESSONS APPLIED BEFORE PUSH: #2 "
         "by-CODE pin search (above); #3 the prebuild chain on the lane BEFORE push "
         "(verify_corpus_23a PASSED; flashcard core-sync manifest matches "
         "[igcse-chemistry-19]; validate_cie_bundles PASS 106 rows; validate_gradeb_bundle "
         "clean; verify_subject_identity PASS 106/106) — NO CI-hub surprise. ACCEPTANCE: "
         "wave1 + wave7 + cosmetics1 + wave8 PASS; wire_r0 PASS (2,574 placed / 0 "
         "unplaced — byte-identical to the tranche-3..13 records); bun run typecheck "
         "(root, CI parity) rc=0 (NO recycle event this lane); CI-verify reproduction 0 "
         "fail (3,548 tests / 44,771 expects) — no pin events; hub lib battery: the 6 "
         "standing fails of record at the pristine base (the #1041 window's set) — zero "
         "new failures from this lane; the wave6 gate is GREEN of record since W6-1 "
         "run-003 (#1058). EFFECT OF RECORD: the queue pair's /revision-notes selectors "
         "now mirror SaveMyExams' own Revision-Notes organization verbatim with "
         "corpus-true counts; the loose-notes cards empty (189 formerly-loose notes now "
         "have rows); fleet-wide 58 layered courses / 6,446 resolved / user-facing loose "
         "2,811 -> 2,626; next-tranche queue re-measured (user-facing: cie-as-physics-25 "
         "92, cie-igcse-business-23 91, cie-igcse-history-18 87, "
         "cie-igcse-science-combined-science-23-physics 84, cie-igcse-economics-25 84). "
         "Census engines: rn_selector_census.ts (untouched) + w9_sme_census.ts "
         "(read-only). Lane artifacts .syllabai/lane-artifacts/T-SME-SEL-W9-14/run-001/ "
         "(parsed live RN trees + builder + audit + worklog scripts); receipt "
         ".syllabai/receipts/T-SME-SEL-W9-14/run-001.md; task card T-SME-SEL-W9-14.yaml "
         "IN_REVIEW; author does not self-merge; no DB contact; fetch-first race-guard at "
         "push (EXPECT pinned to the lane base per the #1058 lesson); no force")

REMINDER = ("Standing reminder (THIRTY-SIXTH filing): the PAT remains exposed from chat "
            "transmission and MUST be revoked/rotated (the Vercel token likewise).")

SUFFIX = f"{ENTRY}\n{REMINDER}\n"

for f in ["worklog.md", ".syllabai/worklog.md"]:
    p = f"{REPO}/{f}"
    before = open(p, encoding="utf-8").read()
    open(p, "w", encoding="utf-8").write(before + SUFFIX)
    after = open(p, encoding="utf-8").read()
    assert after.startswith(before) and after.endswith(SUFFIX) and after.count(SUFFIX) == 1
    print(f"{f}: +{len(SUFFIX)}B appended at tail (prefix byte-identity asserted)")
print("DUAL WORKLOG APPEND OK")

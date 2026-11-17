#!/usr/bin/env python3
"""T-SME-SEL-W9-18 run-001 — dual worklog append (append-only; prefix
byte-identity asserted pre/post)."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-18 run-001 — SME picker layer wave 9, tranche 18: the Revision-Notes "
         "picker mirror for the queue pair (PR of record opened for the integrator; branch "
         "t-sme-sel-w9-18/run-001 from origin/main ad716b0d). Operator order 'Proceed with "
         "next' executes the tranche-17 merge record's next-queue ranks 1-2 — "
         "igcse-science-double-award-17-chemistry (Pearson Edexcel 4SD0 2017 — the THIRD "
         "4SD0 strand after the tranche-10 biology and tranche-13 physics) / "
         "igcse-business-19 (Pearson Edexcel 4BS1). BASE OF RECORD: main ad716b0d — main "
         "ADVANCED between tranches (a25f3056 -> ad716b0d, PR #1062 the P14 video-map "
         "lane: 3,138 owner-reviewed rows over flags.json + video-map/*.json, ZERO "
         "selector-surface contact); census at that tip: resolved 6,982 (64 layered) / "
         "user-facing loose 2,106. TRANCHE: DA-chem 80 + business 80 loose = 160 notes "
         "(business's full corpus is 89 notes in 28 pairs — 9 set-bearing). LIVE FETCHES "
         "2026-11-17 (polite curl, __NEXT_DATA__, URLs of record from the corpus notes' "
         "own sourceUrl — DA-chem at /igcse/science/edexcel/double-award/17/chemistry/ "
         "(the strand-QUALIFIER shape), business at /igcse/business/edexcel/19/ (the "
         "numbered shape)): DA-chem 4 sections/22 topics/80 subtopics and business "
         "6/28/91. BIJECTION AUDIT OF RECORD (lane w9t18_live_audit.py): the NINTH "
         "consecutive FULLY-CLEAN audit — 0 note slugs missing / 0 set slugs missing / 0 "
         "exact-one failures; BOTH COURSES SINGLE-MATCH throughout; ZERO DRIFT ROWS; "
         "ZERO TITLE MISMATCHES; DA-chem a PERFECT 1:1 mirror (80==80) with 22 sets "
         "across all 22 pairs; business's +2-subtopic delta sits under traffic-bearing "
         "topics (NOT the drift class) with all 28 live topics == the 28 corpus "
         "note-pairs and 25 sets across 25 of 28 pairs. DA-chem runs the TC1 code family "
         "(igcse-science-double-award-TC1:SUBa — distinct from the combined-science-2023-"
         "2024-TC1 codes the bundle-seed pins; the fleet-wide skip law covers the SME "
         "rows anyway); business-19 the DECIMAL T-code family (igcse-business-T1.1:SUB_) "
         "with the TOPIC==SUBTOPIC spine (25/25 of 110 nodes). PIN SEARCHES (resolved "
         "BEFORE building): the by-CODE searches (rg igcse-science-double-award-TC1 | "
         "igcse-business-T1.1) found ZERO pins. No multiMatch declaration, no "
         "DRIFT_BY_COURSE entries, no setLaw pin; no byte-format event. APPENDS +60 "
         "SME_REFERENCE nodes: DA-chem +26 (4+22; official 157 intact, digest "
         "1e624d4d595b83bf), business +34 (6+28; official 110 intact, digest "
         "a457ef797db2e59b); removal round-trips asserted byte-identical per course; "
         "official nodes list-equal per course; FIXTURES MERGED into sme-wave9-fixtures."
         "json (39 courses) with the prior 37 blocks byte-preserved (asserted deep-equal "
         "by the builder), each new block carrying fetched 2026-11-17. GATE "
         "verify_sme_wave9.ts extended to 39 courses: PASS — spine digests + 10 section "
         "rows + 50 topic rows all SME_REFERENCE verbatim, per-row CORPUS counts pinned "
         "through the resolution law, DA-chem ALL 80 notes + 22 sets resolve, business "
         "ALL 89 notes + 25 sets resolve, drift rows exactly documented (none on both), "
         "deep links resolve, official tree.topics carries zero SME codes. NO WAVE-8 "
         "PROBE ROTATION THIS TRANCHE: bio-mod-U1 holds the no-layer probe slot from the "
         "tranche-11 rotation #5 and stays no-layer — the roster is UNTOUCHED "
         "(verify_sme_wave8.ts byte-unchanged). LESSONS APPLIED BEFORE PUSH: #2 by-CODE "
         "pin search (above); #3 the prebuild chain on the lane BEFORE push "
         "(verify_corpus_23a PASSED; flashcard core-sync manifest matches "
         "[igcse-chemistry-19]; validate_cie_bundles PASS 106 rows; validate_gradeb_bundle "
         "clean; verify_subject_identity PASS 106/106) — NO CI-hub surprise. ACCEPTANCE: "
         "wave1 + wave7 + cosmetics1 + wave8 PASS; wire_r0 PASS (2,574 placed / 0 "
         "unplaced — byte-identical to the tranche-3..17 records); bun x turbo run "
         "typecheck (the CI script) rc=0 (the T17 install artifact stays fixed); "
         "CI-verify reproduction 0 fail (3,561 tests / 44,805 expects) — no pin events; "
         "hub lib battery: the 6 standing fails of record at the pristine base (the "
         "#1041 window's set) — zero new failures from this lane; the wave6 gate is "
         "GREEN of record since W6-1 run-003 (#1058). EFFECT OF RECORD: the queue "
         "pair's /revision-notes selectors now mirror SaveMyExams' own Revision-Notes "
         "organization verbatim with corpus-true counts; the loose-notes cards empty "
         "(160 formerly-loose notes now have rows); fleet-wide 66 layered courses / "
         "7,151 resolved / user-facing loose 2,106 -> 1,946; next-tranche queue "
         "re-measured (user-facing: igcse-maths-a-modular-24-foundation-unit-1 79, "
         "igcse-economics-17 79, cie-igcse-economics-20 79, cie-igcse-ict-21 78, "
         "cie-igcse-business-25 77). Census engines: rn_selector_census.ts (untouched) + "
         "w9_sme_census.ts (read-only). Lane artifacts "
         ".syllabai/lane-artifacts/T-SME-SEL-W9-18/run-001/ (parsed live RN trees + "
         "builder + audit + worklog scripts); receipt "
         ".syllabai/receipts/T-SME-SEL-W9-18/run-001.md; task card T-SME-SEL-W9-18.yaml "
         "IN_REVIEW; author does not self-merge; no DB contact; fetch-first race-guard "
         "at push (EXPECT pinned to the lane base ad716b0d); no force")

REMINDER = ("Standing reminder (FORTIETH filing): the PAT remains exposed from chat "
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

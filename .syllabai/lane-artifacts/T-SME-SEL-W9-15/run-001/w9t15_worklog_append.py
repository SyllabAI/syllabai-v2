#!/usr/bin/env python3
"""T-SME-SEL-W9-15 run-001 — dual worklog append (append-only; prefix
byte-identity asserted pre/post)."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-15 run-001 — SME picker layer wave 9, tranche 15: the Revision-Notes "
         "picker mirror for the queue pair (PR of record opened for the integrator; branch "
         "t-sme-sel-w9-15/run-001 from origin/main 547bed9f). Operator order 'Proceed with "
         "remaining work' executes the tranche-14 merge record's next-queue ranks 1-2 — "
         "cie-as-physics-25 (CIE AS 9702 2025-2027) / cie-igcse-business-23 (CIE IGCSE 0450 "
         "2023-2025). BASE OF RECORD: main 547bed9f — the tranche-14 merge landed through "
         "the RACED UNION-RESOLVE: the FIXED race-guard DETECTED the fec198dd->3e057a7f "
         "advance (PR #1064, the calc2-phase-a lane) with the .syllabai/worklog.md "
         "append-vs-append overlap and ABORTED the blind merge; the union commit 0cba05f0 "
         "landed per the run-032 law (theirs-verbatim-first, the tranche-14 lane suffix "
         "byte-exact re-appended at tail, asserted per ledger: suffix lines 2/2 new vs "
         "main, zero markers) and CI went GREEN on the union head — the #1058 guard fix is "
         "proven in production; census at that tip: resolved 6,446 (58 layered) / "
         "user-facing loose 2,626. TRANCHE: physics 92 + business 91 loose = 183 notes "
         "(business's full corpus is 99 notes in 28 pairs — 8 set-bearing). LIVE FETCHES "
         "2026-11-17 (polite curl, __NEXT_DATA__, URLs of record from the corpus notes' "
         "own sourceUrl — physics at /as/physics/cie/25/ (the NUMBERED-SECTION shape), "
         "business at /igcse/business/cie/23/ (the numbered shape)): physics 11 "
         "sections/32 topics/92 subtopics and business 7/28/99. BIJECTION AUDIT OF RECORD "
         "(lane w9t15_live_audit.py): the SIXTH consecutive FULLY-CLEAN audit — 0 note "
         "slugs missing / 0 set slugs missing / 0 exact-one failures; BOTH COURSES "
         "SINGLE-MATCH throughout; ZERO DRIFT ROWS; ZERO TITLE MISMATCHES; BOTH TREES "
         "PERFECT 1:1 MIRRORS (physics 92==92; business 99==99). as-physics-25 is the "
         "AS-shares-A-level code prefix class of record (cie-a-level-physics-2025-2027-T1 "
         "— the as-accounting-21 tranche-12 precedent) with the DENSEST set corpus yet "
         "(64 sets across all 32 pairs). business-23 carries 25 sets across 25 of its 28 "
         "pairs (3 setless — the blanket set law covers set-bearing pairs only). PIN "
         "SEARCHES (resolved BEFORE building): the by-CODE searches (rg "
         "a-level-physics-2025-2027-T1 | business-2023-2025-T1) found ZERO pins. No "
         "multiMatch declaration, no DRIFT_BY_COURSE entries, no setLaw pin; no "
         "byte-format event. APPENDS +78 SME_REFERENCE nodes: physics +43 (11+32; official "
         "189 intact, digest 74b0aa5424712a88), business +35 (7+28; official 95 intact, "
         "digest 68419d29922e05e4); removal round-trips asserted byte-identical per "
         "course; official nodes list-equal per course; FIXTURES MERGED into "
         "sme-wave9-fixtures.json (33 courses) with the prior 31 blocks byte-preserved "
         "(asserted deep-equal by the builder), each new block carrying fetched "
         "2026-11-17. GATE verify_sme_wave9.ts extended to 33 courses: PASS — spine "
         "digests + 18 section rows + 60 topic rows all SME_REFERENCE verbatim, per-row "
         "CORPUS counts pinned through the resolution law, physics ALL 92 notes + 64 sets "
         "resolve, business ALL 99 notes + 25 sets resolve, drift rows exactly documented "
         "(none on both), deep links resolve, official tree.topics carries zero SME "
         "codes. NO WAVE-8 PROBE ROTATION THIS TRANCHE: bio-mod-U1 holds the no-layer "
         "probe slot from the tranche-11 rotation #5 and stays no-layer — the roster is "
         "UNTOUCHED (verify_sme_wave8.ts byte-unchanged). LESSONS APPLIED BEFORE PUSH: #2 "
         "by-CODE pin search (above); #3 the prebuild chain on the lane BEFORE push "
         "(verify_corpus_23a PASSED; flashcard core-sync manifest matches "
         "[igcse-chemistry-19]; validate_cie_bundles PASS 106 rows; validate_gradeb_bundle "
         "clean; verify_subject_identity PASS 106/106) — NO CI-hub surprise. ACCEPTANCE: "
         "wave1 + wave7 + cosmetics1 + wave8 PASS; wire_r0 PASS (2,574 placed / 0 "
         "unplaced — byte-identical to the tranche-3..14 records); bun run typecheck "
         "(root, CI parity) rc=0; CI-verify reproduction 0 fail (3,561 tests / 44,805 "
         "expects — the #1064 calc2 lane grew the battery; still zero fail); hub lib "
         "battery: the 6 standing fails of record at the pristine base (the #1041 "
         "window's set) — zero new failures from this lane; the wave6 gate is GREEN of "
         "record since W6-1 run-003 (#1058). EFFECT OF RECORD: the queue pair's "
         "/revision-notes selectors now mirror SaveMyExams' own Revision-Notes "
         "organization verbatim with corpus-true counts; the loose-notes cards empty; "
         "fleet-wide 60 layered courses / 6,637 resolved / user-facing loose 2,626 -> "
         "2,443; next-tranche queue re-measured (user-facing: cie-igcse-history-18 87, "
         "cie-igcse-science-combined-science-23-physics 84, cie-igcse-economics-25 84, "
         "cie-igcse-environmental-management-25 82, igcse-science-double-award-17-"
         "chemistry 80). Census engines: rn_selector_census.ts (untouched) + "
         "w9_sme_census.ts (read-only). Lane artifacts "
         ".syllabai/lane-artifacts/T-SME-SEL-W9-15/run-001/ (parsed live RN trees + "
         "builder + audit + worklog scripts); receipt "
         ".syllabai/receipts/T-SME-SEL-W9-15/run-001.md; task card T-SME-SEL-W9-15.yaml "
         "IN_REVIEW; author does not self-merge; no DB contact; fetch-first race-guard at "
         "push (EXPECT pinned to the lane base); no force")

REMINDER = ("Standing reminder (THIRTY-SEVENTH filing): the PAT remains exposed from chat "
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

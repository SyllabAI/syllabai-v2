#!/usr/bin/env python3
"""T-SME-SEL-W9-2 run-001 — dual worklog append (append-only; the lane suffix
is appended byte-exact at the tail of BOTH ledgers; prefix byte-identity
asserted pre/post)."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-2 run-001 — SME picker layer wave 9, tranche 2: the Revision-Notes "
         "picker mirror for the CIE A-level sciences-25 trio (PR of record opened for the "
         "integrator; branch t-sme-sel-w9-2/run-001 from origin/main 70f1af92). Operator order "
         "'wave-9 tranche 2' executes the #999 merge record's named next-tranche queue — biology "
         "9700 / chemistry 9701 / physics 9702, one coherent family: BASELINE OF RECORD at main "
         "70f1af92 (main advanced 2,099 commits past the #999 merge, verified in ancestry; both "
         "census engines re-measured): 106 note-bearing courses / 9,151 notes; smeRowOfNote "
         "resolves 2,721 (the 31 layered courses = 27 W8 + 4 tranche-1); user-facing loose 6,330 "
         "on the 75 no-layer courses (+1 vs the #999 record's 6,329 — other lanes' corpus drift, "
         "disclosed); official-spine loose 1,634. TRANCHE: bio-25 239 / chem-25 239 / phys-25 201 "
         "user-facing loose = 679 notes / 317 sets (user-facing ranks 1-3; the official-spine "
         "metric's rank-1 chem-25 169 + rank-3 phys-25 95). LIVE FETCHES 2026-11-13 (polite curl, "
         "__NEXT_DATA__, the W7 recipe): bio-25 19 sections/44 topics/239 subtopics, chem-25 "
         "37/90/239, phys-25 25/76/201 — subtopics == corpus notes per course (the corpus was "
         "built 1:1 from the live tree). BIJECTION AUDIT OF RECORD (0 missing / 0 title mismatches "
         "/ 0 sectionSlug mismatches / 0 duplicate topic slugs per course; ZERO live-only drift "
         "rows — tranche 1 had the set-1-fl Mock-Exams pair on 0580, the trio has none). APPENDS "
         "+291 SME_REFERENCE nodes (git diff on the three curricula 3,282 insertions / 0 "
         "deletions): bio-25 +63 (19+44; official 321 intact), chem-25 +127 (37+90; official 484 "
         "intact), phys-25 +101 (25+76; official 405 intact); removal round-trip asserted "
         "byte-identical per course; official-node identity pinned as sha256 digests in the "
         "fixtures; FIXTURES MERGED into sme-wave9-fixtures.json with the four tranche-1 blocks "
         "byte-preserved (asserted deep-equal by the builder). ZERO-CODE WAVE — no src changes: "
         "the W8 mirror law renders smeSections generically on BOTH selectors; the appends alone "
         "light them up. GATE verify_sme_wave9.ts extended to 7 courses: PASS (126 checks / 0 "
         "failures — spine digests + 121 section rows + 411 topic rows all SME_REFERENCE verbatim, "
         "per-row CORPUS counts pinned, ALL 679 notes resolve via smeRowOfNote, ALL 317 sets "
         "resolve via smeRowOfQuestionSet, drift rows exactly documented (none on the trio), deep "
         "links resolve, official tree.topics carries zero SME codes); DRIFT_BY_COURSE extended "
         "with three explicit empty sets. DISCLOSED PIN-REFRESH (the wave-6 run-002 class): "
         "verify_sme_wave8's fleet-safety probe cie-a-level-chemistry-25 -> cie-as-chemistry-25 "
         "(the former probe GAINED its SME layer here — the law only binds courses still without "
         "one; rotation documented in place); wave8 PASS. ACCEPTANCE: wave1-5 + wave7 + cosmetics1 "
         "PASS; wire_r0 PASS (2,574 placed / 0 unplaced, gen-row homes 14); corpus23a PASS; "
         "prebuild chain PASS (flashcard-sync, cie bundles, gradeb, subject-identity 106/106); hub "
         "lib battery fail set comm -3 BYTE-EQUAL to the pristine 70f1af92 in-repo "
         "detached-checkout baseline (T-UGM-RENDER-1 katex red + dual-run posture x4 + "
         "requestPartRegrade + store laws x3 — other lanes' surfaces on the advanced tip; "
         "tranche-1's 2-fail set grew to 11 named fails via the 2,099-commit advance, none "
         "corpus-spec related). PRE-EXISTING DEBTS DISCLOSED NOT TOUCHED (zero contact with this "
         "lane's files): verify_sme_wave6 2 failures 'spec points 34 != 36' (RN-DEBRIS-11 run-023 "
         "class; W6-1 run-003 pin-refresh queued); hub tsc 1 error 'Cannot find module jsdom' from "
         "the #1000 ink harness — byte-equal on the pristine tip baseline, CI-green on 70f1af92 "
         "(the documented #1001 install-coverage class; the second fresh-clone error, jose, "
         "resolved with the root workspace install). EFFECT OF RECORD: the trio's /revision-notes "
         "and /exam-questions selectors now mirror SaveMyExams' own Revision-Notes organization "
         "verbatim with corpus-true counts; the loose-notes card empties (679 formerly-loose notes "
         "now have rows); all 317 sets keep exactly one home; fleet-wide 34 layered courses / "
         "3,400 resolved / user-facing loose 6,330 -> 5,651; next-tranche queue re-measured "
         "(user-facing: igcse-maths-b-16 199, igcse-maths-a-18-higher 191, "
         "cie-igcse-english-literature-21 173, accounting-21 159, economics-23 159; official-spine "
         "metric re-ranks economics-23 95 / as-chemistry-25 88 / english-literature-21 80). Census "
         "engines: rn_selector_census.ts (untouched) + w9_sme_census.ts (read-only). Lane "
         "artifacts .syllabai/lane-artifacts/T-SME-SEL-W9-2/run-001/ (builder + audit scripts + "
         "the three parsed live RN trees); receipt .syllabai/receipts/T-SME-SEL-W9-2/run-001.md; "
         "task card T-SME-SEL-W9-2.yaml IN_REVIEW; author does not self-merge; no DB contact; "
         "fetch-first race-guard at push; no force")

REMINDER = ("Standing reminder (TWENTY-FIRST filing): the PAT remains exposed from chat "
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

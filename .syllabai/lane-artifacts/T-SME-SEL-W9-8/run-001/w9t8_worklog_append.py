#!/usr/bin/env python3
"""T-SME-SEL-W9-8 run-001 — dual worklog append (append-only; the lane suffix
is appended byte-exact at the tail of BOTH ledgers; prefix byte-identity
asserted pre/post). Same shape as the tranche-7 lane artifact
w9t7_worklog_append.py."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-8 run-001 — SME picker layer wave 9, tranche 8: the Revision-Notes "
         "picker mirror for the queue pair (PR of record opened for the integrator; branch "
         "t-sme-sel-w9-8/run-001 from origin/main 4ef09e31). Operator order 'Proceed' executes "
         "the #1038 merge record's named next-tranche queue — igcse-physics-19 (Pearson Edexcel "
         "4PH1 2017) / cie-as-biology-25 (CIE AS 9700 2025-2027), user-facing ranks 1-2. "
         "BASELINE OF RECORD at 4ef09e31 (tranches 1-7 in main, no advances during the lane): "
         "106 note-bearing courses / 9,151 notes; smeRowOfNote resolves 4,973 (the 44 layered "
         "courses); user-facing loose 4,086. TRANCHE: physics 127 + as-bio 124 = 251 notes. "
         "LIVE FETCHES 2026-11-15 (polite curl, __NEXT_DATA__, URLs of record from the corpus "
         "notes' own sourceUrl — physics at /igcse/physics/edexcel/19/, the AS biology tree at "
         "SME's AS-level path /as/biology/cie/25/): physics 8 sections/24 topics/127 subtopics "
         "and as-bio 11/24/124 — BOTH live subtopic counts equal their corpus note counts "
         "(perfect 1:1s). BIJECTION AUDIT OF RECORD (lane w9t8_live_audit.py): 0 note slugs "
         "missing / 0 set slugs missing / 0 title mismatches / 0 exact-one failures; BOTH "
         "COURSES SINGLE-MATCH throughout (no multiMatch class); ZERO DRIFT ROWS on either "
         "course — the wrinkle watch resolved the good way: the feared 4BI1 sibling class "
         "(igcse-biology-19's 3 SME skills/exam-technique placeholder rows, tranche 5) did NOT "
         "appear on the 4PH1 tree, and the sciences-25 0-drift class holds on the AS 9700 "
         "tree. SET LAW: blanket tranche-1/2 (physics 24 topic-class sets / as-bio 48, all "
         "resolve). APPENDS +67 SME_REFERENCE nodes: physics +32 (8+24; official 234 intact, "
         "digest 446ddd054c64dd17), as-bio +35 (11+24; official 159 intact, digest "
         "e8f7308919c76085); BYTE-LEVEL DISCIPLINE: the builder auto-detects the byte format "
         "by requiring a byte-identical round-trip of the pristine file before appending (no "
         "reformatting); removal round-trip asserted byte-identical per course; official "
         "nodes list-equal per course; FIXTURES MERGED into sme-wave9-fixtures.json (19 "
         "courses) with the prior 17 blocks byte-preserved (asserted deep-equal by the "
         "builder), each new block carrying fetched 2026-11-15. GATE verify_sme_wave9.ts "
         "extended to 19 courses: PASS — spine digests + 19 section rows + 48 topic rows all "
         "SME_REFERENCE verbatim, per-row CORPUS counts pinned through the resolution law, "
         "physics ALL 127 notes + 24 sets resolve, as-bio ALL 124 notes + 48 sets resolve, "
         "drift rows exactly documented (none on both), deep links resolve, official "
         "tree.topics carries zero SME codes. DISCLOSED WAVE-8 PROBE ROTATION #2 "
         "(verify_sme_wave8.ts): the fleet-safety roster's no-layer probe slot — held by "
         "cie-as-biology-25 since the tranche-7 rotation — rotates to the next no-layer "
         "Pearson-science sibling igcse-chemistry-19 (its 4BI1 sibling gained the layer at "
         "tranche 5, its 4PH1 sibling at tranche 8); all three probes re-verified at 0 "
         "SME-row hits; the roster comment documents the rotation chain tranche-2 -> "
         "tranche-7 -> tranche-8; same disclosed pin-refresh class as the wave-6 run-002. "
         "ACCEPTANCE (the tranche-3..7 set): wave1 + wave7 + cosmetics1 PASS; wave8 PASS "
         "after the disclosed rotation #2; wire_r0 PASS (2,574 placed / 0 unplaced — "
         "byte-identical to the tranche-3..7 records); bun run typecheck (root, CI parity) "
         "rc=0; bundle-seed + books-bundle-spine band 79 pass / 0 fail; hub lib battery at "
         "the lane tree: the SAME 6 standing fails (1,043 tests / 39,866 expects — the "
         "identical set stash-verified pre-existing at the #1038 base): the T-UGM-RENDER-1 "
         "katex red plus 5 dual-run (NEXT_PUBLIC_API_V2_BASE_URL set) v2-flip reds (apiPath "
         "exact v2 URLs / every flipped hub-emitted path / T-MIG-106 / T-MIG-110 / "
         "T-MIG-133j); zero new failures from this lane. PRE-EXISTING DEBTS DISCLOSED NOT "
         "TOUCHED (zero contact with this lane's files): verify_sme_wave6 2 failures 'spec "
         "points 34 != 36' (RN-DEBRIS-11 run-023 class; W6-1 run-003 pin-refresh queued); "
         "the standing credential rotation reminder. EFFECT OF RECORD: the queue pair's "
         "/revision-notes selectors now mirror SaveMyExams' own Revision-Notes organization "
         "verbatim with corpus-true counts; the loose-notes cards empty (251 formerly-loose "
         "notes now have rows); fleet-wide 46 layered courses / 5,224 resolved / user-facing "
         "loose 4,086 -> 3,835; next-tranche queue re-measured (user-facing: "
         "igcse-chemistry-19 112, cie-igcse-geography-25 112, "
         "igcse-science-double-award-17-biology 110, cie-igcse-accounting-25 105, "
         "igcse-biology-modular-24-unit-2 99, igcse-maths-a-modular-24-higher-unit-1 98). "
         "Census engines: rn_selector_census.ts (untouched) + w9_sme_census.ts (read-only). "
         "Lane artifacts .syllabai/lane-artifacts/T-SME-SEL-W9-8/run-001/ (parsed live RN "
         "trees + builder + audit + worklog scripts); receipt "
         ".syllabai/receipts/T-SME-SEL-W9-8/run-001.md; task card T-SME-SEL-W9-8.yaml "
         "IN_REVIEW; author does not self-merge; no DB contact; fetch-first race-guard at "
         "push; no force")

REMINDER = ("Standing reminder (TWENTY-NINTH filing): the PAT remains exposed from chat "
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

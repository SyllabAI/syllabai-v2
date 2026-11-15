#!/usr/bin/env python3
"""T-SME-SEL-W9-4 run-001 — dual worklog append (append-only; the lane suffix
is appended byte-exact at the tail of BOTH ledgers; prefix byte-identity
asserted pre/post)."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-4 run-001 — SME picker layer wave 9, tranche 4: the Revision-Notes "
         "picker mirror for the queue pair (PR of record opened for the integrator; branch "
         "t-sme-sel-w9-4/run-001 from origin/main 02205984). Operator order 'Proceed with next "
         "queue' executes the #1022 merge record's named next-tranche queue — "
         "cie-igcse-english-literature-21 (CIE IGCSE 0455 lit 2023-2025) / "
         "cie-a-level-accounting-21 (CIE A-level 9706 2023-2025), user-facing ranks 1-2: "
         "BASELINE OF RECORD at main 02205984 (queue counts re-confirmed at lane open; #1025 "
         "touched no note-bearing content; fleet carried from the #1022 post-merge re-measure): "
         "106 note-bearing courses / 9,151 notes; smeRowOfNote resolves 3,790 (the 36 layered "
         "courses); user-facing loose 5,261. TRANCHE: lit 173/173 + accounting 159/159 "
         "user-facing loose = 332 notes. LIVE FETCHES 2026-11-15 (polite curl, __NEXT_DATA__): "
         "lit 6 sections/28 topics/174 subtopics, accounting 5/25/160. BIJECTION AUDIT OF "
         "RECORD (lane w9t4_live_audit.py): 0 note slugs missing / 0 set slugs missing / 0 "
         "title mismatches / 0 drift rows per course. MULTI-MATCH LAW OF RECORD (the tranche-4 "
         "wrinkle — the wave-7 exact-one law exercised for real): accounting's live picker "
         "carries DUPLICATE topic slugs across sections ('overview' x4 under "
         "course-overview/fundamentals-of-financial-accounting/"
         "fundamentals-of-cost-and-management-accounting/financial-accounting; "
         "'financial-statements-for-partnerships' x2 under fundamentals-of-financial-"
         "accounting + financial-accounting); the 6 corpus note pairs on those slugs ALL carry "
         "a corpus sectionSlug that is exactly one of the live sections hosting the slug, so "
         "smeRowOfNote resolves every note exact-one by the smeSectionSlug agreement (the "
         "wave-7 law as designed) and the builder ASSERTS the first-match fallback never "
         "fires (fail-close); ZERO runtime-code change — the W7 runtime already ships the "
         "disambiguation; the gate's single-match law gains the declared-multiMatch exemption "
         "(resolution proven by the per-row corpus pins, undeclared duplicates still fail); "
         "lit is single-match throughout (0 duplicate slugs, 15 sets all topic class under "
         "the blanket tranche-1/2 set law). APPENDS +68 SME_REFERENCE nodes: lit +34 (6+28; "
         "official 234 intact, digest fea4b7528482efa2), accounting +34 (5+29; official 56 "
         "intact, digest be918fb90d8dd05e); BYTE-LEVEL DISCIPLINE: the builder auto-detects "
         "the byte format by requiring a byte-identical round-trip of the pristine file "
         "before appending (no reformatting); removal round-trip asserted byte-identical per "
         "course; official nodes list-equal per course; FIXTURES MERGED into "
         "sme-wave9-fixtures.json (11 courses) with the prior 9 blocks byte-preserved "
         "(asserted deep-equal by the builder), each new block carrying fetched 2026-11-15 "
         "and accounting's block declaring multiMatch [financial-statements-for-partnerships, "
         "overview]; NO setLaw pin (blanket set law on both). GATE verify_sme_wave9.ts "
         "extended to 11 courses: PASS — spine digests + 11 section rows + 57 topic rows all "
         "SME_REFERENCE verbatim, per-row CORPUS counts pinned through the resolution law "
         "(single-match by topicSlug, multi-match by sectionSlug agreement), lit ALL 173 "
         "notes + 15 sets resolve, accounting ALL 159 notes resolve (0 sets), drift rows "
         "exactly the documented 0/0, deep links resolve, official tree.topics carries zero "
         "SME codes; DRIFT_BY_COURSE extended (both empty). ACCEPTANCE (the tranche-3 set): "
         "wave1-5 + wave7 + wave8 + cosmetics1 PASS; wire_r0 PASS (2,574 placed / 0 unplaced "
         "— byte-identical to the tranche-3 record); bun run typecheck (root, CI parity) "
         "rc=0 5/5 turbo tasks; bundle-seed + books-bundle-spine band 79 pass / 0 fail (the "
         "tranche-3 amended pins hold); hub lib battery at the lane tree: 9 standing fails "
         "byte-class-EQUAL to the tranche-3 disclosed set (T-UGM-RENDER-1 katex red + "
         "dual-run posture + store laws — other lanes' surfaces; 10 -> 9 via upstream fixes), "
         "zero new failures from this lane. PRE-EXISTING DEBTS DISCLOSED NOT TOUCHED (zero "
         "contact with this lane's files): verify_sme_wave6 2 failures 'spec points 34 != 36' "
         "(RN-DEBRIS-11 run-023 class; W6-1 run-003 pin-refresh queued). EFFECT OF RECORD: "
         "the queue pair's /revision-notes selectors now mirror SaveMyExams' own "
         "Revision-Notes organization verbatim with corpus-true counts; the loose-notes cards "
         "empty (332 formerly-loose notes now have rows); fleet-wide 38 layered courses / "
         "4,122 resolved / user-facing loose 5,261 -> 4,929; next-tranche queue re-measured "
         "(user-facing: cie-a-level-economics-23 159, igcse-biology-19 142, "
         "igcse-maths-a-18-foundation 139). Census engines: rn_selector_census.ts (untouched) "
         "+ w9_sme_census.ts (read-only). Lane artifacts "
         ".syllabai/lane-artifacts/T-SME-SEL-W9-4/run-001/ (parsed live RN trees + builder + "
         "audit + worklog scripts); receipt .syllabai/receipts/T-SME-SEL-W9-4/run-001.md; "
         "task card T-SME-SEL-W9-4.yaml IN_REVIEW; author does not self-merge; no DB "
         "contact; fetch-first race-guard at push; no force")

REMINDER = ("Standing reminder (TWENTY-THIRD filing): the PAT remains exposed from chat "
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

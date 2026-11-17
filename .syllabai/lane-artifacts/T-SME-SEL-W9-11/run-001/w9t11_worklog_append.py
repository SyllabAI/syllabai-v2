#!/usr/bin/env python3
"""T-SME-SEL-W9-11 run-001 — dual worklog append (append-only; the lane suffix
is appended byte-exact at the tail of BOTH ledgers; prefix byte-identity
asserted pre/post). Same shape as the tranche-10 lane artifact
w9t10_worklog_append.py."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-11 run-001 — SME picker layer wave 9, tranche 11: the Revision-Notes "
         "picker mirror for the queue pair (PR of record opened for the integrator; branch "
         "t-sme-sel-w9-11/run-001 from origin/main 319a0573). Operator order 'Proceed' "
         "executes the tranche-10 merge record's next-queue ranks 1-2 — "
         "igcse-biology-modular-24-unit-2 (Pearson Edexcel 4XBI1 modular 2024) / "
         "igcse-maths-a-modular-24-higher-unit-1 (Pearson 4XMAF/4XMAH modular 2024). BASE OF "
         "RECORD: main 319a0573 — the tranche-10 merge e2de0037 ADVANCED to 319a0573 by the "
         "orthogonal #1046 t-lesson-defect-sweep / #1047 T-MG-CALC input-color fixup / #1014 "
         "visual-batch-2 windows before this lane started (zero overlap with the selector "
         "surface); census at that tip: resolved 5,668 (50 layered) / user-facing loose "
         "3,396. TRANCHE: bio-U2 99 + maths-U1 98 loose = 197 notes. LIVE FETCHES 2026-11-17 "
         "(polite curl, __NEXT_DATA__, URLs of record from the corpus notes' own sourceUrl — "
         "bio at /igcse/biology/edexcel/modular/24/unit-2/, maths at "
         "/igcse/maths/edexcel/a-modular/24/higher-unit-1/ — BOTH the unit-based 2-level "
         "shape, the geography-25 tranche-9 precedent): bio-U2 4 sections/13 topics/99 "
         "subtopics and maths-U1 6/32/98 — BOTH live subtopic counts equal their corpus "
         "note counts (perfect 1:1s). BIJECTION AUDIT OF RECORD (lane w9t11_live_audit.py): "
         "the SECOND consecutive FULLY-CLEAN audit — 0 note slugs missing / 0 set slugs "
         "missing / 0 exact-one failures; BOTH COURSES SINGLE-MATCH throughout; ZERO DRIFT "
         "ROWS; ZERO TITLE MISMATCHES. The modular-24-biology unit-2 tree does NOT run its "
         "4BI1 sibling's skills-placeholder class; the blanket set law covers both (bio 13 "
         "topic-class sets / maths 31, all resolve); no multiMatch declaration, no "
         "DRIFT_BY_COURSE entries, no setLaw pin; no byte-format event. APPENDS +55 "
         "SME_REFERENCE nodes: bio-U2 +17 (4+13; official 140 intact, digest f98b679f063c9fd8), "
         "maths-U1 +38 (6+32; official 128 intact, digest 32caa4e7572416e2); removal "
         "round-trips asserted byte-identical per course; official nodes list-equal per "
         "course; FIXTURES MERGED into sme-wave9-fixtures.json (25 courses) with the prior "
         "23 blocks byte-preserved (asserted deep-equal by the builder), each new block "
         "carrying fetched 2026-11-17. GATE verify_sme_wave9.ts extended to 25 courses: "
         "PASS — spine digests + 10 section rows + 45 topic rows all SME_REFERENCE "
         "verbatim, per-row CORPUS counts pinned through the resolution law, bio-U2 ALL 99 "
         "notes + 13 sets resolve, maths-U1 ALL 98 notes + 31 sets resolve, drift rows "
         "exactly documented (none on both), deep links resolve, official tree.topics "
         "carries zero SME codes. DISCLOSED WAVE-8 PROBE ROTATION #5 (verify_sme_wave8.ts): "
         "the fleet-safety roster's no-layer probe slot — held by "
         "igcse-biology-modular-24-unit-2 since the tranche-10 rotation — rotates to the "
         "SAME subject's unit-1 strand igcse-biology-modular-24-unit-1 (the modular-24 "
         "family continues); all three probes re-verified at 0 SME-row hits; the roster "
         "comment documents the rotation chain tranche-2 -> tranche-7 -> tranche-8 -> "
         "tranche-9 -> tranche-10 -> tranche-11; same disclosed pin-refresh class as the "
         "wave-6 run-002. LESSONS APPLIED BEFORE PUSH: #2 by-CODE pin search (rg "
         "\"4BM1|4MB1|modular-24|biology-modular|maths-a-modular\" over apps/api/test + "
         "packages — NO direct pins; the hits are the 4MA1/ln test bundles — different "
         "courses); #3 the prebuild chain on the lane BEFORE push (verify_corpus_23a "
         "PASSED; flashcard core-sync manifest matches [igcse-chemistry-19] — the "
         "tranche-9 SME_REFERENCE filter holds; validate_cie_bundles PASS 106 rows; "
         "validate_gradeb_bundle clean; verify_subject_identity PASS 106/106) — NO CI-hub "
         "surprise. RECYCLE INCIDENT OF RECORD (disclosed, resolved): the sandbox recycle "
         "wiped node_modules mid-lane — tsc went missing (typecheck exit 127) and a "
         "battery re-run collected only 1,306 tests (partial collection); bun install "
         "--frozen-lockfile restored the tree and the re-run reproduces the 3,548/44,771 "
         "record exactly — the same refresh debt the T10 lane disclosed is now HIT: re-run "
         "bun install --frozen-lockfile after every recycle before trusting battery "
         "counts. ACCEPTANCE: wave1 + wave7 + cosmetics1 PASS; wave8 PASS after the "
         "disclosed rotation #5; wire_r0 PASS (2,574 placed / 0 unplaced — byte-identical "
         "to the tranche-3..10 records); bun run typecheck (root, CI parity) rc=0; "
         "CI-verify reproduction 0 fail (3,548 tests / 44,771 expects) — no pin events; "
         "hub lib battery: the 6 standing fails of record at the pristine base (verified "
         "by stash-run in the T10 lane: the T-UGM-RENDER-1 katex red + the 5 dual-run "
         "reds, the #1041 window's set) — zero new failures from this lane. PRE-EXISTING "
         "DEBTS DISCLOSED NOT TOUCHED (zero contact with this lane's files): "
         "verify_sme_wave6 2 failures 'spec points 34 != 36' (RN-DEBRIS-11 run-023 class; "
         "W6-1 run-003 pin-refresh queued); the standing credential rotation reminder. "
         "EFFECT OF RECORD: the queue pair's /revision-notes selectors now mirror "
         "SaveMyExams' own Revision-Notes organization verbatim with corpus-true counts; "
         "the loose-notes cards empty (197 formerly-loose notes now have rows); fleet-wide "
         "52 layered courses / 5,865 resolved / user-facing loose 3,396 -> 3,199; "
         "next-tranche queue re-measured (user-facing: igcse-geography-19 98, "
         "cie-as-accounting-21 98, cie-igcse-religious-studies-23 97, "
         "igcse-maths-a-modular-24-foundation-unit-1 79, igcse-chemistry-modular-24-unit-1 "
         "65). Census engines: rn_selector_census.ts (untouched) + w9_sme_census.ts "
         "(read-only). Lane artifacts .syllabai/lane-artifacts/T-SME-SEL-W9-11/run-001/ "
         "(parsed live RN trees + builder + audit + worklog scripts); receipt "
         ".syllabai/receipts/T-SME-SEL-W9-11/run-001.md; task card T-SME-SEL-W9-11.yaml "
         "IN_REVIEW; author does not self-merge; no DB contact; fetch-first race-guard at "
         "push; no force")

REMINDER = ("Standing reminder (THIRTY-SECOND filing): the PAT remains exposed from chat "
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

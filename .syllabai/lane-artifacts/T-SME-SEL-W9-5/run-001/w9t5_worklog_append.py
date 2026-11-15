#!/usr/bin/env python3
"""T-SME-SEL-W9-5 run-001 — dual worklog append (append-only; the lane suffix
is appended byte-exact at the tail of BOTH ledgers; prefix byte-identity
asserted pre/post)."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-5 run-001 — SME picker layer wave 9, tranche 5: the Revision-Notes "
         "picker mirror for the queue pair (PR of record opened for the integrator; branch "
         "t-sme-sel-w9-5/run-001 from origin/main d46e3ff4). Operator order 'proceed with next "
         "queue' executes the #1027 merge record's named next-tranche queue — "
         "cie-a-level-economics-23 (CIE 9708 2023-2025) / igcse-biology-19 (Pearson Edexcel "
         "4BI1), user-facing ranks 1-2: BASELINE OF RECORD at main d46e3ff4 (queue counts "
         "re-confirmed at lane open; #1030/#1031 register/governance surfaces touched no "
         "note-bearing content; fleet carried from the #1027 post-merge re-measure, byte-equal "
         "at 91b5ab3d): 106 note-bearing courses / 9,151 notes; smeRowOfNote resolves 4,122 "
         "(the 38 layered courses); user-facing loose 4,929. TRANCHE: economics 159/159 + "
         "biology 142/142 user-facing loose = 301 notes. LIVE FETCHES 2026-11-15 (polite "
         "curl, __NEXT_DATA__, URLs of record from the corpus notes' own sourceUrl): "
         "economics 6 sections/53 topics/159 subtopics, biology 6/24/154. BIJECTION AUDIT OF "
         "RECORD (lane w9t5_live_audit.py): 0 note slugs missing / 0 set slugs missing / 0 "
         "title mismatches / 0 exact-one failures; BOTH COURSES SINGLE-MATCH throughout (no "
         "multiMatch class); DRIFT CLASS OF RECORD: biology-19 carries 3 live-only skills/"
         "exam-technique placeholder topics (exam-technique / handling-data-and-maths-skills / "
         "practical-and-investigative-skills, 0-note 0-set — the wave-1/3 set-1-fl precedent) "
         "mirrored verbatim as empty rows and pinned by the gate's DRIFT_BY_COURSE; "
         "economics-23 has none. SET LAW: blanket tranche-1/2 (economics 0 sets; biology 21 "
         "topic-class sets, all resolve). APPENDS +89 SME_REFERENCE nodes: economics +59 "
         "(6+53; official 318 intact, digest 0a8196e92befa0c4), biology +30 (6+24; official "
         "204 intact, digest 9a17b68b01a53133); BYTE-LEVEL DISCIPLINE: the builder "
         "auto-detects the byte format by requiring a byte-identical round-trip of the "
         "pristine file before appending (no reformatting); removal round-trip asserted "
         "byte-identical per course; official nodes list-equal per course; FIXTURES MERGED "
         "into sme-wave9-fixtures.json (13 courses) with the prior 11 blocks byte-preserved "
         "(asserted deep-equal by the builder), each new block carrying fetched 2026-11-15. "
         "GATE verify_sme_wave9.ts extended to 13 courses: PASS — spine digests + 12 section "
         "rows + 77 topic rows all SME_REFERENCE verbatim, per-row CORPUS counts pinned "
         "through the resolution law, economics ALL 159 notes resolve, biology ALL 142 notes "
         "+ 21 sets resolve, drift rows exactly the documented 0/3, deep links resolve, "
         "official tree.topics carries zero SME codes. ACCEPTANCE (the tranche-3/4 set): "
         "wave1 + wave7 + wave8 + cosmetics1 PASS; wire_r0 PASS (2,574 placed / 0 unplaced — "
         "byte-identical to the tranche-3/4 records); bun run typecheck (root, CI parity) "
         "rc=0 5/5 turbo tasks; bundle-seed + books-bundle-spine band 79 pass / 0 fail; hub "
         "lib battery at the lane tree: 5 standing fails (1,043 tests / 40,005 expects), the "
         "standing set's upstream drift continuing (10 -> 9 -> 5): T-UGM-RENDER-1 katex red "
         "+ 4 store-laws deck-sessions lines — other lanes' surfaces, zero new failures from "
         "this lane. PRE-EXISTING DEBTS DISCLOSED NOT TOUCHED (zero contact with this lane's "
         "files): verify_sme_wave6 2 failures 'spec points 34 != 36' (RN-DEBRIS-11 run-023 "
         "class; W6-1 run-003 pin-refresh queued). EFFECT OF RECORD: the queue pair's "
         "/revision-notes selectors now mirror SaveMyExams' own Revision-Notes organization "
         "verbatim with corpus-true counts; the loose-notes cards empty (301 formerly-loose "
         "notes now have rows); fleet-wide 40 layered courses / 4,423 resolved / user-facing "
         "loose 4,929 -> 4,628; next-tranche queue re-measured (user-facing: "
         "igcse-maths-a-18-foundation 139, cie-igcse-physics-23 138, cie-as-chemistry-25 134). "
         "Census engines: rn_selector_census.ts (untouched) + w9_sme_census.ts (read-only). "
         "STANDING-REMINDER FILING LAW NOTE: the dual ledgers' reminder filings DIVERGED "
         "upstream (root ledger through TWENTY-THIRD, .syllabai ledger through TWENTY-FIFTH "
         "— the intervening register lanes filed unevenly); this tranche files the repo-wide "
         "next number TWENTY-SIXTH on BOTH ledgers. "
         "Lane artifacts .syllabai/lane-artifacts/T-SME-SEL-W9-5/run-001/ (parsed live RN "
         "trees + builder + audit + worklog scripts); receipt "
         ".syllabai/receipts/T-SME-SEL-W9-5/run-001.md; task card T-SME-SEL-W9-5.yaml "
         "IN_REVIEW; author does not self-merge; no DB contact; fetch-first race-guard at "
         "push; no force")

REMINDER = ("Standing reminder (TWENTY-SIXTH filing): the PAT remains exposed from chat "
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

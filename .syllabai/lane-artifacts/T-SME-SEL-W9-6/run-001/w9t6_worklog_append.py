#!/usr/bin/env python3
"""T-SME-SEL-W9-6 run-001 — dual worklog append (append-only; the lane suffix
is appended byte-exact at the tail of BOTH ledgers; prefix byte-identity
asserted pre/post)."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-6 run-001 — SME picker layer wave 9, tranche 6: the Revision-Notes "
         "picker mirror for the queue pair (PR of record opened for the integrator; branch "
         "t-sme-sel-w9-6/run-001 from origin/main 2be93676). Operator order 'Continue' executes "
         "the #1032 merge record's named next-tranche queue — igcse-maths-a-18-foundation "
         "(Pearson Edexcel 4MA1 Foundation) / cie-igcse-physics-23 (CIE 0625 2023-2025), "
         "user-facing ranks 1-2: BASELINE OF RECORD at main 2be93676 (the tranche-5 merge of "
         "record; no advances at lane open): 106 note-bearing courses / 9,151 notes; "
         "smeRowOfNote resolves 4,423 (the 40 layered courses); user-facing loose 4,628. "
         "TRANCHE: foundation 139/139 + physics 138/138 user-facing loose = 277 notes. LIVE "
         "FETCHES 2026-11-15 (polite curl, __NEXT_DATA__, URLs of record from the corpus "
         "notes' own sourceUrl — the foundation tree lives at the tier-qualified path "
         "/a/18/foundation/): foundation 7 sections/49 topics/139 subtopics, physics "
         "8/28/152. BIJECTION AUDIT OF RECORD (lane w9t6_live_audit.py): 0 note slugs "
         "missing / 0 set slugs missing / 0 title mismatches / 0 exact-one failures; BOTH "
         "COURSES SINGLE-MATCH throughout (no multiMatch class); DRIFT CLASSES OF RECORD "
         "(4 + 4, all 0-note 0-set, mirrored verbatim as empty rows and pinned by the gate's "
         "DRIFT_BY_COURSE): foundation exactly the higher-tier sibling's 4 past-paper "
         "placeholders (2023-june / 2023-june-r / 2023-november / specimen — the tranche-3 "
         "igcse-maths-a-18-higher precedent, same slugs); physics the 3 SME skills/exam-"
         "technique placeholders (exam-technique / handling-data-and-maths-skills / "
         "practical-and-investigative-skills — the tranche-5 igcse-biology-19 precedent) + "
         "june-2023 (a past-paper placeholder, the CIE naming variant). SET LAW: blanket "
         "tranche-1/2 (foundation 45 topic-class sets / physics 58, all resolve). APPENDS "
         "+92 SME_REFERENCE nodes: foundation +56 (7+49; official 204 intact, digest "
         "a89a3c267a5d0b61), physics +36 (8+28; official 325 intact, digest ffbfdbce8d364064); "
         "BYTE-LEVEL DISCIPLINE: the builder auto-detects the byte format by requiring a "
         "byte-identical round-trip of the pristine file before appending (no reformatting); "
         "removal round-trip asserted byte-identical per course; official nodes list-equal "
         "per course; FIXTURES MERGED into sme-wave9-fixtures.json (15 courses) with the "
         "prior 13 blocks byte-preserved (asserted deep-equal by the builder), each new "
         "block carrying fetched 2026-11-15. GATE verify_sme_wave9.ts extended to 15 "
         "courses: PASS — spine digests + 15 section rows + 77 topic rows all SME_REFERENCE "
         "verbatim, per-row CORPUS counts pinned through the resolution law, foundation ALL "
         "139 notes + 45 sets resolve, physics ALL 138 notes + 58 sets resolve, drift rows "
         "exactly the documented 4/4, deep links resolve, official tree.topics carries zero "
         "SME codes. ACCEPTANCE (the tranche-3..5 set): wave1 + wave7 + wave8 + cosmetics1 "
         "PASS; wire_r0 PASS (2,574 placed / 0 unplaced — byte-identical to the tranche-3..5 "
         "records); bun run typecheck (root, CI parity) rc=0 5/5 turbo tasks; bundle-seed + "
         "books-bundle-spine band 79 pass / 0 fail; hub lib battery at the lane tree: 1 "
         "standing fail (1,043 tests / 40,010 expects), the standing set's upstream drift "
         "continuing (10 -> 9 -> 5 -> 1): only T-UGM-RENDER-1 katex red remains — the 4 "
         "store-laws deck-sessions failures fixed upstream since tranche 5; zero new "
         "failures from this lane. PRE-EXISTING DEBTS DISCLOSED NOT TOUCHED (zero contact "
         "with this lane's files): verify_sme_wave6 2 failures 'spec points 34 != 36' "
         "(RN-DEBRIS-11 run-023 class; W6-1 run-003 pin-refresh queued). EFFECT OF RECORD: "
         "the queue pair's /revision-notes selectors now mirror SaveMyExams' own "
         "Revision-Notes organization verbatim with corpus-true counts; the loose-notes "
         "cards empty (277 formerly-loose notes now have rows); fleet-wide 42 layered "
         "courses / 4,700 resolved / user-facing loose 4,628 -> 4,351; next-tranche queue "
         "re-measured (user-facing: cie-as-chemistry-25 134, cie-a-level-business-23 131, "
         "igcse-physics-19 127, cie-as-biology-25 124). Census engines: rn_selector_census.ts "
         "(untouched) + w9_sme_census.ts (read-only). Lane artifacts "
         ".syllabai/lane-artifacts/T-SME-SEL-W9-6/run-001/ (parsed live RN trees + builder "
         "+ audit + worklog scripts); receipt .syllabai/receipts/T-SME-SEL-W9-6/run-001.md; "
         "task card T-SME-SEL-W9-6.yaml IN_REVIEW; author does not self-merge; no DB "
         "contact; fetch-first race-guard at push; no force")

REMINDER = ("Standing reminder (TWENTY-SEVENTH filing): the PAT remains exposed from chat "
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

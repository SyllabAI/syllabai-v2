#!/usr/bin/env python3
"""T-SME-SEL-W6-1 run-003 — dual worklog append (append-only; the lane suffix
is appended byte-exact at the tail of BOTH ledgers; prefix byte-identity
asserted pre/post). Same shape as the tranche-12 lane artifact."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W6-1 run-003 — the SECOND wave-6 SPINE re-pin: the RN-DEBRIS-11 run-023 "
         "class debt CLOSED (PR of record opened for the integrator; branch "
         "t-sme-sel-w6-1/run-003-pin-refresh from origin/main 2e119201). Operator order 'W6-1 "
         "run-003 pin-refresh' executes the standing queued debt disclosed in every "
         "tranche-5..12 receipt. THE DEBT: verify_sme_wave6 failed exactly 2 items — 'spec "
         "points 34 != 36' x2 (cie-as-maths-20-pure-1, cie-a-level-maths-20-pure-1 — the "
         "shared-module Pure 1 pair, module mod_cvTVPZXHzSYbgzXW). Run-002 re-pinned these "
         "pins 33->36 for RN-DEBRIS-11 run-020's +3 adds (1.3.3/1.3.4/1.3.5); the pins were "
         "NOT re-pinned again when RN-DEBRIS-11 run-023 (PR #979, 2026-11-13) applied its "
         "letter-tail variant dedup. THE CORPUS OF RECORD (independently recounted for this "
         "run): both pure-1 curricula now carry exactly 34 SPEC_POINTs with identical shape "
         "(1.1x5, 1.2x5, 1.3x5, 1.4x2, 1.5x5, 1.6x4, 1.7x4, 1.8x4) — section 1.3 = "
         "1.3.1/1.3.2/1.3.3/1.3.4/1.3.5 with the run-020 adds all surviving and the "
         "letter-tail variants 1.3.1a and 1.3.2a GONE (-2 from the run-002 shape of 36); "
         "topics: 1 / subs: 8 unchanged (the gate re-asserts both green — run-023 removed "
         "SPEC_POINT rows only). THE RUN (bookkeeping-only, ZERO corpus bytes): one file, "
         "two lines — the SPINE constants in apps/hub/scripts/verify_sme_wave6.ts (lines "
         "68/71): points 36 -> 34 x2; repo-wide sweep 'grep points: 36' across apps/hub/"
         "scripts, apps/api, packages — ONLY these two lines; no other stale pin for these "
         "courses anywhere; no curriculum/questions/notes/fixtures byte touched. GATES "
         "(re-run at the run head): verify_sme_wave6 PASS — 0 failures (FIRST GREEN SINCE "
         "RUN-020 LANDED — both prior reds closed): spines 1/8/34 x2 + the six untouched "
         "courses 1/5/22, 1/5/17, 1/9/43, 1/5/22, 1/5/17, 1/5/18; 156 SME_REFERENCE nodes; "
         "39 runtime smeSections; 117 rows pinned to corpus counts; drift law BY TOPIC with "
         "the one pinned variant; deep links resolve. verify_sme_wave1-5, wave7, wave8 + "
         "cosmetics1 ALL PASS; wire_r0 2,574 placed / 0 unplaced; CI-verify reproduction 0 "
         "fail (3,548 tests / 44,771 expects); bun run typecheck rc=0. RECYCLE STANDING "
         "LESSON RE-HIT AND HANDLED per the sharpened wording: the first install of the day "
         "ran before the reset to the final tree 2e119201 — typecheck 127; re-install AT "
         "THE FINAL TREE (40 pkgs topped up) restored it. Hub lib battery: the 6 standing "
         "fails of record at the pristine base (the #1041 window's set) — zero contact with "
         "this lane's files (a script-only edit). BOOKKEEPING: task card T-SME-SEL-W6-1.yaml "
         "status comment gains the run-003 line (status stays MERGED — run-001 PR #942, "
         "run-002 the first re-pin, run-003 this second re-pin); receipt "
         ".syllabai/receipts/T-SME-SEL-W6-1/run-003.md; lane artifacts "
         ".syllabai/lane-artifacts/T-SME-SEL-W6-1/run-003/; author does not self-merge; no "
         "DB contact; fetch-first race-guard at push; no force")

REMINDER = ("Standing reminder (THIRTY-FOURTH filing): the PAT remains exposed from chat "
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

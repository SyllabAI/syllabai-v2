#!/usr/bin/env python3
"""T-SME-SEL-W9-3 run-001 — dual worklog AMENDMENT append (append-only; the
amendment suffix is appended byte-exact at the tail of BOTH ledgers; prefix
byte-identity asserted pre/post)."""
import sys

REPO = "/home/z/my-project/repos/syllabai-v2"

ENTRY = ("- T-SME-SEL-W9-3 run-001 amendment — the CI verify finding + fixes, disclosed: "
         "first CI run on the lane head 84f2fce0 came back hub/census/law-readback/"
         "coordination SUCCESS + verify FAILURE — 2 tests, both t-mig-133 band 133f (the "
         "books pipeline's 4MA1 slice, books-bundle-spine.test.ts, a battery the lane's "
         "local run had not covered): (1) the byte-digest pin HIGHER_SHA256 pins the sha256 "
         "of the REAL 4MA1 curriculum bytes and the disclosed append changed them — the pin "
         "failed exactly as designed ('drift fails this test first, loudly'); refreshed per "
         "the pin's own documented convention (two prior re-pin comments in place: 2ece53b / "
         "2e6dbe80) -> b78d6500066a397ffad20f0bde675cabfa501c6731107cd544baeaa6e4bef215, "
         "comment naming this receipt; (2) the spine census pin — buildBundleSpine's census "
         "counts every node (234 -> 303) because the adapter predates the SME fleet; fixed "
         "AT THE ADAPTER, law intent kept: bundle-spine.ts now skips provenanceTier "
         "SME_REFERENCE rows for census + spine (the same T-SME-SEL-W1/W2 class-2 exclusion "
         "the bundle-seed mapper/seeder already enforce, bundle-seed.ts:444-477), the census "
         "stays pinned to the OFFICIAL spine (234 / 6 topics / 39 subtopics / 188 points / "
         "byTier {Foundation 108, Higher 80} unchanged), official globalOrder positions "
         "unchanged (the appends sit at the nodes-array tail), BundleNodeLike gains the "
         "optional provenanceTier marker; the other 13 band tests (spine laws, join smoke, "
         "sort law, fail-closed laws, the foundation tier-generic instrument) passed "
         "untouched. POST-AMENDMENT BATTERY: band 15 pass / 0 fail; bun test apps/api "
         "packages (the CI Test step, run locally) 3,535 pass / 0 fail / 13 skip — "
         "byte-equal to the tranche-2 record's battery numbers; the amendment commit "
         "follows on the lane branch, CI re-polled. Receipt + task card amended in place "
         "(the receipt gains the 'CI verify finding + run-001 amendment' section; the card "
         "scope gains the two books files).")

SUFFIX = f"{ENTRY}\n"

for f in ["worklog.md", ".syllabai/worklog.md"]:
    p = f"{REPO}/{f}"
    before = open(p, encoding="utf-8").read()
    open(p, "w", encoding="utf-8").write(before + SUFFIX)
    after = open(p, encoding="utf-8").read()
    assert after.startswith(before) and after.endswith(SUFFIX) and after.count(SUFFIX) == 1
    print(f"{f}: +{len(SUFFIX)}B appended at tail (prefix byte-identity asserted)")
print("DUAL WORKLOG AMENDMENT APPEND OK")

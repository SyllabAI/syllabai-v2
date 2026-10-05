/**
 * T-MIG-024 (operator drain-cycle queue W2-F3 / R0-SWEEP-2 F-3 ruling) —
 * offline proof that the declared-unordered multiset rule resolves the
 * teacher-content-paper-review-realdata-200 ordering instability WITHOUT
 * widening anything else. No network, no Neon: everything runs against the
 * committed capture.
 *
 * Provenance: the capture over-pins unspecified DB heap order — frozen
 * ContentReviewService.java:869 questionVersions.findByPaperId(paperId) is a
 * Spring Data derived query with NO ORDER BY; the port (review-repos.ts:125
 * findByPaperId) is equally unordered (R0 ruled faithful). setcheck.ts
 * (receipts/T-MIG-022) proved the SAME multiset (6/6 versionIds, 6/6
 * questionIds, identical paper header) in a DIFFERENT sequence. This tool
 * pins the COMPARATOR side of that ruling against the real case file.
 *
 * Run: bun golden/tools/reorder-check.ts   (exit 0 = all checks hold)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deepEqualTolerant } from "../runner";

type Body = Record<string, unknown>;

const casePath = join(
  import.meta.dir,
  "..",
  "cases",
  "teacher-content-paper-review-realdata-200.json",
);
const kase = JSON.parse(readFileSync(casePath, "utf8")) as {
  expect: { body: Body };
  unordered?: string[];
};
const original = kase.expect.body;
const expectBody = structuredClone(original);
const versions = expectBody.versions as unknown[];
const decl = kase.unordered ?? [];

let failed = 0;
function check(name: string, pass: boolean): void {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) failed++;
}

// 0. the case must actually declare exactly the path under test
check(
  "case declares unordered == ['versions']",
  JSON.stringify(decl) === JSON.stringify(["versions"]),
);

// 1. identity — the stable side of the body must keep passing untouched
check(
  "identity body passes",
  deepEqualTolerant(structuredClone(original), expectBody, [], decl),
);

// 2. deterministic reorder #1: rotate-by-one — same multiset, different order
const rotated: Body = {
  ...structuredClone(expectBody),
  versions: [...versions.slice(1), versions[0]],
};
check(
  `versions[] rotate-by-one passes (multiset semantics, n=${versions.length})`,
  deepEqualTolerant(structuredClone(original), rotated, [], decl),
);

// 3. deterministic reorder #2: full reverse — same multiset
const reversed: Body = {
  ...structuredClone(expectBody),
  versions: [...versions].reverse(),
};
check(
  "versions[] full reverse passes (multiset semantics)",
  deepEqualTolerant(structuredClone(original), reversed, [], decl),
);

// 4. multiset is not a set — a marks mutation must FAIL even under unordered
const mutated = structuredClone(rotated) as Body;
const elems = mutated.versions as Record<string, unknown>[];
elems[0] = { ...elems[0], marks: 999999 };
check(
  "single marks mutation fails (different multiset)",
  !deepEqualTolerant(structuredClone(original), mutated, [], decl),
);

// 5. undeclared paths stay strict — the paper header is order/value-pinned
const paperMut = structuredClone(rotated) as Body;
(paperMut.paper as Body).id = "00000000-0000-0000-0000-000000000000";
check(
  "paper.id mutation fails (undeclared path strict)",
  !deepEqualTolerant(structuredClone(original), paperMut, [], decl),
);

// 6. the declaration is load-bearing — the same reorder FAILS without it
//    (proves the re-pin is necessary, not vacuous)
check(
  "same rotate fails WITHOUT the unordered declaration",
  !deepEqualTolerant(structuredClone(original), rotated, [], []),
);

// 7. arrays INSIDE declared elements keep strict order
const v0 = (rotated.versions as Body[])[0];
const opts = v0.options;
if (Array.isArray(opts) && opts.length > 1) {
  const nested = structuredClone(rotated) as Body;
  ((nested.versions as Body[])[0] as Body).options = [
    ...(opts as unknown[]),
  ].reverse();
  check(
    "options[] inside a version element keeps strict order",
    !deepEqualTolerant(structuredClone(original), nested, [], decl),
  );
} else {
  console.log("SKIP nested-options check (rotated element 0 has no multi-item options[])");
}

if (failed > 0) {
  console.error(`\nreorder-check FAILED: ${failed} check(s)`);
  process.exit(1);
}
console.log(
  "\nreorder-check OK: declared-unordered multiset rule resolves F-3 without widening any other structure",
);

/**
 * T-MIG-024 (W2-F3) — comparator-law proof for the declared-unordered multiset
 * machinery, RE-FRAMED by the R0 F-3 re-examination of ruling 5990536177
 * (operator directive trace 1a10b7fe85b49a21): the original premise
 * ("findByPaperId has no ORDER BY") is DISPROVEN at frozen source —
 * QuestionVersionRepository.findByPaperId (:46-51 @ 6cad6ef) carries
 * `order by v.question.externalRef nulls last, v.version desc`. The port
 * implements that ORDER BY (review-repos.ts) and the case stays STRICTLY
 * order-pinned — the "unordered" declaration was REMOVED from
 * teacher-content-paper-review-realdata-200. No network, no Neon.
 *
 * This tool now proves BOTH postures against the real committed capture:
 *   (a) with the multiset spec INLINE (spec = ["versions"]) — rotate/reverse
 *       compare equal: the machinery is sound and available for genuinely
 *       unordered legs (e.g. MarkSchemeRepository.findByPaperId, no ORDER BY);
 *   (b) with NO spec — the case's LIVE posture: the same reorders FAIL, i.e.
 *       the golden gate strictly pins the Java-deterministic versions[] order.
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
// INLINE spec — exists ONLY for this comparator proof (posture (a)). The case
// file itself declares NOTHING: versions[] is Java-deterministic post-rework.
const spec: string[] = ["versions"];

let failed = 0;
function check(name: string, pass: boolean): void {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) failed++;
}

// 0. the case's LIVE posture must be STRICT — no unordered declaration
check(
  "case declares NO unordered (versions[] strictly order-pinned post-rework)",
  kase.unordered === undefined,
);

// 1. identity — passes under BOTH postures
check(
  "identity body passes",
  deepEqualTolerant(structuredClone(original), expectBody, [], spec),
);

// 2. deterministic reorder #1: rotate-by-one — same multiset, different order
const rotated: Body = {
  ...structuredClone(expectBody),
  versions: [...versions.slice(1), versions[0]],
};
check(
  `versions[] rotate-by-one passes WITH inline spec (multiset machinery sound, n=${versions.length})`,
  deepEqualTolerant(structuredClone(original), rotated, [], spec),
);

// 3. deterministic reorder #2: full reverse — same multiset
const reversed: Body = {
  ...structuredClone(expectBody),
  versions: [...versions].reverse(),
};
check(
  "versions[] full reverse passes WITH inline spec (multiset machinery sound)",
  deepEqualTolerant(structuredClone(original), reversed, [], spec),
);

// 4. multiset is not a set — a marks mutation must FAIL even under the spec
const mutated = structuredClone(rotated) as Body;
const elems = mutated.versions as Record<string, unknown>[];
elems[0] = { ...elems[0], marks: 999999 };
check(
  "single marks mutation fails (different multiset)",
  !deepEqualTolerant(structuredClone(original), mutated, [], spec),
);

// 5. undeclared paths stay strict — the paper header is order/value-pinned
const paperMut = structuredClone(rotated) as Body;
(paperMut.paper as Body).id = "00000000-0000-0000-0000-000000000000";
check(
  "paper.id mutation fails (undeclared path strict)",
  !deepEqualTolerant(structuredClone(original), paperMut, [], spec),
);

// 6. the case's LIVE posture is strict — the same reorder FAILS with no spec
//    (post-rework law: versions[] order is Java-deterministic and pinned)
check(
  "same rotate fails with NO spec (the case's live strict posture)",
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
    !deepEqualTolerant(structuredClone(original), nested, [], spec),
  );
} else {
  console.log("SKIP nested-options check (rotated element 0 has no multi-item options[])");
}

if (failed > 0) {
  console.error(`\nreorder-check FAILED: ${failed} check(s)`);
  process.exit(1);
}
console.log(
  "\nreorder-check OK: multiset machinery sound AND the live case stays strictly order-pinned (F-3 re-ruling: port ORDER BY restored, zero golden weakening)",
);

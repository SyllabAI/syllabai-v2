/**
 * Per-slug census dump: expectedQuestions/expectedParts per roster entry (zero-DB).
 * The run-008 audit tool: proves the part-ROW law split per bank.
 * Usage: bun scripts/census_per_slug.ts
 */
import { loadRoster } from "../apps/api/scripts/cie-phase4-apply.ts";

const roster = loadRoster();
let tq = 0, tp = 0, tqpkg = 0, rq = 0, rp = 0;
console.log("slug\tcls\texpQ\texpP\texpPkgP\trawQ\trawP\tunmapped\tbadSum\tdupOrder");
for (const e of roster.entries) {
  const ex = e.shimExclusions ?? { unmapped: 0, badSum: 0, dupOrder: 0 };
  console.log(
    [e.slug, e.cls, e.expectedQuestions, e.expectedParts, e.expectedPackageParts, e.rawQuestions, e.rawParts, ex.unmapped, ex.badSum, ex.dupOrder].join("\t"),
  );
  tq += e.expectedQuestions; tp += e.expectedParts; tqpkg += e.expectedPackageParts;
  rq += e.rawQuestions; rp += e.rawParts;
}
console.log(`TOTAL\t\t${tq}\t${tp}\t${tqpkg}\t${rq}\t${rp}`);

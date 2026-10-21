/**
 * The run-008 part-ROW law verifier (zero-DB):
 * expectedParts' = per-question (hasOptionPart ? plainParts.length : parts.length)
 * — the census mirror of the frozen MIXED emission (option-bearing parts become
 * MCQ question rows, not part rows). Run against any fleet receipt's per-slug
 * parts to prove 0-mismatch.
 * Usage: bun scripts/verify_part_row_law.ts [fleetLogFile]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSmePackage } from "../apps/api/src/services/sme/bundle-questions.ts";

const HUB = "apps/hub/content";
const reg = JSON.parse(readFileSync(join(HUB, "courses.json"), "utf8"));
const rows = Array.isArray(reg) ? reg : (reg.courses ?? []);
const cie = rows.filter((r) => r.board === "Cambridge International");

let tExp = 0, tPkg = 0;
const perSlug: Record<string, { rowParts: number; pkgParts: number }> = {};
for (const row of cie) {
  const dir = join(HUB, row.slug);
  let sets;
  try {
    sets = JSON.parse(readFileSync(join(dir, "questions.json"), "utf8"));
  } catch { continue; }
  if (!Array.isArray(sets) || sets.length === 0) continue;
  const curriculum = JSON.parse(readFileSync(join(dir, "curriculum.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const pkg = buildSmePackage({
    courseSlug: row.slug, curriculum, sets,
    generatedUtc: manifest.generatedUtc,
    importRef: manifest.importSource.ref.replace(/^main@/, ""),
  });
  let rowParts = 0;
  for (const q of pkg.questions) {
    if (q.questionType !== "STRUCTURED" || q.parts === null) continue;
    const hasOptionPart = q.parts.some((p) => p.options !== null && p.options.length > 0);
    rowParts += hasOptionPart ? q.parts.filter((p) => p.options === null || p.options.length === 0).length : q.parts.length;
  }
  perSlug[row.slug] = { rowParts, pkgParts: pkg.counts.parts };
  tExp += rowParts; tPkg += pkg.counts.parts;
}
console.log("TOTAL part-ROW law:", tExp, "| package parts:", tPkg, "| delta (the option-part class):", tPkg - tExp);

const logFile = process.argv[2];
if (logFile) {
  const fleet: Record<string, number> = {};
  for (const line of readFileSync(logFile, "utf8").split("\n")) {
    const m = line.match(/\[apply\] (\S+) \(real, \d+\) ok=true.*?parts=(\d+)/);
    if (m) fleet[m[1]] = parseInt(m[2]);
  }
  let mismatch = 0;
  for (const [slug, { rowParts }] of Object.entries(perSlug)) {
    const f = fleet[slug];
    if (f !== undefined && f !== rowParts) { console.log("MISMATCH", slug, "law:", rowParts, "fleet:", f); mismatch++; }
  }
  console.log("per-slug mismatches vs fleet:", mismatch, "of", Object.keys(perSlug).length, "banks compared");
}

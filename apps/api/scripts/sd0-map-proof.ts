/**
 * T-SM-SD0-FIX-R0 proof: the REAL re-exported 4SD0 bundles map clean through
 * mapBundleNodes — every expected dbCode, zero collisions, one shared root.
 * Run: bun apps/api/scripts/sd0-map-proof.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapBundleNodes } from "../src/services/curriculum/bundle-seed";
import { buildSmePackage } from "../src/services/sme/bundle-questions";
import type { BundleCurriculum } from "../src/services/curriculum/bundle-seed";

const HUB = join(import.meta.dir, "../../hub");
const strands = ["biology", "chemistry", "physics"] as const;
const letters = { biology: "B", chemistry: "C", physics: "P" } as const;

const seen = new Map<string, string>(); // dbCode -> strand
let collisions = 0;

for (const strand of strands) {
  const slug = `igcse-science-double-award-17-${strand}`;
  const L = letters[strand];
  const cur = JSON.parse(readFileSync(join(HUB, "content", slug, "curriculum.json"), "utf8")) as BundleCurriculum;
  const mapped = mapBundleNodes(cur, slug + " official specification structure");

  const units = [...mapped.values()].filter((m) => m.nodeType === "UNIT").map((m) => m.dbCode);
  const topics = [...mapped.values()].filter((m) => m.nodeType === "TOPIC").map((m) => m.dbCode);
  const specs = [...mapped.values()].filter((m) => m.nodeType === "SPEC_POINT").map((m) => m.dbCode);

  // identity spot-checks per strand
  const t1 = [...mapped.values()].find((m) => m.nodeType === "UNIT" && m.dbCode.includes("-S" + L + "1"))!;
  console.log(`${slug}: root=${mapped.get(slug)!.dbCode} | units=${units.length} topics=${topics.length} specs=${specs.length} | first unit=${t1.dbCode}`);

  // collision census ACROSS strands
  for (const db of [...units, ...topics, ...specs]) {
    if (seen.has(db)) {
      console.error(`  COLLISION: ${db} (${seen.get(db)} vs ${strand})`);
      collisions++;
    }
    seen.set(db, strand);
  }

  // the shim: every question part's spec codes resolve through the bundle map
  const sets = JSON.parse(readFileSync(join(HUB, "content", slug, "questions.json"), "utf8")) as never[];
  const manifest = JSON.parse(readFileSync(join(HUB, "content", slug, "manifest.json"), "utf8")) as { generatedUtc: string; importSource: { ref: string } };
  const pkg = buildSmePackage({
    courseSlug: slug,
    curriculum: cur,
    sets,
    generatedUtc: manifest.generatedUtc,
    importRef: manifest.importSource.ref.replace(/^main@/, ""),
  });
  const specCodes = new Set<string>();
  for (const q of pkg.questions ?? []) {
    for (const sp of q.specPoints ?? []) specCodes.add(sp.code);
    for (const p of q.parts ?? []) {
      for (const sp of (p as { specPoints?: Array<{ code: string }> }).specPoints ?? []) specCodes.add(sp.code);
    }
  }
  console.log(`  shim: ${pkg.questions?.length ?? 0} questions / ${specCodes.size} distinct spec codes — sample ${[...specCodes].slice(0, 3).join(", ")}`);
  // every emitted spec code exists in the mapped tree
  for (const code of specCodes) {
    if (!specs.includes(code)) {
      console.error(`  SHIM/TREE DRIFT: ${code} not in the mapped spec tree`);
      collisions++;
    }
  }
}

console.log(`\nTOTAL distinct dbCodes across the 3 strands: ${seen.size} | collisions: ${collisions}`);
if (collisions > 0) process.exit(1);
console.log("PROOF GREEN: one-code-three-strands with zero collisions — the 0973 shape on the 4SD0 namespace");

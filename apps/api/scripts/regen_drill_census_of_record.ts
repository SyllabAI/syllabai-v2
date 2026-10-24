/**
 * Regenerate apps/api/src/services/drill/census-of-record.json — the F-182
 * anti-drift artifact — over the SPLIT bank of record (questions.json +
 * official-papers.json). One-shot maintenance script (IA split, 2026-10).
 *
 * Run: bun apps/api/scripts/regen_drill_census_of_record.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeCensus } from "../src/services/drill/census";

const HUB = join(import.meta.dir, "../../hub/content");
const COURSE = "igcse-chemistry-19";
const sets = [
  ...JSON.parse(readFileSync(join(HUB, COURSE, "questions.json"), "utf8")),
  ...JSON.parse(readFileSync(join(HUB, COURSE, "official-papers.json"), "utf8")),
];
const curriculum = JSON.parse(
  readFileSync(join(HUB, COURSE, "curriculum.json"), "utf8"),
) as { nodes: { code: string; family: string }[] };

const census = computeCensus(
  COURSE,
  `apps/hub/content/${COURSE}/{questions,official-papers}.json`,
  sets,
  curriculum.nodes,
);

const out = join(import.meta.dir, "../src/services/drill/census-of-record.json");
writeFileSync(out, JSON.stringify(census, null, 2) + "\n");
console.log("census-of-record.json regenerated:", out);
console.log("bundle:", JSON.stringify(census.bundle));
console.log("coverage:", JSON.stringify(census.coverage));

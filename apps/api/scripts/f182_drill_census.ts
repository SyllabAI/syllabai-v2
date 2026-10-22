#!/usr/bin/env bun
/**
 * F-182 opening — regenerate the drill census of record.
 *
 * Usage (repo root):  bun apps/api/scripts/f182_drill_census.ts
 *
 * Reads the served bundle of record (apps/hub/content/igcse-chemistry-19/)
 * and rewrites apps/api/src/services/drill/census-of-record.json. The output
 * is a pure function of the bundle bytes (no wall-clock fields), so an
 * unchanged bundle regenerates byte-identical output; the committed artifact
 * is pinned by apps/api/test/drill/draw.test.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { computeCensus, type BundleSet, type CurriculumNode } from "../src/services/drill/census";

const HUB = join(import.meta.dir, "../../hub/content");
const COURSE = "igcse-chemistry-19";
const SOURCE = `apps/hub/content/${COURSE}/questions.json`;

const sets = JSON.parse(readFileSync(join(HUB, COURSE, "questions.json"), "utf8")) as BundleSet[];
const curriculum = JSON.parse(readFileSync(join(HUB, COURSE, "curriculum.json"), "utf8")) as {
  nodes: CurriculumNode[];
};

const census = computeCensus(COURSE, SOURCE, sets, curriculum.nodes);
const out = join(import.meta.dir, "../src/services/drill/census-of-record.json");
writeFileSync(out, `${JSON.stringify(census, null, 2)}\n`);

const c = census.coverage;
console.log(
  `census of record written: ${out}\n` +
    `  bundle: ${census.bundle.sets} sets (${census.bundle.officialSets} official) / ` +
    `${census.bundle.questions} Q / ${census.bundle.parts} P\n` +
    `  eligible parts: ${census.eligibility.officialParts} official + ${census.eligibility.topicParts} topic` +
    ` = ${census.eligibility.eligibleParts}; without codes: ${census.eligibility.partsWithoutCodes}\n` +
    `  spine: ${census.coverage.specPointAddresses} SPEC_POINT addresses; ` +
    `covered ${c.covered}; drillable ${c.drillable}; thin ${c.thin}; uncovered ${c.uncovered}\n` +
    `  unmapped questions: ${census.eligibility.unmappedQuestions.length}`,
);

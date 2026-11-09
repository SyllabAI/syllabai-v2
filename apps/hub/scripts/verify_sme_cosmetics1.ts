/**
 * ADR-039 r4 gate — the chemistry spine-cosmetics lane (T-SME-SEL-COSM-1).
 *
 * Fixes of record (each evidenced, disclosed — never silent):
 *
 *   1. T8 title restored  — "Redox Chemistry and Groups 1, 2 and 7"
 *      Evidence: Pearson Edexcel IAL Chemistry spec, Issue 1, September 2017
 *      (Official-Specifications/ial-chemistry/International-A-Level-Chemistry-Spec.pdf
 *      @ syllabai-resources pin 1a5c37bc; extraction line 1267 "Topic 8: Redox
 *      Chemistry and Groups 1, 2 and 7"). The corpus truncation dropped " 7".
 *      Applied to the TOPIC row and its :SUB_ container (both serve the title).
 *
 *   2. T19 title restored — "Organic Nitrogen Compounds: Amines, Amides,
 *      Amino Acids and Proteins". Same spec, extraction lines 2616-2617; the
 *      corpus truncation sits EXACTLY at the PDF's line wrap ("Amines, Amides,"
 *      | "Amino Acids and Proteins"), which is how the import lost the tail.
 *
 *   3. Synoptic setName restored — the ial-chemistry-17 set
 *      synoptic-exam-questions-section-c--exam-questions carried setName null
 *      while every other set carries the kind label ("Multiple-Choice
 *      Questions" / "Structured Questions"); its slug suffix --exam-questions
 *      and SME's own per-topic set naming give the evidenced value
 *      "Exam Questions".
 *
 *   4. Derived-data freshness — public/kg/data/ial-chemistry-17.json is
 *      kg_export.py output; its T8/T19 labels must equal the serving
 *      curriculum titles (the file had gone stale at the 2026-11-05 vintage;
 *      this lane regenerated it, which also reconciles the wave-1 SME layer
 *      the kg had never consumed — disclosed in the ADR r4 note).
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_cosmetics1.ts   (repo root)
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url); // apps/hub/
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

const T8 = "Redox Chemistry and Groups 1, 2 and 7";
const T19 = "Organic Nitrogen Compounds: Amines, Amides, Amino Acids and Proteins";

const course = "ial-chemistry-17";
const contentDir = new URL(`content/${course}/`, ROOT);
const curriculum = JSON.parse(
  readFileSync(new URL("curriculum.json", contentDir), "utf-8"),
) as { nodes: Array<{ code: string; family: string; title: string | null }> };
const questions = JSON.parse(
  readFileSync(new URL("questions.json", contentDir), "utf-8"),
) as Array<{ slug: string; name: string; setName: string | null }>;

console.log(`\n=== ${course} (ADR-039 r4 cosmetics)`);

// 1+2. title restores — TOPIC rows and their :SUB_ containers
for (const [code, want] of [
  ["ial-chemistry-T8", T8],
  ["ial-chemistry-T8:SUB_", T8],
  ["ial-chemistry-T19", T19],
  ["ial-chemistry-T19:SUB_", T19],
] as const) {
  const node = curriculum.nodes.find((n) => n.code === code);
  if (!node) fail(`node ${code} missing`);
  else if (node.title !== want) fail(`node ${code} title ${JSON.stringify(node.title)} != ${JSON.stringify(want)}`);
  else ok(`${code} title == official spec title`);
}

// the truncation must be gone from the whole serving corpus
const allTitles = curriculum.nodes.map((n) => n.title ?? "");
if (allTitles.some((t) => t.endsWith("Groups 1, 2 and") || t.endsWith("Amides,")))
  fail("a truncated title survives in curriculum.json");
else ok("no truncated title survives (T8 '…Groups 1, 2 and' / T19 '…Amides,')");

// spine still intact: 20 official TOPIC rows, 319 spec points, 7 SME sections
const spine = curriculum.nodes.filter((n) => n.family === "TOPIC" && !/-SME-S\d+$/.test(n.code));
const pts = curriculum.nodes.filter((n) => n.family === "SPEC_POINT");
const smeSecs = curriculum.nodes.filter((n) => n.family === "TOPIC" && /-SME-S\d+$/.test(n.code));
if (spine.length !== 20) fail(`official spine topics ${spine.length} != 20`);
else ok("official spine topics 20/20");
if (pts.length !== 319) fail(`spec points ${pts.length} != 319`);
else ok("spec points 319/319");
if (smeSecs.length !== 7) fail(`SME section rows ${smeSecs.length} != 7`);
else ok("SME picker layer intact (7 section rows)");

// 3. the synoptic setName law
const sets = questions;
const syn = sets.find((s) => s.slug === "synoptic-exam-questions-section-c--exam-questions");
if (!syn) fail("synoptic set row missing");
else if (syn.setName !== "Exam Questions") fail(`synoptic setName ${JSON.stringify(syn.setName)} != "Exam Questions"`);
else ok("synoptic set setName == \"Exam Questions\"");
const kinds = new Set(sets.map((s) => s.setName));
const LEGAL = new Set(["Multiple-Choice Questions", "Structured Questions", "Exam Questions"]);
const illegal = [...kinds].filter((k) => !LEGAL.has(k as string));
if (illegal.length) fail(`setName values outside the kind law: ${illegal.join(", ")}`);
else ok(`setName kind law holds across all ${sets.length} sets (null count 0)`);

// 4. derived kg data carries the serving titles
const kg = JSON.parse(
  readFileSync(new URL("public/kg/data/ial-chemistry-17.json", ROOT), "utf-8"),
) as {
  meta: { counts: { nodes: number } };
  nodes: Array<{ id: string; label?: string }>;
  sections: Record<string, { label?: string }>;
};
const kgLabels = JSON.stringify(kg);
for (const [want, what] of [
  [T8, "T8"],
  [T19, "T19"],
] as const) {
  if (!kgLabels.includes(want)) fail(`kg data missing full ${what} title`);
  else ok(`kg data carries the full ${what} title`);
}
if (kgLabels.includes("Groups 1, 2 and\"") || kgLabels.includes("Amides,\""))
  fail("kg data still carries a truncated label");
else ok("kg data carries no truncated label");

// the kg regeneration must not have dropped the concept-web tier of record
// (F8 rollout batch eighteen: 344 AI_SUGGESTED pre edges at the 2026-11-05 vintage)
const preEdges = (kg as unknown as { edges: Array<[string, string, string]> }).edges?.filter(
  (e) => e[2] === "pre",
).length ?? 0;
if (preEdges !== 344) fail(`kg pre-edge (concept web) count ${preEdges} != 344`);
else ok("kg concept-web tier intact (344 pre edges)");

if (failures) {
  console.error(`\nverify_sme_cosmetics1: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nverify_sme_cosmetics1: PASS");

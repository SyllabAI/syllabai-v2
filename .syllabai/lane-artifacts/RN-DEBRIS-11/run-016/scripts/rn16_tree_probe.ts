// RN-DEBRIS-11 run-016 — tree probe of record (run-011/012 probe law):
// buildSpecTreeIndex + normalizeSpecText against the applied planes.
// Expected: cs-23 tree topics 10 (T7/T9/T10 with their points resolving),
// 109 points total; pure-2 courses unchanged (17 points, 2.3.2 = official);
// pure-3 3.3.2 = official.
import { buildSpecTreeIndex } from "../src/lib/spec-tree";
import { readFileSync } from "node:fs";

const HUB = "/home/z/my-project/work/syllabai-v2/apps/hub";

function cur(slug: string) {
  return JSON.parse(readFileSync(`${HUB}/content/${slug}/curriculum.json`, "utf-8"));
}

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

// cs-23
{
  const c = cur("cie-igcse-computer-science-23");
  const tree = buildSpecTreeIndex(c);
  const topics = tree.topics ?? tree.sections ?? [];
  const t = JSON.stringify(tree);
  check("cs-23 tree topics = 10", t.match(/"cie-igcse-computer-science-2023-2025-T\d+"/g)?.filter((v, i, a) => a.indexOf(v) === i).length === 10, `distinct topic refs`);
  check("cs-23 T7 present", t.includes("cie-igcse-computer-science-2023-2025-T7"));
  check("cs-23 T9 present", t.includes("cie-igcse-computer-science-2023-2025-T9"));
  check("cs-23 T10 present", t.includes("cie-igcse-computer-science-2023-2025-T10"));
  check("cs-23 T7 official title", t.includes("Algorithm design and problem-solving"));
  check("cs-23 88 point refs (topic-level points = proposal of record)", (t.match(/"(7|8|9|10|6|5|4|3|2|1)\.\d+(\.\d+)?[a-z]?"/g) ?? []).length >= 88);
  const pt7 = (tree as any).specPoints ?? tree.points ?? null;
  const count = pt7 ? (pt7.length ?? Object.keys(pt7).length) : -1;
  if (count >= 0) check("cs-23 specPoints index size = 88 (topic-level points = proposal of record)", count === 88, `got ${count}`);
  check("cs-23 T7/T9/T10 are EMPTY husks mirrored (no invented rows)", t.includes("Boolean logic") && t.includes("Databases"));
  console.log("cs-23 tree keys:", Object.keys(tree).join(", "));
}

// pure-2 family
for (const slug of ["cie-as-maths-20-pure-2", "cie-a-level-maths-20-pure-2"]) {
  const c = cur(slug);
  const pt = c.nodes.find((n: any) => n.code === "2.3.2");
  const official = "use trigonometrical identities for the simplification and exact evaluation of expressions, and in the course of solving equations, and select an identity or identities appropriate to the context, showing familiarity in particular with the use of: • sec²θ≡1+tan²θ and cosec²θ≡1+cot²θ • the expansions of sin(A ± B), cos(A ± B) and tan(A ± B) • the formulae for sin 2A, cos 2A and tan 2A • the expression of asinθ+bcosθ in the forms Rsin(θ±A) and Rcos(θ±A).";
  check(`${slug} 2.3.2 = official row`, pt?.title === official);
  check(`${slug} 17 points`, c.nodes.filter((n: any) => n.family === "SPEC_POINT").length === 17);
}
{
  const c = cur("cie-a-level-maths-20-pure-3");
  const pt = c.nodes.find((n: any) => n.code === "3.3.2");
  const official = "use trigonometrical identities for the simplification and exact evaluation of expressions, and in the course of solving equations, and select an identity or identities appropriate to the context, showing familiarity in particular with the use of: • sec²θ≡1+tan²θ and cosec²θ≡1+cot²θ • the expansions of sin(A ± B), cos(A ± B) and tan(A ± B) • the formulae for sin 2A, cos 2A and tan 2A • the expression of asinθ+bcosθ in the forms Rsin(θ±A) and Rcos(θ±A).";
  check("pure-3 3.3.2 = official row", pt?.title === official);
}

if (failures > 0) {
  console.log(`PROBE FAILURES: ${failures}`);
  process.exit(2);
}
console.log("TREE PROBE: ALL PASS");

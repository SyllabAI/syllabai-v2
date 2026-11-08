/**
 * RN-DEBRIS-11 run-011 — the bun probes of record (tree consumer + render).
 *
 * P1 tree probe: buildSpecTreeIndex over the repaired curriculum — T1 must be
 *    the first topic with its 5 subtopics and 9 points; the tree totals must
 *    be 6 topics / 29 subtopics (25 real + 0 gen unless stamped) / 61 points.
 * P2 render check: normalizeSpecText over every new/riding title — all
 *    byte-faithful (run-010 G8 law).
 *
 * Run: bun scripts/rn11_run011_bun_probe.ts
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex } from "/home/z/my-project/work/syllabai-v2/apps/hub/src/lib/spec-tree";
import { normalizeSpecText } from "/home/z/my-project/work/syllabai-v2/apps/hub/src/lib/spec-text";

const HUB = "/home/z/my-project/work/syllabai-v2/apps/hub";
const SLUG = "cie-igcse-business-25";

const cur = JSON.parse(
  readFileSync(`${HUB}/content/${SLUG}/curriculum.json`, "utf8"),
);

const sets = JSON.parse(readFileSync(`${HUB}/content/${SLUG}/questions.json`, "utf8"));
const genTopics = (sets as { subtopicCode?: string }[])
  .filter((t) => t.subtopicCode?.endsWith("-gen"))
  .map((t) => t.subtopicCode!.slice(0, -4));

const index = buildSpecTreeIndex(cur, { generalTopics: genTopics });
const tree = index.tree;

let ok = true;
const assert = (cond: boolean, msg: string) => {
  if (!cond) ok = false;
  console.log(`${cond ? "OK  " : "BAD "} ${msg}`);
};

assert(tree.topics.length === 6, `tree topics == 6 (got ${tree.topics.length})`);
assert(tree.topics[0].title === "Understanding business activity",
  `topic 1 == 'Understanding business activity' (got '${tree.topics[0].title}')`);
assert(tree.topics[0].subtopics.length === 5,
  `T1 subtopics == 5 (got ${tree.topics[0].subtopics.length})`);
const t1Points = tree.topics[0].subtopics.flatMap((s) => s.specPointCodes);
assert(t1Points.length === 9,
  `T1 points == 9 (got ${t1Points.length})`);
assert(
  JSON.stringify(t1Points) ===
    JSON.stringify(["1.1.1", "1.2.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.4.1", "1.5.1", "1.5.2"]),
  "T1 point codes in official order",
);
const total = tree.topics.reduce((a, t) => a + t.specPointCount, 0);
assert(total === 61, `tree specPointCount total == 61 (got ${total})`);
const subCount = tree.topics.reduce((a, t) => a + t.subtopics.length, 0);
console.log(`INFO tree subtopic rows == ${subCount} (5 real T1 rows + 24 + gen rows)`);
// every T1 point resolves to its subtopic (the invisibility is gone)
for (const c of t1Points) {
  assert(index.subtopicOfSpecPoint.has(c), `subtopicOfSpecPoint resolves ${c}`);
}
// the 5 T1-stamped question sets resolve (placement continuity)
const t1Sets = (sets as { slug: string; subtopicCode?: string }[]).filter((s) =>
  s.subtopicCode?.includes("T1"),
);
assert(t1Sets.length === 5, `T1-stamped sets == 5 (got ${t1Sets.length})`);
for (const s of t1Sets) {
  assert(index.subtopicByCode.has(s.subtopicCode!),
    `set ${s.slug} home exists: ${s.subtopicCode}`);
}

const titles = [
  "Understanding business activity",
  "Business activity", "Economic sectors", "Enterprise, business growth and size",
  "Types of business organisation", "Business objectives and stakeholder objectives",
  "The nature of business activity: • factors of production: land, labour, capital and enterprise • concept of adding value and how added value can be increased • concept of opportunity cost",
  "Types of economic sector: • primary, secondary and tertiary sectors • private and public sectors",
  "Enterprise and entrepreneurship: • characteristics of successful entrepreneurs • purpose and key elements of a business plan: overview/summary, objectives, resources, market research, marketing, finance, people, operations • the importance of having a business plan • why governments support business start-ups • how governments support business start-ups, e.g. grants, advice, low-cost loans, training schemes",
  "The methods and problems of measuring business size: • methods of measuring business size, e.g. number of people employed, value of output/sales, volume of output/sales, capital employed (profit is not a method of measuring business size) • problems when measuring business size",
  "Why some businesses grow and others remain small: • why the owners of a business may want to grow the business • how and why businesses can grow internally, e.g. develop new products, develop new markets • how and why businesses can grow externally: mergers and takeovers, including horizontal integration, vertical integration • advantages and disadvantages of methods of growth • problems linked to business growth • why some businesses remain small",
  "Why some businesses succeed and others fail: • reasons why businesses succeed or fail, e.g. management skills, availability of finance, suitability of product, demand for products, changes in the economy, level of competition",
  "Different types of business organisation: • sole traders, partnerships, private limited companies and public limited companies • advantages and disadvantages of different types of business organisation • recommend and justify a suitable type of business organisation to owners/management for a given situation • different forms of business organisation: franchises, joint ventures, social enterprises • advantages and disadvantages of franchises for the franchisor and franchisee • advantages and disadvantages of joint ventures",
  "Business objectives: • businesses can have several objectives, e.g. survival, growth, profit, market share • the importance of business objectives",
  "The role of stakeholder groups: • internal stakeholder groups: owners (sole traders, partnerships, shareholders), managers, employees • external stakeholder groups: customers, suppliers, lenders/banks, government, local community • objectives of different stakeholder groups • how these objectives may conflict with each other",
];
let faithful = 0;
for (const t of titles) {
  const n = normalizeSpecText(t);
  if (n === t) faithful++;
  else { ok = false; console.log(`MANGLED «${t.slice(0, 60)}» -> «${n.slice(0, 60)}»`); }
}
assert(faithful === titles.length, `render check ${faithful}/${titles.length} byte-faithful`);

console.log(ok ? "PROBE: PASS" : "PROBE: FAIL");
if (!ok) process.exit(1);

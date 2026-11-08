/**
 * RN-DEBRIS-11 run-012 — the bun probes of record (tree consumer + render).
 *
 * P1 tree probes: buildSpecTreeIndex over the three touched curricula —
 *    business-25 unchanged shape (6/29/61) with the re-run's 71 tagged part
 *    codes resolving in subtopicOfSpecPoint; el20/el25 rebuilt spines
 *    (3 topics in blockOrder, 18 points) with every stamped set home existing.
 * P2 render check: normalizeSpecText over every new/riding title — all
 *    byte-faithful (run-010 G8 law).
 *
 * Run: bun .syllabai/lane-artifacts/RN-DEBRIS-11/run012docs/rn12_run012_bun_probe.ts
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex } from "/home/z/my-project/work/syllabai-v2/apps/hub/src/lib/spec-tree";
import { normalizeSpecText } from "/home/z/my-project/work/syllabai-v2/apps/hub/src/lib/spec-text";

const HUB = "/home/z/my-project/work/syllabai-v2/apps/hub";
let ok = true;
const assert = (cond: boolean, msg: string) => {
  if (!cond) ok = false;
  console.log(`${cond ? "OK  " : "BAD "} ${msg}`);
};

// ── business-25: shape unchanged; the re-run's tags resolve ──────────
{
  const cur = JSON.parse(readFileSync(`${HUB}/content/cie-igcse-business-25/curriculum.json`, "utf8"));
  const sets = JSON.parse(readFileSync(`${HUB}/content/cie-igcse-business-25/questions.json`, "utf8"));
  const genTopics = sets.filter((t) => t.subtopicCode?.endsWith("-gen"))
    .map((t) => t.subtopicCode!.slice(0, -4));
  const index = buildSpecTreeIndex(cur, { generalTopics: genTopics });
  const tree = index.tree;
  assert(tree.topics.length === 6, `b25 tree topics == 6 (got ${tree.topics.length})`);
  const total = tree.topics.reduce((a, t) => a + t.specPointCount, 0);
  assert(total === 61, `b25 tree specPointCount total == 61 (got ${total})`);
  const t1Sets = sets.filter((s) => (s.subtopicCode ?? "").includes("-T1:"));
  assert(t1Sets.length === 5, `b25 T1-stamped sets == 5 (got ${t1Sets.length})`);
  let taggedParts = 0, resolved = 0, legacyParts = 0;
  const t1Nine = new Set(["1.1.1", "1.2.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4",
    "1.4.1", "1.5.1", "1.5.2"]);
  for (const s of t1Sets) {
    assert(index.subtopicByCode.has(s.subtopicCode!), `b25 set home exists: ${s.subtopicCode}`);
    for (const q of s.questions ?? []) {
      for (const p of q.parts ?? []) {
        if (p.specPointCodes?.length) {
          taggedParts++;
          if (p.specPointCodes.every((c) => index.subtopicOfSpecPoint.has(c))) resolved++;
          if (!p.specPointCodes.every((c) => t1Nine.has(c))) legacyParts++;
        }
      }
    }
  }
  // 71 parts written by the run-012 re-run + 3 legacy parts (4.4.2, the
  // of-record spec-links cascade vintage — disclosed) in the SUB1.3 set
  assert(taggedParts === 74, `b25 tagged parts == 74 = 71 re-run + 3 legacy (got ${taggedParts})`);
  assert(resolved === 74, `b25 tagged parts all resolve in subtopicOfSpecPoint (${resolved}/74)`);
  assert(legacyParts === 3, `b25 legacy non-T1-code parts == 3 (got ${legacyParts})`);
  const titles = [
    "The nature of business activity: • factors of production: land, labour, capital and enterprise • concept of adding value and how added value can be increased • concept of opportunity cost",
    "1.1.1",
  ];
  assert(normalizeSpecText(titles[0]) === titles[0], "b25 riding title byte-faithful");
  assert(index.subtopicOfSpecPoint.get("1.1.1") !== undefined, "b25 1.1.1 resolves");
}

// ── el20 / el25: rebuilt spines ──────────────────────────────────────
for (const [slug, stampExpect] of [
  ["cie-igcse-english-language-20",
    ["cie-igcse-english-language-2024-2026-T1-gen", "cie-igcse-english-language-2024-2026-T2-gen"]],
  ["cie-igcse-english-language-25",
    ["cie-igcse-english-language-2027-2029-T1-gen", "cie-igcse-english-language-2027-2029-T2-gen"]],
] as [string, string[]][]) {
  const cur = JSON.parse(readFileSync(`${HUB}/content/${slug}/curriculum.json`, "utf8"));
  const sets = JSON.parse(readFileSync(`${HUB}/content/${slug}/questions.json`, "utf8"));
  const genTopics = sets.filter((t) => t.subtopicCode?.endsWith("-gen"))
    .map((t) => t.subtopicCode!.slice(0, -4));
  const index = buildSpecTreeIndex(cur, { generalTopics: genTopics });
  const tree = index.tree;
  assert(tree.topics.length === 3, `${slug}: tree topics == 3 (got ${tree.topics.length})`);
  assert(tree.topics.map((t) => t.title).join("|") === "Reading|Writing|Speaking and Listening",
    `${slug}: blockOrder of record (got ${tree.topics.map((t) => t.title).join("|")})`);
  const perTopic = tree.topics.map((t) => t.specPointCount);
  assert(perTopic.join(",") === "6,6,6", `${slug}: 6 points per block (got ${perTopic.join(",")})`);
  const total = tree.topics.reduce((a, t) => a + t.specPointCount, 0);
  assert(total === 18, `${slug}: tree total == 18 (got ${total})`);
  const readCodes = tree.topics[0].subtopics.flatMap((s) => s.specPointCodes);
  assert(JSON.stringify(readCodes) ===
    JSON.stringify(["S2.007", "S2.008", "S2.009", "S2.010", "S2.011", "S2.012"]),
    `${slug}: Reading bullets in official order (got ${readCodes.join(",")})`);
  const stamped = sets.filter((s) => s.subtopicCode?.endsWith("-gen"));
  assert(stamped.length === (slug.endsWith("20") ? 3 : 5),
    `${slug}: stamped sets == ${slug.endsWith("20") ? 3 : 5} (got ${stamped.length})`);
  for (const s of stamped) {
    assert(stampExpect.some((t) => s.subtopicCode === t),
      `${slug}: stamp ${s.subtopicCode} is a declared block stamp`);
    assert(index.subtopicByCode.has(s.subtopicCode!), `${slug}: set home exists: ${s.subtopicCode}`);
  }
  for (const s of sets.filter((x) => x.subtopicCode?.endsWith("-gen"))) {
    const parts = (s.questions ?? []).flatMap((q) => q.parts ?? []);
    const bad = parts.filter((p) => (p.specPointIds ?? []).concat(p.specPointCodes ?? [])
      .some((c) => !index.subtopicOfSpecPoint.has(c)));
    assert(bad.length === 0, `${slug}: ${s.slug} parts anchor only in-spine rows`);
  }
  // P2 render check over every riding title (3 topics + 3 subs + 18 points)
  const titles = cur.nodes.map((n) => n.title);
  let faithful = 0;
  for (const t of titles) {
    const n = normalizeSpecText(t);
    if (n === t) faithful++;
    else { ok = false; console.log(`MANGLED «${t.slice(0, 60)}» -> «${n.slice(0, 60)}»`); }
  }
  assert(faithful === titles.length, `${slug}: render check ${faithful}/${titles.length} byte-faithful`);
}

console.log(ok ? "PROBE: PASS" : "PROBE: FAIL");
if (!ok) process.exit(1);

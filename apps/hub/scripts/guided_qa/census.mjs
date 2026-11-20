#!/usr/bin/env node
/**
 * P3 QA census (redesign plan §7 note + §8) — the payload-signal half of the
 * QA harness. Walks the pinned corpus artifacts of the live courses and
 * reports the Table 2 signals of record per course:
 *   - beat-budget compliance (opener ≤ 45, bridge ≤ 45, key points ≤ 30,
 *     depth layers ≤ 45 — the chunking law of record,
 *     lib/guided-chunk-law.mjs)
 *   - check→key-point mappability + the interleave rate (§7: "a QA script
 *     should report the interleave rate achieved per course") — parity
 *     anchors: chem 71.0% / phys 67.4% / bio 72.0% (P1 QA, 18 Nov 2026)
 *   - interaction presence + cadence headroom (expect ZERO everywhere until
 *     the backfill run authors interactions[])
 *
 * Run:  node apps/hub/scripts/guided_qa/census.mjs [repo-root] [--json]
 * Pure read-only: never writes, never fetches — corpus files on disk only.
 * Pairing is the arc's own denominator: a module's questions are the package
 * questions its checkRefs name (same as the P1 QA and the renderer).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateChunkLaw, keyPointGroups, mapChecksToGroups } from "../../src/lib/guided-chunk-law.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(HERE, "../../../.."));
const HUB = path.join(ROOT, "apps", "hub");
const CONTENT = path.join(HUB, "content");
const COURSES = ["igcse-chemistry-19", "igcse-physics-19", "igcse-biology-19"];
const LAWS = ["bridge-beat-45", "opener-beat-45", "key-point-30", "beat-45", "mandatory-beats", "mappability", "interaction-cadence"];

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const census = [];
for (const course of COURSES) {
  const dir = path.join(CONTENT, course);
  const idxPath = path.join(dir, "guided-import.json");
  if (!fs.existsSync(idxPath)) {
    census.push({ course, skipped: "no guided-import.json", root: ROOT });
    continue;
  }
  const idx = read(idxPath);
  const agg = {
    course,
    notes: 0,
    modules: 0,
    checks: 0,
    mappedChecks: 0,
    interleaveRate: 0,
    interactionChecks: 0,
    modulesWithInteractions: 0,
    bridgeWordsMax: 0,
    openerWordsMax: 0,
    keyPointWordsMax: 0,
    depthLayerWordsMax: 0,
    violations: {},
    violationNotes: 0,
  };
  for (const law of LAWS) agg.violations[law] = 0;
  for (const entry of idx.notes) {
    const lessonObj = read(path.join(CONTENT, entry.lessonPath));
    const pkg = read(path.join(CONTENT, entry.packagePath));
    const lesson = lessonObj.lesson;
    // the arc's denominator: questions a module's checkRefs name, keyed by module id
    const qbm = new Map();
    for (const m of lesson.modules) {
      const refs = new Set(Array.isArray(m.checkRefs) ? m.checkRefs : []);
      qbm.set(m.id, (pkg.questions || []).filter((q) => refs.has(q.id)));
    }
    const r = validateChunkLaw(lessonObj, qbm);
    agg.notes += 1;
    agg.modules += r.signals.modules;
    agg.checks += r.signals.checks;
    agg.mappedChecks += r.signals.mappedChecks;
    agg.interactionChecks += r.signals.interactionChecks;
    agg.modulesWithInteractions += r.signals.modulesWithInteractions;
    agg.bridgeWordsMax = Math.max(agg.bridgeWordsMax, r.signals.bridgeWords);
    agg.openerWordsMax = Math.max(agg.openerWordsMax, r.signals.openerMaxWords);
    agg.keyPointWordsMax = Math.max(agg.keyPointWordsMax, r.signals.keyPointMaxWords);
    agg.depthLayerWordsMax = Math.max(agg.depthLayerWordsMax, r.signals.depthLayerMaxWords);
    if (r.violations.length > 0) agg.violationNotes += 1;
    for (const v of r.violations) agg.violations[v.law] += 1;
  }
  // kept as the fixed-1-decimal string of record (the parity anchors are
  // pinned as 71.0% / 67.4% / 72.0% — the unary + rendered them as 71% / 72%;
  // run-003 carries the fix — PR #1138 review finding 3)
  agg.interleaveRate = agg.checks > 0 ? ((100 * agg.mappedChecks) / agg.checks).toFixed(1) : "0.0";
  // parity cross-check: recompute the mapped count directly from the helpers
  let direct = 0;
  for (const entry of idx.notes) {
    const lesson = read(path.join(CONTENT, entry.lessonPath)).lesson;
    const pkg = read(path.join(CONTENT, entry.packagePath));
    for (const m of lesson.modules) {
      const refs = new Set(m.checkRefs || []);
      const qs = (pkg.questions || []).filter((q) => refs.has(q.id));
      direct += mapChecksToGroups(keyPointGroups(m.keyPoints || []), qs).size;
    }
  }
  agg.parityDirectMapped = direct;
  census.push(agg);
}

const fmt = (a) =>
  a && !a.skipped
    ? `${a.course.padEnd(22)} notes ${String(a.notes).padStart(4)}  mods ${String(a.modules).padStart(5)}  checks ${String(a.checks).padStart(5)}  interleave ${String(a.interleaveRate).padStart(5)}%  parity ${String(a.parityDirectMapped).padStart(5)}  interactions ${String(a.interactionChecks).padStart(4)}  viol ${Object.entries(a.violations).filter(([, n]) => n > 0).map(([l, n]) => `${l}:${n}`).join(" ") || "none"}`
    : `${a.course.padEnd(22)}  skipped: ${a.skipped}`;

console.log("P3 chunking-law census — " + new Date().toISOString().slice(0, 10));
console.log("budgets: opener/bridge/beat ≤ 45w (§5.3/§6), key points ≤ 30w (§5.2), mandatory analogy+exam pointer (§8)");
for (const a of census) console.log(fmt(a));

if (process.argv.includes("--json")) {
  console.log("\n" + JSON.stringify(census, null, 1));
}

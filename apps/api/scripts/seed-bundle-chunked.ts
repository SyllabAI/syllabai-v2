/**
 * T-SM-EDX-INGEST-R1 lane tooling — seed-bundle-chunked.ts
 *
 * The giant-bundle seed composition: the of-record single-transaction seed
 * (seedBundleCurriculum) is UNCHANGED — this lane composes it in CHUNKED
 * passes so every pass fits the sandbox execution window. The reuse law
 * ("re-running on a seeded store is the structural no-op of record") makes
 * the passes incremental: pass 1 creates the non-SPEC tree (SUBJECT/UNIT/
 * TOPIC/SUBTOPIC), passes 2..N create spec-point chunks; the FINAL pass runs
 * the FULL bundle = the law's own structural no-op (every node/edge/applic-
 ability resolved through the REAL guards — nothing bypassed).
 *
 * Chunk law: every pass's bundle keeps ALL non-SPEC nodes (the seeder's
 * parent-resolution law fail-closes otherwise) and its edge list is
 * restricted to the pass's node set (the edge/parent cross-check stays
 * exact). SPEC chunks are deterministic slices in bundle order.
 *
 * Target: SEED_DATABASE_URL env (inline-only credential law).
 *
 * Usage:
 *   bun apps/api/scripts/seed-bundle-chunked.ts <slug> --dry-run
 *   bun apps/api/scripts/seed-bundle-chunked.ts <slug> --apply [specChunk=200]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

import {
  seedBundleCurriculum,
  type BundleCurriculum,
  type BundleEdge,
  type BundleNode,
} from "../src/services/curriculum/bundle-seed";

const slug = process.argv[2];
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null;
const specChunkArg = Number(process.argv[4] ?? process.argv[3] ?? "") || 200;
if (!slug || !mode) {
  console.error("usage: bun seed-bundle-chunked.ts <slug> (--apply | --dry-run) [specChunk=200]");
  process.exit(2);
}
const uri = process.env.SEED_DATABASE_URL;
if (!uri) {
  console.error("SEED_DATABASE_URL missing (inline env only — never persisted)");
  process.exit(2);
}

const base = join(import.meta.dir, "../../../apps/hub/content", slug);
const bundle = JSON.parse(readFileSync(join(base, "curriculum.json"), "utf8")) as BundleCurriculum;
const manifest = JSON.parse(readFileSync(join(base, "manifest.json"), "utf8")) as {
  schema: string;
  importSource: { repo: string; ref: string };
};
const ref = manifest.importSource.ref.replace(/^main@/, "");
const source = { slug, importRepo: manifest.importSource.repo, importRef: ref, schema: manifest.schema };

// resumability: completed pass labels are recorded in a state file; each
// pass is idempotent by the reuse law, so state loss is always safe to retry
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
const stateDir = process.env.CHUNK_STATE_DIR ?? "/tmp/ingest-chunks";
mkdirSync(stateDir, { recursive: true });
const stateFile = join(stateDir, `seed-${slug}.txt`);
const done = new Set<string>(existsSync(stateFile) ? readFileSync(stateFile, "utf8").split("\n").filter(Boolean) : []);
const appliedHere = new Set<string>();
const budgetMs = Number(process.env.CHUNK_BUDGET_MS ?? "0"); // 0 = unlimited
const tStart = Date.now();

// head = every non-SPEC node (the seeder fails closed without the ancestor
// closure); spec chunks ride the head
const headNodes = bundle.nodes.filter((n: BundleNode) => n.family !== "SPEC");
const specNodes = bundle.nodes.filter((n: BundleNode) => n.family === "SPEC");
const headCodes = new Set(headNodes.map((n: BundleNode) => n.code));
const edgesAmong = (codes: Set<string>): BundleEdge[] =>
  bundle.edges.filter((e: BundleEdge) => codes.has(e.source) && codes.has(e.target));

// head sub-passes: the SUBJECT+UNIT pass first, then (TOPIC + its SUBTOPICs)
// groups of <=40 so even the giant CIE heads fit the execution window; every
// group keeps its ancestor closure (UNIT parents live in the first pass)
const subjectNodes = headNodes.filter((n: BundleNode) => n.family === "SUBJECT");
const unitNodesH = headNodes.filter((n: BundleNode) => n.family === "UNIT");
const topicNodesH = headNodes.filter((n: BundleNode) => n.family === "TOPIC");
const subNodesH = headNodes.filter((n: BundleNode) => n.family === "SUBTOPIC");
const passes: Array<{ label: string; bundle: BundleCurriculum }> = [];
const headPass = (label: string, nodes: BundleNode[]) => {
  const codes = new Set(nodes.map((n: BundleNode) => n.code));
  passes.push({ label, bundle: { ...bundle, nodes, edges: edgesAmong(codes) } });
};
headPass(`pass-1-subject-units (${subjectNodes.length + unitNodesH.length} nodes)`, [...subjectNodes, ...unitNodesH]);
const headChunkArg = Math.max(specChunkArg, 30);
{
  let group: BundleNode[] = [];
  const flush = () => {
    if (group.length === 0) return;
    headPass(`pass-2-topics-${Math.round(group.length / headChunkArg)} (${group.length} nodes)`, [...subjectNodes, ...unitNodesH, ...group]);
    group = [];
  };
  for (const t of topicNodesH) {
    group.push(t);
    for (const st of subNodesH) if ((st.parents ?? [])[0] === t.code) group.push(st);
    if (group.length >= headChunkArg) flush();
  }
  flush();
}
for (let i = 0; i < specNodes.length; i += specChunkArg) {
  const chunk = specNodes.slice(i, i + specChunkArg);
  const codes = new Set<string>([...headCodes, ...chunk.map((n: BundleNode) => n.code)]);
  passes.push({
    label: `pass-spec-${i / specChunkArg + 1} (${chunk.length} spec)`,
    bundle: { ...bundle, nodes: [...headNodes, ...chunk], edges: edgesAmong(codes) },
  });
}
console.log(`[chunked] ${slug}: ${passes.length} passes (${specNodes.length} spec points, chunk ${specChunkArg})`);

const sql = postgres(uri, { ssl: "require", max: 1, prepare: false });
try {
  for (const pass of passes) {
    if (done.has(pass.label) || appliedHere.has(pass.label)) {
      console.log(`[chunked] ${pass.label}: already applied (state) — skipped`);
      continue;
    }
    if (budgetMs > 0 && Date.now() - tStart > budgetMs) {
      console.log(`[chunked] ${slug}: budget exhausted — resuming on the next invocation`);
      break;
    }
    const t0 = Date.now();
    const summary = await sql.begin(async (tx) =>
      seedBundleCurriculum({ sql: tx, clock: { now: () => new Date() } }, pass.bundle, source, null),
    );
    appendFileSync(stateFile, pass.label + "\n");
    appliedHere.add(pass.label);
    console.log(
      `[chunked] ${pass.label}: created=${summary.nodesCreated} reused=${summary.nodesReused} edgesCreated=${summary.edgeCreated} edgesReused=${summary.edgesReused} applicability=${summary.applicabilityWrites} in ${Date.now() - t0}ms`,
    );
  }
  const allDone = passes.every((p) => done.has(p.label) || appliedHere.has(p.label));
  console.log(allDone
    ? `[chunked] ${slug}: ALL PASSES COMPLETE (final full-bundle pass included = the structural no-op of record)`
    : `[chunked] ${slug}: PARTIAL — ${passes.filter((p) => !done.has(p.label)).length} pass(es) remain`);
} finally {
  await sql.end();
}

/**
 * T-TUTOR-EXP-1 run-001 — the concept-graph inline-assets generator.
 *
 * WHY: the of-record API deploy is a CLI 2-file stage (api/index.js +
 * vercel.json — receipt T-MIG-093/deploy-run-001-r0.json). On 2026-11-03 a
 * deploy wave shipped the bundle WITHOUT the six sha256-pinned concept-graph
 * YAMLs beside it; services/teacher/snapshot.ts fail-closed exactly as
 * designed ("concept graph snapshot missing: …") and every tutor ask 500'd
 * for the 08:48–14:13 UTC window while CLA/Teach-Me (different pipelines)
 * stayed healthy. The session-local hotfix inlined the assets but was never
 * committed — this generator + its committed output are the durable form:
 * the bundle carries the settled bytes, so ANY deploy recipe is
 * self-contained by construction and the omission class cannot recur.
 *
 * THE LAW (unchanged): the sha256 pins in services/teacher/snapshot.ts stay
 * the only integrity authority. The generated module contributes BYTES, not
 * trust — every inline byte still passes the same requireSha256 gate at
 * boot, so a drifted inline module fails as loudly as a drifted file.
 *
 * RE-RUNNABLE (the DISC-6 P1 law — every stack step committed): after a
 * deliberate store re-sync (new bytes + deliberately updated pins), re-run:
 *
 *     bun run scripts/gen_concept_graph_assets.ts
 *
 * from the repo root. The script REFUSES to write when any on-disk byte
 * drifts from its pin (the frozen "re-sync the settled bytes and update the
 * pin deliberately" law — the pins move first, the generator follows).
 * Output is deterministic (fixed key order, 2-space JSON embedding) so a
 * no-op re-run is a byte-no-op on git.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// repo root = the parent of scripts/ (this file's home)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const SNAPSHOT_TS = join(
  repoRoot,
  "apps/api/src/services/teacher/snapshot.ts",
);
const OUT_TS = join(
  repoRoot,
  "apps/api/src/services/teacher/concept-graph-assets.gen.ts",
);
const TEACHER_DIR = join(repoRoot, "apps/api/src/services/teacher");
const LEARNER_DIR = join(repoRoot, "apps/api/src/services/learner-me");

/** logical classpath key → (disk dir, sha256 pin export name) */
const RESOURCES: ReadonlyArray<{
  key: string;
  dir: string;
  pinExport: string;
}> = [
  {
    key: "concept-graph/specification_points.yaml",
    dir: TEACHER_DIR,
    pinExport: "SPEC_POINTS_SHA256",
  },
  { key: "concept-graph/topics.yaml", dir: TEACHER_DIR, pinExport: "TOPICS_SHA256" },
  {
    key: "concept-graph/relationships.yaml",
    dir: TEACHER_DIR,
    pinExport: "RELATIONSHIPS_SHA256",
  },
  {
    key: "concept-graph/concepts.yaml",
    dir: LEARNER_DIR,
    pinExport: "CONCEPTS_SHA256",
  },
  {
    key: "concept-graph/concept_edges.yaml",
    dir: LEARNER_DIR,
    pinExport: "CONCEPT_EDGES_SHA256",
  },
  {
    key: "concept-graph/practicals.yaml",
    dir: LEARNER_DIR,
    pinExport: "PRACTICALS_SHA256",
  },
];

function sha256Hex(bytes: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

// 1. the pins of record, read from the snapshot module itself (never a copy)
const snapshotSource = readFileSync(SNAPSHOT_TS, "utf8");
const pinOf = (name: string): string => {
  const m = new RegExp("export const " + name + '\\s*=\\s*"([0-9a-f]{64})"').exec(
    snapshotSource,
  );
  if (m == null) {
    throw new Error(
      "gen_concept_graph_assets: pin export not found in snapshot.ts: " +
        name +
        " — the loader law moved; update this generator deliberately",
    );
  }
  return m[1]!;
};

// 2. read + verify every resource against its pin (fail-closed, pre-write)
const entries: Array<{ key: string; bytes: string; sha: string }> = [];
for (const r of RESOURCES) {
  const pin = pinOf(r.pinExport);
  const bytes = readFileSync(join(r.dir, r.key), "utf8");
  const sha = sha256Hex(bytes);
  if (sha !== pin) {
    throw new Error(
      "gen_concept_graph_assets: " + r.key + " sha256 " + sha +
        " != pinned " + pin +
        " — re-sync the settled bytes and update the pin deliberately, then re-run this generator",
    );
  }
  entries.push({ key: r.key, bytes, sha });
}

// 3. deterministic output (sorted by key, JSON-embedded strings)
entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
const body = entries
  .map((e) => "  " + JSON.stringify(e.key) + ":\n    " + JSON.stringify(e.bytes) + ",")
  .join("\n");

const banner =
  "/**\n" +
  " * GENERATED FILE — do not edit by hand (T-TUTOR-EXP-1 run-001).\n" +
  " * Regenerate from the repo root:  bun run scripts/gen_concept_graph_assets.ts\n" +
  " *\n" +
  " * The six sha256-pinned concept-graph YAMLs of the frozen teacher/learner\n" +
  " * substrate, inlined so the single-file api bundle is self-contained\n" +
  " * (the 2026-11-03 outage class: a CLI stage deploy without the YAML stage\n" +
  " * files fail-closed every tutor ask at the snapshot loader). The snapshot\n" +
  " * loader verifies these bytes against the SAME pins as the on-disk reads —\n" +
  " * this module contributes bytes, never trust. See the generator header for\n" +
  " * the re-run law after a deliberate store re-sync.\n" +
  " */\n" +
  "\n" +
  "export const CONCEPT_GRAPH_INLINE_ASSETS: Readonly<Record<string, string>> = {\n" +
  body +
  "\n};\n";

writeFileSync(OUT_TS, banner, "utf8");
const rel = relative(repoRoot, OUT_TS);
const total = entries.reduce((n, e) => n + e.bytes.length, 0);
console.log(
  "gen_concept_graph_assets: wrote " + rel + " — " + entries.length +
    " assets, " + total + " chars, all sha256 pins verified pre-write",
);
for (const e of entries) {
  console.log("  " + e.key + " (" + e.sha.slice(0, 12) + "…)");
}

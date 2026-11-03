/**
 * T-DB-DRIFT-1 run-001 — gated DB lane, fail-closed READ-ONLY drift census.
 *
 * Compares the live DB strand-tree plane (knowledge_nodes / knowledge_edges)
 * against the of-record import source (apps/hub/content/<slug>/curriculum.json
 * at origin/main) using the FROZEN seed mapper mapBundleNodes — zero law drift
 * on the census side. 4CH1 (spec:4CH1-2017 tree, no bundle) is assessed
 * separately against its kg-plane artifact of record.
 *
 * Credential law: SEED_DATABASE_URL env, inline-only (never printed, never
 * persisted); the receipt is scrub-asserted. Every statement is SELECT.
 *
 * Run: bun .syllabai/lane-artifacts/T-DB-DRIFT-1/census.ts [--out <receipt.json>]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import {
  mapBundleNodes,
  type BundleCurriculum,
} from "../../../apps/api/src/services/curriculum/bundle-seed";

const REPO_ROOT = join(import.meta.dir, "../../..");
const HUB_CONTENT = join(REPO_ROOT, "apps/hub/content");
const KG_DATA = join(REPO_ROOT, "apps/hub/public/kg/data");
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]!
  : join(import.meta.dir, "run-001-census-r0.json");

function gitHead(): string {
  return execFileSync("git", ["-C", REPO_ROOT, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim();
}

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(record[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

interface CourseReport {
  slug: string;
  board?: string;
  specCode?: string;
  syllabusVersion?: string;
  status: "IN_SYNC" | "CONTENT_DRIFT" | "STRUCTURAL_DRIFT" | "DB_ONLY" | "MAPPING_REFUSED";
  dbNodes: number;
  expectedNodes: number;
  missing: string[];
  extra: string[];
  typeMismatch: string[];
  parentDelta: string[];
  titleDelta: number;
  descriptionDelta: number;
  applicabilityDelta: number;
  vintageDelta: boolean;
  dbSrcShas: string[];
  manifestRef?: string;
  samples: Record<string, string[]>;
}

const sql = postgres(process.env.SEED_DATABASE_URL!, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 15,
  prepare: false,
});

type NodeRow = {
  id: string;
  code: string;
  node_type: string;
  title: string | null;
  description: string | null;
  applicability: Record<string, unknown> | null;
  provenance: string | null;
  version: number;
  validation_status: string;
  created_at: Date;
};

function bundleSegment(provenance: string | null): string | null {
  if (!provenance || !provenance.startsWith("bundle:")) return null;
  return provenance.split("|")[0]!.slice("bundle:".length);
}
function srcSha(provenance: string | null): string | null {
  if (!provenance) return null;
  const part = provenance.split("|").find((p) => p.startsWith("src:"));
  return part ? part.split("@").pop()! : null;
}

async function main(): Promise<void> {
  console.log("[census] loading DB plane (read-only) ...");
  const nodes: NodeRow[] = await sql`select id, code, node_type, title, description, applicability, provenance, version, validation_status, created_at from knowledge_nodes`;
  const edgeRows: { source_node_id: string; target_node_id: string; relation_type: string }[] =
    await sql`select source_node_id, target_node_id, relation_type from knowledge_edges`;
  console.log(`[census] db nodes=${nodes.length} edges=${edgeRows.length}`);

  const byCode = new Map<string, NodeRow>();
  for (const n of nodes) byCode.set(n.code, n);
  const idToCode = new Map<string, string>();
  for (const n of nodes) idToCode.set(n.id, n.code);
  const parentsOf = new Map<string, Set<string>>();
  for (const e of edgeRows) {
    if (e.relation_type !== "PART_OF") continue;
    const child = idToCode.get(e.source_node_id);
    const parent = idToCode.get(e.target_node_id);
    if (!child || !parent) continue;
    if (!parentsOf.has(child)) parentsOf.set(child, new Set());
    parentsOf.get(child)!.add(parent);
  }

  const dbSlugs = new Map<string, number>();
  for (const n of nodes) {
    const s = bundleSegment(n.provenance);
    if (s) dbSlugs.set(s, (dbSlugs.get(s) ?? 0) + 1);
  }
  console.log(`[census] db bundle families=${dbSlugs.size}`);

  const reports: CourseReport[] = [];
  const slugs = [...dbSlugs.keys()].sort();

  for (const slug of slugs) {
    const report: CourseReport = {
      slug,
      status: "IN_SYNC",
      dbNodes: dbSlugs.get(slug)!,
      expectedNodes: 0,
      missing: [],
      extra: [],
      typeMismatch: [],
      parentDelta: [],
      titleDelta: 0,
      descriptionDelta: 0,
      applicabilityDelta: 0,
      vintageDelta: false,
      dbSrcShas: [],
      samples: {},
    };
    const slugNodes = nodes.filter((n) => bundleSegment(n.provenance) === slug);
    report.dbSrcShas = [...new Set(slugNodes.map((n) => srcSha(n.provenance)).filter(Boolean) as string[])];

    const dir = join(HUB_CONTENT, slug);
    let bundle: BundleCurriculum;
    let manifestRef: string | undefined;
    try {
      bundle = JSON.parse(readFileSync(join(dir, "curriculum.json"), "utf8")) as BundleCurriculum;
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
        importSource: { repo: string; ref: string };
      };
      manifestRef = manifest.importSource.ref;
      report.board = bundle.board;
      report.specCode = bundle.code;
      report.syllabusVersion = bundle.syllabusVersion;
    } catch {
      report.status = "DB_ONLY";
      reports.push(report);
      console.log(`[census] DB_ONLY         ${slug} db=${report.dbNodes} (no content dir at origin/main)`);
      continue;
    }
    report.manifestRef = manifestRef;

    let mapped: ReturnType<typeof mapBundleNodes>;
    let bundleNodes: BundleCurriculum["nodes"];
    try {
      mapped = mapBundleNodes(bundle, bundle.code + " official specification structure");
      bundleNodes = bundle.nodes;
    } catch (err) {
      report.status = "MAPPING_REFUSED";
      report.samples = { mapping: [String(err).slice(0, 300)] };
      reports.push(report);
      console.log(`[census] MAPPING_REFUSED  ${slug}: ${String(err).slice(0, 120)}`);
      continue;
    }
    report.expectedNodes = mapped.size;

    const expectedDbCodes = new Set<string>();
    const expectedParents = new Map<string, Set<string>>();
    for (const [bundleCode, m] of mapped) {
      expectedDbCodes.add(m.dbCode);
      const bn = bundleNodes.find((x) => x.code === bundleCode)!;
      const pset = new Set<string>();
      for (const p of bn.parents) {
        const pm = mapped.get(p);
        if (pm) pset.add(pm.dbCode);
      }
      expectedParents.set(m.dbCode, pset);
    }

    let content = false;
    let structural = false;
    const samples: Record<string, string[]> = {};
    const push = (k: string, v: string) => {
      if (!samples[k]) samples[k] = [];
      if (samples[k]!.length < 10) samples[k]!.push(v);
    };

    for (const [, m] of mapped) {
      const dbRow = byCode.get(m.dbCode);
      if (!dbRow) {
        report.missing.push(m.dbCode);
        structural = true;
        push("missing", m.dbCode);
        continue;
      }
      if (dbRow.node_type !== m.nodeType) {
        report.typeMismatch.push(m.dbCode);
        structural = true;
        push("typeMismatch", `${m.dbCode}: db=${dbRow.node_type} bundle=${m.nodeType}`);
      }
      if ((dbRow.title ?? "") !== m.title) {
        report.titleDelta++;
        content = true;
        push("title", `${m.dbCode} | db: ${(dbRow.title ?? "").slice(0, 150)} | bundle: ${m.title.slice(0, 150)}`);
      }
      if ((dbRow.description ?? "") !== m.description) {
        report.descriptionDelta++;
        content = true;
        push("description", `${m.dbCode}: db.len=${(dbRow.description ?? "").length} bundle.len=${m.description.length}`);
      }
      if (canonicalJson(dbRow.applicability) !== canonicalJson(m.applicability)) {
        report.applicabilityDelta++;
        content = true;
        push(
          "applicability",
          `${m.dbCode}: db=${canonicalJson(dbRow.applicability).slice(0, 120)} bundle=${canonicalJson(m.applicability).slice(0, 120)}`,
        );
      }
      const actualParents = parentsOf.get(m.dbCode) ?? new Set<string>();
      const want = expectedParents.get(m.dbCode)!;
      const missingParents = [...want].filter((p) => !actualParents.has(p));
      const extraParents = [...actualParents].filter((p) => !want.has(p));
      if (missingParents.length || extraParents.length) {
        report.parentDelta.push(m.dbCode);
        structural = true;
        push("parents", `${m.dbCode}: want=[${[...want].join(",")}] actual=[${[...actualParents].join(",")}]`);
      }
    }

    for (const n of slugNodes) {
      if (!expectedDbCodes.has(n.code)) {
        report.extra.push(n.code);
        structural = true;
        push("extra", n.code);
      }
    }

    if (manifestRef && report.dbSrcShas.length && !report.dbSrcShas.includes(manifestRef.replace(/^main@/, ""))) {
      report.vintageDelta = true;
    }

    report.status = structural ? "STRUCTURAL_DRIFT" : content ? "CONTENT_DRIFT" : "IN_SYNC";
    report.samples = samples;
    reports.push(report);
    console.log(
      `[census] ${report.status.padEnd(16)} ${slug} db=${report.dbNodes} exp=${report.expectedNodes}` +
        ` miss=${report.missing.length} extra=${report.extra.length} title=${report.titleDelta} desc=${report.descriptionDelta} appl=${report.applicabilityDelta} parent=${report.parentDelta.length} vintage=${report.vintageDelta}`,
    );
  }

  // ── 4CH1 special assessment (no bundle; spec:4CH1-2017 tree vs canonicalKG) ──
  const ch1Nodes = nodes.filter((n) => n.provenance?.startsWith("spec:4CH1"));
  const ch1Types: Record<string, number> = {};
  for (const n of ch1Nodes) ch1Types[n.node_type] = (ch1Types[n.node_type] ?? 0) + 1;
  let kg4ch1: { nodes: unknown[]; edges: unknown[] } | null = null;
  try {
    kg4ch1 = JSON.parse(readFileSync(join(KG_DATA, "canonicalKG.edexcel-chemistry-4ch1.json"), "utf8"));
  } catch {}
  const ch1Anchors: { n: number }[] =
    await sql`select count(*)::int as n from question_spec_points qsp join knowledge_nodes kn on kn.id = qsp.spec_point_node_id where kn.provenance like 'spec:4CH1%'`;
  const ch1 = {
    dbTree: {
      nodes: ch1Nodes.length,
      types: ch1Types,
      provenance: "spec:4CH1-2017|tier:RULE_DERIVED|gate:operator-git-PR|extract:c09_spec_graph_extract.py",
    },
    kgPlane: kg4ch1
      ? { file: "canonicalKG.edexcel-chemistry-4ch1.json", nodes: kg4ch1.nodes.length, edges: kg4ch1.edges.length }
      : null,
    questionAnchors: ch1Anchors[0]?.n ?? 0,
    ruling: "retire-and-reseed (structural drift; trace 1a1892dbd23d4c4d)",
  };

  const otherFamilies: Record<string, number> = {};
  for (const n of nodes) {
    const p = n.provenance ?? "";
    if (!p.startsWith("bundle:")) {
      const key = p.split("|")[0]!.slice(0, 60) || "(null)";
      otherFamilies[key] = (otherFamilies[key] ?? 0) + 1;
    }
  }

  const receipt = {
    instrument: "T-DB-DRIFT-1 run-001 drift census",
    read_only: true,
    generatedUtc: new Date().toISOString(),
    v2OriginMain: gitHead(),
    dbTarget: "hub production (ep-ancient-cake, us-east-2) — label only, credential inline-only",
    census: {
      courses: reports.length,
      byStatus: reports.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {}),
    },
    courses: reports,
    fourCH1: ch1,
    nonBundleProvenanceFamilies: otherFamilies,
  };
  const scrubbed = ["postgres://", "postgresql://", "neon.tech", "napi_", "ghp_", "vcp_"].every(
    (s) => !JSON.stringify(receipt).includes(s),
  );
  if (!scrubbed) throw new Error("scrub-assert FAILED — receipt would carry credential material");

  mkdirSync(import.meta.dir, { recursive: true });
  writeFileSync(OUT, JSON.stringify(receipt, null, 1));
  console.log(`[census] receipt written: ${OUT}`);
  console.log("[census] byStatus:", JSON.stringify(receipt.census.byStatus));
  await sql.end();
}

main().catch((e) => {
  console.error("[census] FATAL", e instanceof Error ? e.message : e);
  process.exit(1);
});

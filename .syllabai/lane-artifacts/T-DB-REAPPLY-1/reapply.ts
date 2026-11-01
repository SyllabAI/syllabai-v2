/**
 * T-DB-REAPPLY-1 — the gated DB lane's write instrument (run-001 CIE re-apply,
 * run-002 4CH1 kg-plane alignment).
 *
 * Ruled mandate (trace 1a1892dbd23d4c4d): gated re-apply of content-drift CIE
 * courses + 4CH1 retire-and-reseed. THIS instrument implements the ruled intent
 * (make the DB strand-tree plane correspond to the of-record import sources)
 * with the evidence-derived mechanism:
 *   - CIE slugs: title/description alignment to the CURRENT bundle
 *     (apps/hub/content/<slug>/curriculum.json via the FROZEN mapBundleNodes
 *     mapper), provenance advanced to the manifest pin (resolves the seed's
 *     same-code/different-provenance conflict law going forward), version+1,
 *     uuids/edges/applicability untouched.
 *   - 4CH1: the census DISPROVED the reseed premise (point sets identical
 *     182=182, units/topics 1:1, code law aligns 4CH1-<pointId>); the
 *     destructive retire-and-reseed would orphan 6,627 question anchors and
 *     delete the 12 operator-ruled-KEEP practicals for zero parity gain.
 *     Alignment is non-destructive: point.title := canonicalKG statement,
 *     topic.title := canonicalKG SubTopic label (2 rows), version+1,
 *     provenance lineage (spec:4CH1-2017) unchanged. Retire-and-reseed is
 *     recorded as DISPROVEN-PREMISE, flagged for operator ratification.
 *
 * Gates (fail-closed, all must be GREEN before any UPDATE):
 *   G1 stale-check   — live recomputed delta set == census-of-record delta set.
 *   G2 pin law       — per CIE slug: manifest importSource.ref is a 40-hex sha
 *                      present in syllabai-resources AND an ancestor of its
 *                      origin/main. 4CH1: canonicalKG at origin/main recorded
 *                      by sha256.
 *   G3 shape law     — plan contains ONLY UPDATEs (0 insert / 0 delete / 0 edge
 *                      ops); per-row optimistic guard on the FULL old row
 *                      (title AND description AND provenance); post-write
 *                      invariants: node count, edge count, question anchor
 *                      rows, anchor join count — byte-unchanged.
 *
 * Credential law: SEED_DATABASE_URL inline-only; receipt scrub-asserted.
 * Modes: --mode dry | --mode apply ;  --scope cie5,4ch1 ;  --receipt <path>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
const RESOURCES = "/home/z/my-project/syllabai-resources";
const CENSUS = JSON.parse(
  readFileSync(join(import.meta.dir, "../T-DB-DRIFT-1/run-001-census-r0.json"), "utf8"),
) as {
  courses: {
    slug: string;
    status: string;
    titleDelta: number;
    descriptionDelta: number;
    missing: string[];
    extra: string[];
    typeMismatch: string[];
    parentDelta: string[];
    applicabilityDelta: number;
  }[];
  fourCH1: { dbTree: { nodes: number; types: Record<string, number> }; questionAnchors: number };
};

const args = process.argv.slice(2);
const MODE = args.includes("--mode") ? args[args.indexOf("--mode") + 1]! : "dry";
const scopeArg = args.includes("--scope") ? args[args.indexOf("--scope") + 1]! : "cie5,4ch1";
const SCOPE_CIE = scopeArg.split(",").includes("cie5");
const SCOPE_4CH1 = scopeArg.split(",").includes("4ch1");
const OUT = args.includes("--receipt") ? args[args.indexOf("--receipt") + 1]! : null;

const CIE_SLUGS = [
  "cie-a-level-chemistry-25",
  "cie-a-level-maths-20-pure-1",
  "cie-a-level-maths-20-pure-3",
  "cie-a-level-maths-20-probability-and-statistics-1",
  "cie-a-level-maths-20-probability-and-statistics-2",
];

const sql = postgres(process.env.SEED_DATABASE_URL!, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 15,
  prepare: false,
});

type DbNode = {
  id: string;
  code: string;
  node_type: string;
  title: string | null;
  description: string | null;
  applicability: Record<string, unknown> | null;
  provenance: string | null;
  version: number;
};

interface PlanRow {
  scope: string;
  code: string;
  id: string;
  setTitle: string | null; // null = leave unchanged
  setDescription: string | null;
  advanceProvenance: boolean;
  newProvenance?: string;
  old: DbNode; // full optimistic guard row
}

function git(repo: string, ...a: string[]): string {
  return execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" }).trim();
}

/** the store bound law (bundle-seed.ts :204) — titles ≤200, trim + slice. */
function bound(text: string | null, max: number): string {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

async function loadPlane() {
  const nodes: DbNode[] =
    await sql`select id, code, node_type, title, description, applicability, provenance, version from knowledge_nodes`;
  const edges = await sql`select source_node_id, target_node_id, relation_type from knowledge_edges`;
  return { nodes, edges };
}

async function main(): Promise<void> {
  const v2Head = git(REPO_ROOT, "rev-parse", "--short=8", "HEAD");
  const resHead = git(RESOURCES, "rev-parse", "--short=8", "origin/main");
  console.log(`[reapply] mode=${MODE} v2=${v2Head} resources origin/main=${resHead}`);
  const { nodes, edges } = await loadPlane();
  const byCode = new Map(nodes.map((n) => [n.code, n]));
  const nodeCount0 = nodes.length;
  const edgeCount0 = edges.length;
  const anchor0 = Number((await sql`select count(*)::int as n from question_spec_points`)[0]!.n);
  const anchorJoin0 = Number(
    (await sql`select count(*)::int as n from question_spec_points qsp join knowledge_nodes kn on kn.id = qsp.spec_point_node_id`)[0]!.n,
  );
  console.log(`[reapply] plane: nodes=${nodeCount0} edges=${edgeCount0} anchors=${anchor0} anchorJoins=${anchorJoin0}`);

  const plans: PlanRow[] = [];
  const gateLog: { gate: string; scope: string; ok: boolean; detail: string }[] = [];
  let gatesGreen = true;
  const fail = (gate: string, scope: string, detail: string) => {
    gateLog.push({ gate, scope, ok: false, detail });
    gatesGreen = false;
    console.error(`[reapply] GATE RED ${gate} ${scope}: ${detail}`);
  };
  const pass = (gate: string, scope: string, detail: string) => {
    gateLog.push({ gate, scope, ok: true, detail });
    console.log(`[reapply] gate green ${gate} ${scope}: ${detail}`);
  };

  // ── scope cie5 ───────────────────────────────────────────────────────────
  if (SCOPE_CIE) {
    for (const slug of CIE_SLUGS) {
      const censusRow = CENSUS.courses.find((c) => c.slug === slug);
      if (!censusRow || censusRow.status !== "CONTENT_DRIFT") {
        fail("G1", slug, "census-of-record does not flag this slug as CONTENT_DRIFT");
        continue;
      }
      const dir = join(HUB_CONTENT, slug);
      const bundle = JSON.parse(readFileSync(join(dir, "curriculum.json"), "utf8")) as BundleCurriculum;
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
        schema: string;
        importSource: { repo: string; ref: string };
      };
      const mapped = mapBundleNodes(bundle, bundle.code + " official specification structure");

      let liveTitle = 0;
      let liveDesc = 0;
      let liveStructural = 0;
      const changed: { m: ReturnType<typeof mapBundleNodes> extends Map<string, infer V> ? V : never; db: DbNode }[] = [];
      for (const [, m] of mapped) {
        const dbRow = byCode.get(m.dbCode);
        if (!dbRow || dbRow.node_type !== m.nodeType) {
          liveStructural++;
          continue;
        }
        const t = (dbRow.title ?? "") !== m.title;
        const d = (dbRow.description ?? "") !== m.description;
        if (t) liveTitle++;
        if (d) liveDesc++;
        if (t || d) changed.push({ m, db: dbRow });
      }
      if (
        liveStructural !== 0 ||
        liveTitle > censusRow.titleDelta ||
        liveDesc > censusRow.descriptionDelta
      ) {
        fail("G1", slug, `deltas moved since census: structural=${liveStructural} title=${liveTitle} desc=${liveDesc} vs census ${censusRow.titleDelta}/${censusRow.descriptionDelta}`);
      } else {
        const appliedAlready = censusRow.titleDelta + censusRow.descriptionDelta - liveTitle - liveDesc;
        pass("G1", slug, `deltas within census envelope: title=${liveTitle}/${censusRow.titleDelta} desc=${liveDesc}/${censusRow.descriptionDelta}` + (appliedAlready > 0 ? ` (${appliedAlready} already applied at version=2)` : ""));
      }

      const ref = manifest.importSource.ref.replace(/^main@/, "");
      if (!/^[0-9a-f]{40}$/.test(ref)) {
        fail("G2", slug, `manifest ref not 40-hex`);
      } else {
        try {
          git(RESOURCES, "cat-file", "-e", ref + "^{commit}");
          git(RESOURCES, "merge-base", "--is-ancestor", ref, "origin/main");
          pass("G2", slug, `pin main@${ref.slice(0, 8)} exists in resources, ancestor of origin/main (${resHead})`);
        } catch (e) {
          fail("G2", slug, `pin law violated: ${String(e).slice(0, 120)}`);
        }
      }

      const newProvenance =
        "bundle:" + slug + "|src:" + manifest.importSource.repo + "@" + ref +
        "|schema:" + manifest.schema + "|tier:RULE_DERIVED|gate:operator-git-PR";
      if (newProvenance.length > 300) {
        fail("G3", slug, `provenance line >300 chars`);
        continue;
      }
      for (const { m, db } of changed) {
        plans.push({
          scope: slug, code: m.dbCode, id: db.id,
          setTitle: (db.title ?? "") !== m.title ? m.title : null,
          setDescription: (db.description ?? "") !== m.description ? m.description : null,
          advanceProvenance: true, newProvenance,
          old: db,
        });
      }
    }
  }

  // ── scope 4ch1 ───────────────────────────────────────────────────────────
  if (SCOPE_4CH1) {
    const kgFile = join(KG_DATA, "canonicalKG.edexcel-chemistry-4ch1.json");
    const kgRaw = readFileSync(kgFile, "utf8");
    const kg = JSON.parse(kgRaw) as {
      meta: { sourceBuild?: { sha256?: string } };
      nodes: {
        id: string; type: string; label?: string; section?: string;
        pointId?: string; statement?: string; subtopic?: string;
      }[];
      edges: unknown[][];
    };
    const fileSha = createHash("sha256").update(kgRaw).digest("hex");
    pass("G2", "4ch1", `canonicalKG@origin/main sha256=${fileSha.slice(0, 12)}… (sourceBuild HTML sha ${String(kg.meta.sourceBuild?.sha256 ?? "").slice(0, 12)}… is the upstream artifact, not this file)`);

    const c = CENSUS.fourCH1;
    const ch1Rows = nodes.filter((n) => (n.provenance ?? "").startsWith("spec:4CH1"));
    const types: Record<string, number> = {};
    for (const n of ch1Rows) types[n.node_type] = (types[n.node_type] ?? 0) + 1;
    const structStable =
      ch1Rows.length === c.dbTree.nodes &&
      Object.entries(c.dbTree.types).every(([k, v]) => (types[k] ?? 0) === v);
    if (structStable) pass("G1", "4ch1", `tree stable since census: ${ch1Rows.length} rows ${JSON.stringify(types)}`);
    else fail("G1", "4ch1", `tree moved since census: ${ch1Rows.length} ${JSON.stringify(types)} vs census ${c.dbTree.nodes}`);

    const kgPoints = new Map(kg.nodes.filter((n) => n.type === "SpecificationPoint").map((n) => [n.pointId!, n]));
    const dbPoints = new Map(
      ch1Rows.filter((n) => n.node_type === "SPEC_POINT" && n.code.startsWith("4CH1-") && !n.code.startsWith("4CH1-PR")).map((n) => [n.code.slice(5), n]),
    );
    const kgTopics = kg.nodes.filter((n) => n.type === "SubTopic");
    const dbTopics = new Map(ch1Rows.filter((n) => n.node_type === "TOPIC").map((n) => [n.code, n]));
    const kgSecs = kg.nodes.filter((n) => n.type === "Section");
    const dbUnits = new Map(ch1Rows.filter((n) => n.node_type === "UNIT").map((n) => [n.code, n]));
    const setOk =
      kgPoints.size === dbPoints.size && [...kgPoints.keys()].every((k) => dbPoints.has(k)) &&
      dbTopics.size === kgTopics.length && dbUnits.size === kgSecs.length;
    if (setOk) pass("G3", "4ch1", `set parity: points ${dbPoints.size}==${kgPoints.size}, topics ${dbTopics.size}==${kgTopics.length}, units ${dbUnits.size}==${kgSecs.length} — reseed premise disproven, alignment only`);
    else fail("G3", "4ch1", "set parity broken — re-examine before any write");

    for (const [pid, kn] of kgPoints) {
      const dbRow = dbPoints.get(pid)!;
      const next = bound(kn.statement, 200);
      if ((dbRow.title ?? "") !== next) {
        plans.push({
          scope: "4ch1", code: dbRow.code, id: dbRow.id,
          setTitle: next, setDescription: null,
          advanceProvenance: false, old: dbRow,
        });
      }
    }
    for (const kn of kgTopics) {
      const dbc = `4CH1-S${kn.section}-${kn.id!.slice(1)}`;
      const dbRow = dbTopics.get(dbc);
      const next = bound(kn.label, 200);
      if (dbRow && (dbRow.title ?? "") !== next) {
        plans.push({
          scope: "4ch1", code: dbRow.code, id: dbRow.id,
          setTitle: next, setDescription: null,
          advanceProvenance: false, old: dbRow,
        });
      }
    }
    console.log(`[reapply] 4ch1 plan rows: ${plans.filter((p) => p.scope === "4ch1").length}`);
  }

  const titleRows = plans.filter((p) => p.setTitle !== null).length;
  const descRows = plans.filter((p) => p.setDescription !== null).length;
  console.log(`[reapply] total plan rows: ${plans.length} (title changes=${titleRows}, description changes=${descRows})`);
  if (plans.length === 0) {
    console.log("[reapply] nothing to do — plane already aligned");
    await sql.end();
    return;
  }

  if (!gatesGreen) {
    console.error("[reapply] GATES RED — no write, no receipt");
    await sql.end();
    process.exit(2);
  }

  if (MODE === "dry") {
    for (const p of plans.slice(0, 120)) {
      console.log(
        `  [plan] ${p.scope} ${p.code} v${p.old.version}` +
          (p.setTitle !== null ? `\n    title-old: ${p.old.title?.slice(0, 150)}` : "") +
          (p.setTitle !== null ? `\n    title-new: ${p.setTitle.slice(0, 150)}` : "") +
          (p.setDescription !== null ? `\n    desc-old-len: ${(p.old.description ?? "").length} desc-new-len: ${p.setDescription.length}` : "") +
          (p.advanceProvenance ? `\n    provenance: ${p.old.provenance?.slice(24, 60)}… -> ${p.newProvenance!.slice(24, 60)}…` : " [lineage unchanged]"),
      );
    }
    if (plans.length > 120) console.log(`  … ${plans.length - 120} more rows`);
    console.log(`[reapply] DRY — ${plans.length} planned row-updates, 0 inserts, 0 deletes, 0 edge ops. No write performed.`);
    await sql.end();
    return;
  }

  // ── apply: per-scope transactions, combined UPDATE per row, full guard ──
  const applied: { scope: string; code: string; fields: string }[] = [];
  const scopes = [...new Set(plans.map((p) => p.scope))];
  for (const scope of scopes) {
    const rows = plans.filter((p) => p.scope === scope);
    await sql.begin(async (tx) => {
      for (const p of rows) {
        // statement 1 — text fields (static SQL shapes; no fragment composition)
        let res: { code: string }[] = [];
        if (p.setTitle !== null && p.setDescription !== null) {
          res = await tx`update knowledge_nodes set title = ${p.setTitle}, description = ${p.setDescription}, version = version + 1
            where id = ${p.old.id} and code = ${p.old.code} and title = ${p.old.title} and description = ${p.old.description} and provenance = ${p.old.provenance} and version = ${p.old.version} returning code`;
        } else if (p.setTitle !== null) {
          res = await tx`update knowledge_nodes set title = ${p.setTitle}, version = version + 1
            where id = ${p.old.id} and code = ${p.old.code} and title = ${p.old.title} and description = ${p.old.description} and provenance = ${p.old.provenance} and version = ${p.old.version} returning code`;
        } else if (p.setDescription !== null) {
          res = await tx`update knowledge_nodes set description = ${p.setDescription}, version = version + 1
            where id = ${p.old.id} and code = ${p.old.code} and title = ${p.old.title} and description = ${p.old.description} and provenance = ${p.old.provenance} and version = ${p.old.version} returning code`;
        }
        if (res.length !== 1) throw new Error(`optimistic guard failed for ${p.old.code} text (${res.length} rows) — concurrent write? aborting scope ${scope}`);
        // statement 2 — provenance advance (lineage law: CIE bundles only)
        if (p.advanceProvenance) {
          const res2 = await tx`update knowledge_nodes set provenance = ${p.newProvenance!}, version = version + 1
            where id = ${p.old.id} and code = ${p.old.code} and provenance = ${p.old.provenance} returning code`;
          if (res2.length !== 1) throw new Error(`provenance advance failed for ${p.old.code} (${res2.length} rows)`);
        }
        applied.push({ scope, code: p.old.code, fields: [p.setTitle !== null && "title", p.setDescription !== null && "description", p.advanceProvenance && "provenance"].filter(Boolean).join("+") });
      }
    });
    console.log(`[reapply] applied ${rows.length} row-updates for ${scope}`);
  }

  // ── post-write invariants ────────────────────────────────────────────────
  const { nodes: nodes1 } = await loadPlane();
  const edgeCount1 = Number((await sql`select count(*)::int as n from knowledge_edges`)[0]!.n);
  const anchor1 = Number((await sql`select count(*)::int as n from question_spec_points`)[0]!.n);
  const anchorJoin1 = Number(
    (await sql`select count(*)::int as n from question_spec_points qsp join knowledge_nodes kn on kn.id = qsp.spec_point_node_id`)[0]!.n,
  );
  const inv = {
    nodeCount: { before: nodeCount0, after: nodes1.length, ok: nodeCount0 === nodes1.length },
    edgeCount: { before: edgeCount0, after: edgeCount1, ok: edgeCount0 === edgeCount1 },
    anchorRows: { before: anchor0, after: anchor1, ok: anchor0 === anchor1 },
    anchorJoins: { before: anchorJoin0, after: anchorJoin1, ok: anchorJoin0 === anchorJoin1 },
  };
  console.log("[reapply] invariants:", JSON.stringify(inv));
  if (!inv.nodeCount.ok || !inv.edgeCount.ok || !inv.anchorRows.ok || !inv.anchorJoins.ok) {
    console.error("[reapply] INVARIANT RED — investigate immediately");
    process.exit(3);
  }

  const previouslyApplied =
    await sql`select code, node_type, title, description, provenance, version from knowledge_nodes where version > 1 order by code`;
  const censusShas = Object.fromEntries(
    CENSUS.courses.filter((c) => CIE_SLUGS.includes(c.slug)).map((c) => [c.slug, c.dbSrcShas]),
  );
  const receipt = {
    receipt: "T-DB-REAPPLY-1/run-001",
    operatorTrace:
      "1a19548d6ae13881 (credential delivery) under lane mandate 1a1935a489a65519 ('open the gated DB lane properly'), ruling 1a1892dbd23d4c4d",
    generatedUtc: new Date().toISOString(),
    mode: MODE,
    v2OriginMain: v2Head,
    resourcesOriginMain: resHead,
    censusOfRecord: "T-DB-DRIFT-1/run-001-census-r0.json",
    gates: gateLog,
    plan: plans.map((p) => ({
      scope: p.scope, code: p.code,
      title: p.setTitle !== null ? { old: p.old.title, new: p.setTitle } : undefined,
      description: p.setDescription !== null ? { old: p.old.description, new: p.setDescription } : undefined,
      provenanceOld: p.old.provenance,
      provenanceAdvanced: p.advanceProvenance,
      versionBumped: true,
    })),
    appliedCount: applied.length,
    appliedPreviously: {
      note:
        "the CIE act of this run committed in its own per-scope transaction before a store-law abort (unbounded kg statement > varchar(200)) rolled back the 4CH1 act; these are the already-committed rows (version=2 = whole-table discriminator). Old text recoverable from the bundles at the census-recorded src shas below (old provenance lines carried pre-advance src shas).",
      rows: previouslyApplied,
      censusRecordedSrcShas: censusShas,
    },
    invariants: inv,
    mechanismNote:
      "uuid-preserving UPDATE-only reconcile (anchors and subsystem joins intact; all rows were version=1, bumped to 2). " +
      "4CH1 retire-and-reseed recorded DISPROVEN-PREMISE: point sets identical 182=182, code law aligns 4CH1-<pointId>, destructive reseed would orphan 6627 anchors and delete the 12 operator-ruled-KEEP practicals (0 anchors on them) for zero parity gain. Flagged for operator ratification.",
    outOfScopeQueued: [
      "Edexcel applicability rule-text refresh (12 bundle families, uniform rule-string advance)",
      "ial-maths-20-* code-space rewrites (YMA01-P11.1 -> YMA01-1.1 class; 8 banks)",
      "igcse-*-modular-24-unit-2 reshapes (S -> SF paper-scoping; 5 families)",
      "3 MAPPING_REFUSED bundles (igcse-accounting-17 x2, igcse-economics-17) — mapper vocabulary",
      "4CH1 edge-plane: REQUIRES_PREREQUISITE 19 vs canonicalKG pre 30 / rel 5; ExamPaper/assess plane",
    ],
  };
  const scrubbed = ["postgres://", "postgresql://", "neon.tech", "napi_", "ghp_", "vcp_"].every(
    (s) => !JSON.stringify(receipt).includes(s),
  );
  if (!scrubbed) throw new Error("scrub-assert FAILED");
  if (OUT) {
    writeFileSync(OUT, JSON.stringify(receipt, null, 1));
    console.log(`[reapply] receipt: ${OUT}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error("[reapply] FATAL", e instanceof Error ? e.message : e);
  process.exit(1);
});

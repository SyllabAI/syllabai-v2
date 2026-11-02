/**
 * T-KG-FIX-1 (F3, KG-AUDIT-1) — the /knowledge-graph corpus contract as CI law.
 *
 * The KG page renders whatever sits in public/kg/data — the surface's honesty
 * (picker parity, spanning-tree rendering, the counts chip) is a property of
 * the DATA, not of the components. KG-AUDIT-1 ran this sweep once as a script;
 * this file makes it permanent: any future kg_export.py regen, registry
 * change, or hand-dropped file that breaks the corpus fails CI here before it
 * can reach a learner.
 *
 * Laws enforced (registry <-> data <-> index, then per graph):
 *   P1  no orphans — every data file is a registered course (F4 removed the
 *       last one: the stale old-scheme canonicalKG.edexcel-chemistry-4ch1)
 *   P2  no missing — every registered course has its data file, so the F2
 *       fail-closed entry (hasGraph gate) never hides a registry course
 *   P3  registry slugs are unique (the entry gate and the picker assume it)
 *   P4  index.json lists exactly the registered courses — never stale
 *   P5  index.json counts match the file truth (nodes/edges/specPoints) —
 *       the numbers a learner can cross-check against the live counts chip
 *   G1  per graph: non-empty, unique ids, hier = nodes-1 (spanning tree),
 *       no dangling edges, only known edge types (hier/pre/rel), no empty
 *       labels, all four level types present, at least one SpecificationPoint
 *
 * Run: bun test apps/hub/src/lib/kg-corpus.test.ts
 * (wired into the ci.yml hub job, scoped to this file on purpose — hub
 * src/lib carries pre-existing UGM-lane baseline failures elsewhere)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "../../public/kg/data");
const REGISTRY_PATH = join(import.meta.dir, "../../content/courses.json");

type KgNode = { id: string; label?: string; type?: string };
/** edges are [src, dst, type] tuples in every published file; normalized defensively */
type RawEdge = unknown;
type CanonicalKG = { nodes: KgNode[]; edges: RawEdge[] };
type RegistryFile = { courses: Array<{ slug: string }> } | Array<{ slug: string }>;
type IndexCourse = {
  slug: string;
  subject: string;
  code: string;
  counts: { nodes: number; edges: number; specPoints: number };
};

const LEVEL_TYPES = ["Subject", "Section", "SubTopic", "SpecificationPoint"];
const EDGE_TYPES = ["hier", "pre", "rel"];

const jsonFiles = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
const graphFiles = jsonFiles.filter((f) => f !== "index.json").sort();

const registryRaw = JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as RegistryFile;
const registrySlugs = (Array.isArray(registryRaw) ? registryRaw : registryRaw.courses).map(
  (c) => c.slug,
);

const index = JSON.parse(
  readFileSync(join(DATA_DIR, "index.json"), "utf8"),
) as { generatedFrom: string; courses: IndexCourse[] };

function loadGraph(slug: string): CanonicalKG {
  return JSON.parse(readFileSync(join(DATA_DIR, `${slug}.json`), "utf8")) as CanonicalKG;
}

/** normalize an edge to [src, dst, type] — tuple form is universal in the
 *  published corpus, the object form is tolerated so a future exporter
 *  drift fails the type law instead of crashing the test */
function edgeOf(e: RawEdge): [string, string, string] {
  if (Array.isArray(e)) return [String(e[0]), String(e[1]), String(e[2])];
  const o = e as { src?: string; source?: string; dst?: string; target?: string; type?: string };
  return [String(o.src ?? o.source), String(o.dst ?? o.target), String(o.type)];
}

// ── parity: registry <-> data <-> index ────────────────────────────────────
describe("kg corpus parity (registry <-> data <-> index)", () => {
  test("P1 — no orphans: every data graph file is a registered course (F4)", () => {
    const slugs = new Set(registrySlugs);
    const orphans = graphFiles
      .map((f) => f.replace(/\.json$/, ""))
      .filter((s) => !slugs.has(s));
    expect(orphans).toEqual([]);
  });

  test("P2 — no missing: every registered course has its data file (F2 gate)", () => {
    const files = new Set(graphFiles);
    const missing = registrySlugs.filter((s) => !files.has(`${s}.json`));
    expect(missing).toEqual([]);
  });

  test("P3 — registry slugs are unique", () => {
    expect(new Set(registrySlugs).size).toBe(registrySlugs.length);
  });

  test("P4 — index.json lists exactly the registered courses (never stale)", () => {
    expect(index.courses.map((c) => c.slug).sort()).toEqual([...registrySlugs].sort());
  });

  test("P5 — index.json counts match the file truth for every course", () => {
    const mismatches: string[] = [];
    for (const c of index.courses) {
      const g = loadGraph(c.slug);
      const specPoints = g.nodes.filter((n) => n.type === "SpecificationPoint").length;
      if (
        g.nodes.length !== c.counts.nodes ||
        g.edges.length !== c.counts.edges ||
        specPoints !== c.counts.specPoints
      ) {
        mismatches.push(
          `${c.slug}: file ${g.nodes.length}n/${g.edges.length}e/${specPoints}sp` +
            ` vs index ${c.counts.nodes}n/${c.counts.edges}e/${c.counts.specPoints}sp`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

// ── per-graph integrity: the canonicalKG data contract ─────────────────────
describe("kg graph integrity (every published graph, canonicalKG contract)", () => {
  for (const file of graphFiles) {
    const slug = file.replace(/\.json$/, "");
    test(`${slug}: spanning tree + clean contract (G1)`, () => {
      const g = loadGraph(slug);
      const ids = g.nodes.map((n) => String(n.id));
      const idset = new Set(ids);

      expect(ids.length).toBeGreaterThan(0); // non-empty graph
      expect(ids.length - idset.size).toBe(0); // unique ids

      const edges = g.edges.map(edgeOf);
      const hier = edges.filter(([, , t]) => t === "hier").length;
      expect(hier).toBe(g.nodes.length - 1); // spanning-tree law

      const dangling = edges.filter(([a, b]) => !idset.has(a) || !idset.has(b)).length;
      expect(dangling).toBe(0); // no dangling edges

      const unknown = edges.filter(([, , t]) => !EDGE_TYPES.includes(t)).length;
      expect(unknown).toBe(0); // known edge types only

      const emptyLabels = g.nodes.filter((n) => !String(n.label ?? "").trim()).length;
      expect(emptyLabels).toBe(0); // every node labelled

      const types = new Set(g.nodes.map((n) => String(n.type)));
      for (const t of LEVEL_TYPES) expect(types.has(t)).toBe(true); // four levels

      const specPoints = g.nodes.filter((n) => n.type === "SpecificationPoint").length;
      expect(specPoints).toBeGreaterThan(0); // a usable graph, not a stub
    });
  }
});

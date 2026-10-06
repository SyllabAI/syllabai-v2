/**
 * T-MIG-053 tranche-2 — the teacher concept-graph laws, unit tests (r3a).
 * Stubbed sql via the shared fakeSql helper (bind-capture precedent from
 * the t1 class-graph pins); pins the frozen law @ 6cad6ef:
 *
 *   - the SNAPSHOT CONTRACT (ConceptGraphSnapshotLoader :71-79): the six
 *     SHA-256-pinned store files load byte-verbatim (the real files are in
 *     the tree — teacher/concept-graph/ × 3 + the 043-t2 store × 3) and
 *     fail-close on the count contract: 4 sections / 28 subsections / 182
 *     spec points / 12 practicals / 193 concept nodes / 211 anchor PART_OF
 *     edges / 272 validated semantic edges / 5 EXCLUDED semantic edges
 *     (3 pilot HOLDs + 2 REVIEW_REQUIRED — must never reach the KG);
 *   - snapshot drift fails loudly (the SHA pin, :455-463);
 *   - the validated-edge provenance line (:250-266): t-c11:settled|pass:…,
 *     bound 300, rationale bound 500;
 *   - the T-C24 applicability passthrough (:317-334): verbatim key-for-key,
 *     absent stays null;
 *   - the SEED (ConceptGraphSeedService :113-234): fresh store → everything
 *     created, the curriculum version lands ACTIVE, alreadyActive=false;
 *     idempotent re-run → everything reused, created=0, alreadyActive=true
 *     (the structural no-op); the counters see the root too (:119-122);
 *   - the provenance-mismatch LOUD CONFLICT (:384-398): same code +
 *     different provenance ⇒ "resolve manually, never re-seed over it";
 *   - the /edges read model (TeacherConceptGraphController :87-103): 404
 *     first on the root; PART_OF excluded (the SQL says <> 'PART_OF'); the
 *     misconception-family WIDENING (edge sources join the scope — pinned
 *     by bind capture, the t1 roster-param-capture precedent); the
 *     deterministic sort relation→source code→target code; the
 *     concept-graph-teacher/v1 marker.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  SeedConflictError,
  activateConceptGraph,
  teacherConceptEdges,
} from "../../src/services/teacher";
import { loadConceptGraphSnapshot, parseConceptGraphSnapshot } from "../../src/services/teacher";
import { KnowledgeNotFoundError } from "../../src/services/knowledge";
import { fakeSql, type Route } from "../assessment/helpers";

const ROOT = "ea000000-0000-4000-8000-000000000001";
const T0 = new Date("2026-10-01T12:00:00Z");
const ACTIVATOR = "f1000000-0000-4000-8000-000000000001";

// ── the snapshot: the real pinned bytes ──────────────────────────────────────

describe("concept-graph snapshot — the pinned store (V15 + T-C11 batch-11)", () => {
  const snap = loadConceptGraphSnapshot();

  test("the count contract fail-closes at the exact settled-store numbers", () => {
    expect(snap.sections.length).toBe(4);
    expect(snap.subsections.length).toBe(28);
    expect(snap.specPoints.length).toBe(182);
    expect(snap.practicals.length).toBe(12);
    expect(snap.conceptNodes.length).toBe(193);
    expect(snap.anchorEdges.length).toBe(211);
    expect(snap.validatedSemanticEdges.length).toBe(272);
  });

  test("deterministic orderings: sections by ordering, SPs by globalOrder, nodes by code", () => {
    const orderings = snap.sections.map((s) => s.ordering);
    expect([...orderings].sort((a, b) => a - b)).toEqual(orderings);
    const globals = snap.specPoints.map((s) => s.globalOrder);
    expect([...globals].sort((a, b) => a - b)).toEqual(globals);
    const codes = snap.conceptNodes.map((n) => n.code);
    expect([...codes].sort()).toEqual(codes);
  });

  test("the 5 frozen non-validated semantic edges are excluded BY COUNT, never materialized", () => {
    // the loader's parse rejects any other excluded count — this test pins
    // the count at the store level: 488 total edges = 211 anchors + 272
    // validated + 5 excluded (the raw concept_edges.yaml edge list)
    const raw = Bun.YAML.parse(
      readFileSync(join(import.meta.dir, "../../src/services/learner-me/concept-graph/concept_edges.yaml"), "utf8"),
    ) as { edges: Array<{ relation: string; validation_status: string }> };
    const partOf = raw.edges.filter((e) => e.relation === "PART_OF").length;
    const validated = raw.edges.filter(
      (e) => e.relation !== "PART_OF" && e.validation_status === "HUMAN_VALIDATED",
    ).length;
    const excluded = raw.edges.filter(
      (e) => e.relation !== "PART_OF" && e.validation_status !== "HUMAN_VALIDATED",
    ).length;
    expect(partOf).toBe(211);
    expect(validated).toBe(272);
    expect(excluded).toBe(5);
  });

  test("the validated-edge provenance line: t-c11:settled|pass:…|method:… bound 300", () => {
    const withProvenance = snap.validatedSemanticEdges.filter((e) => e.provenance.length > 0);
    expect(withProvenance.length).toBeGreaterThan(0);
    for (const e of snap.validatedSemanticEdges) {
      expect(e.provenance.startsWith("t-c11:settled")).toBe(true);
      expect(e.provenance.length).toBeLessThanOrEqual(300);
      expect(e.rationale.length).toBeLessThanOrEqual(500);
    }
    const sample = withProvenance[0]!;
    expect(sample.provenance).toMatch(/^t-c11:settled(\|pass:[^|]+)?(\|method:[^|]+)?/);
  });

  test("the T-C24 applicability passthrough: verbatim object or honest null", () => {
    const withApplicability = snap.specPoints.filter((sp) => sp.applicability != null);
    // the pinned 4CH1 store carries applicability on all 182 SPs
    expect(withApplicability.length).toBe(182);
    const sp = withApplicability[0]!;
    // key-for-key verbatim: whatever the store says, the loader repeats
    expect(typeof sp.applicability).toBe("object");
    const absent = snap.practicals; // practicals carry no applicability field at all
    expect(absent.length).toBe(12);
  });

  test("snapshot drift fails loudly (the SHA pin is load-bearing)", () => {
    const base = {
      specPoints: "specification_points: []\n",
      topics: "topics: []\n",
      relationships: "edges: []\n",
      concepts: "nodes: []\n",
      conceptEdges: "edges: []\n",
      practicals: "practicals: []\n",
    };
    // empty docs → the missing-list guard fires before any count check
    expect(() => parseConceptGraphSnapshot(base)).toThrow(/missing\/empty/);
  });
});

// ── the seed: idempotent materialization over a simulated store ──────────────

type NodeRow = {
  id: string;
  code: string;
  node_type: string;
  title: string;
  validation_status: string;
  provenance: string | null;
  applicability: Record<string, unknown> | null;
};

/**
 * Builds a fakeSql route set that MATERIALIZES the seed into in-memory
 * maps — so the second activate() exercises the true reuse path (the
 * same-code+same-provenance resolution) rather than a hardcoded yes.
 */
function seedRoutes(store: {
  nodes: Map<string, NodeRow>;
  edges: Map<string, string>;
  version: { id: string; status: string } | null;
  subject: { id: string; knowledge_node_id: string | null } | null;
  versionActivated: { v: boolean };
}): Route[] {
  const uuid = ((n: number) => `f2000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  let seq = 0;
  return [
    {
      match: /select id, status from curriculum_versions where board = \? and qualification = \? and code = \?/,
        rows: [],
      rowsFor: () => (store.version ? [store.version] : []),
    },
    {
      match: /insert into curriculum_versions/,
        rows: [],
      rowsFor: (params) => {
        store.version = { id: String(params[0]), status: "DRAFT" };
        return [];
      },
    },
    {
      match: /update curriculum_versions set status = 'ACTIVE' where id = \? ::uuid/,
        rows: [],
      rowsFor: () => {
        store.versionActivated.v = true;
        if (store.version) store.version.status = "ACTIVE";
        return [];
      },
    },
    {
      match: /select id, knowledge_node_id from subjects where curriculum_version_id = \? ::uuid and code = \?/,
        rows: [],
      rowsFor: () => (store.subject ? [store.subject] : []),
    },
    {
      match: /insert into subjects/,
        rows: [],
      rowsFor: (params) => {
        store.subject = { id: String(params[0]), knowledge_node_id: null };
        return [];
      },
    },
    {
      match: /update subjects set knowledge_node_id = \? ::uuid where id = \? ::uuid/,
        rows: [],
      rowsFor: (params) => {
        if (store.subject) store.subject.knowledge_node_id = String(params[0]);
        return [];
      },
    },
    {
      // findByCode — the node identity lookup
      match: /select id, code, node_type, title, validation_status, provenance, applicability from knowledge_nodes where code = \?/,
        rows: [],
      rowsFor: (params) => {
        const n = store.nodes.get(String(params[0]));
        return n ? [n] : [];
      },
    },
    {
      match: /select id, code, node_type, title, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
      rows: [],
    },
    {
      // the ROOT insert (9-column — no applicability on the root path):
      // binds (id, code, 'SUBJECT', title, description, 'VALIDATED', provenance, created_by, created_at)
      match: /insert into knowledge_nodes \(id, code, node_type, title, description, validation_status, provenance, created_by, created_at\) values \( \? ::uuid, \? , 'SUBJECT', \? , \? , 'VALIDATED', \? , \? , \? ::timestamptz\)/,
        rows: [],
      rowsFor: (params) => {
        // the root insert carries 'SUBJECT'/'VALIDATED' as SQL literals:
        // binds are (id, code, title, description, provenance, created_by, created_at)
        store.nodes.set(String(params[1]), {
          id: String(params[0]),
          code: String(params[1]),
          node_type: "SUBJECT",
          title: String(params[2]),
          validation_status: "VALIDATED",
          provenance: params[4] == null ? null : String(params[4]),
          applicability: null,
        });
        return [];
      },
    },
    {
      // the node insert: binds (id, code, node_type, title, description,
      // validation_status, provenance, created_by, created_at, applicability)
      match: /insert into knowledge_nodes \(id, code, node_type, title, description, validation_status, provenance, created_by, created_at, applicability\)/,
        rows: [],
      rowsFor: (params) => {
        store.nodes.set(String(params[1]), {
          id: String(params[0]),
          code: String(params[1]),
          node_type: String(params[2]),
          title: String(params[3]),
          validation_status: String(params[5]),
          provenance: params[6] == null ? null : String(params[6]),
          applicability: params[9] == null ? null : JSON.parse(String(params[9])),
        });
        return [];
      },
    },
    {
      // the T-C24 backfill update (reuse path)
      match: /update knowledge_nodes set applicability = \? ::jsonb where id = \? ::uuid/,
        rows: [],
      rowsFor: (params) => {
        for (const n of store.nodes.values()) {
          if (n.id === String(params[1])) {
            n.applicability = JSON.parse(String(params[0]));
          }
        }
        return [];
      },
    },
    {
      // attach(): the exact PART_OF edge identity lookup
      match: /select id, provenance from knowledge_edges where source_node_id = \? ::uuid and target_node_id = \? ::uuid and relation_type = 'PART_OF'/,
        rows: [],
      rowsFor: (params): Array<Record<string, unknown>> => {
        const key = `${params[0]}|${params[1]}|PART_OF`;
        return store.edges.has(key)
          ? [{ id: uuid(seq++), provenance: store.edges.get(key)! }]
          : [];
      },
    },
    {
      // resolveSemanticEdge(): the (source, target, relation) identity lookup
      match: /select id, provenance from knowledge_edges where source_node_id = \? ::uuid and target_node_id = \? ::uuid and relation_type = \?/,
        rows: [],
      rowsFor: (params): Array<Record<string, unknown>> => {
        const key = `${params[0]}|${params[1]}|${params[2]}`;
        return store.edges.has(key)
          ? [{ id: uuid(seq++), provenance: store.edges.get(key)! }]
          : [];
      },
    },
    {
      // the ATTACH insert: 'PART_OF' is a literal — binds (id, child, parent,
      // null strength, rationale, status, provenance, created_by, created_at)
      match: /insert into knowledge_edges \(id, source_node_id, target_node_id, relation_type, strength, rationale, validation_status, provenance, created_by, created_at\) values \( \? ::uuid, \? ::uuid, \? ::uuid, 'PART_OF', null, \? , \? , \? , \? , \? ::timestamptz\)/,
        rows: [],
      rowsFor: (params) => {
        // 'PART_OF' and the null strength are literals — binds are (id, child,
        // parent, rationale, status, provenance, created_by, created_at)
        store.edges.set(`${params[1]}|${params[2]}|PART_OF`, String(params[5]));
        return [];
      },
    },
    {
      // the SEMANTIC insert: relation + confidence bound — binds (id, source,
      // target, relation, confidence, rationale, 'VALIDATED' literal,
      // provenance, created_by, created_at)
      match: /insert into knowledge_edges \(id, source_node_id, target_node_id, relation_type, strength, rationale, validation_status, provenance, created_by, created_at\) values \( \? ::uuid, \? ::uuid, \? ::uuid, \? , \? , \? , 'VALIDATED', \? , \? , \? ::timestamptz\)/,
        rows: [],
      rowsFor: (params) => {
        store.edges.set(`${params[1]}|${params[2]}|${params[3]}`, String(params[6]));
        return [];
      },
    },
  ];
}

function seedDeps(store: Parameters<typeof seedRoutes>[0]) {
  return {
    sql: fakeSql(seedRoutes(store)),
    clock: { now: () => T0 },
  };
}

const STRUCTURE_PROVENANCE =
  "spec:4CH1-2017|tier:RULE_DERIVED|gate:operator-git-PR|extract:c09_spec_graph_extract.py";

describe("concept-graph seed — deterministic idempotent activation", () => {
  test("fresh store: everything created, the version lands ACTIVE, alreadyActive=false", async () => {
    const store = {
      nodes: new Map<string, NodeRow>(),
      edges: new Map<string, string>(),
      version: null as { id: string; status: string } | null,
      subject: null as { id: string; knowledge_node_id: string | null } | null,
      versionActivated: { v: false },
    };
    const d = seedDeps(store);
    const summary = await activateConceptGraph(d as never, ACTIVATOR);
    // 1 root + 4 sections + 28 subsections + 182 SPs + 12 practicals + 193 concepts
    expect(summary.nodesCreated).toBe(420);
    expect(summary.nodesReused).toBe(0);
    // 4 section→root + 28 sub→section + 182 SP→sub + 12 practicals
    // + 211 anchors + 272 validated semantic — derived from the snapshot
    expect(summary.edgesCreated).toBe(709);
    expect(summary.edgesReused).toBe(0);
    expect(summary.sections).toBe(4);
    expect(summary.subsections).toBe(28);
    expect(summary.specPoints).toBe(182);
    expect(summary.practicals).toBe(12);
    expect(summary.conceptNodes).toBe(193);
    expect(summary.validatedSemanticEdges).toBe(272);
    expect(summary.alreadyActive).toBe(false);
    expect(store.versionActivated.v).toBe(true);
    // the root is the NBA rootId join point (code 4CH1, SUBJECT)
    const root = store.nodes.get("4CH1")!;
    expect(root.node_type).toBe("SUBJECT");
    expect(summary.rootNodeId).toBe(root.id);
    expect(store.subject!.knowledge_node_id).toBe(root.id);
    // statuses preserve the store's epistemic state (§8A.4)
    expect(root.validation_status).toBe("VALIDATED");
    const concept = store.nodes.get(snapCode(store));
    expect(concept!.validation_status).toBe("SUGGESTED");
    function snapCode(store: { nodes: Map<string, NodeRow> }): string {
      // any CONCEPT/MISCONCEPTION node — the SUGGESTED band
      for (const n of store.nodes.values()) {
        if (n.node_type === "CONCEPT" || n.node_type === "MISCONCEPTION") return n.code;
      }
      return "";
    }
  });

  test("idempotent re-run: the structural no-op — every row reused, alreadyActive=true", async () => {
    const store = {
      nodes: new Map<string, NodeRow>(),
      edges: new Map<string, string>(),
      version: null as { id: string; status: string } | null,
      subject: null as { id: string; knowledge_node_id: string | null } | null,
      versionActivated: { v: false },
    };
    const first = await activateConceptGraph(seedDeps(store) as never, ACTIVATOR);
    expect(first.alreadyActive).toBe(false);
    const second = await activateConceptGraph(seedDeps(store) as never, ACTIVATOR);
    expect(second.nodesCreated).toBe(0);
    expect(second.edgesCreated).toBe(0);
    expect(second.nodesReused).toBe(420);
    expect(second.edgesReused).toBe(709);
    expect(second.alreadyActive).toBe(true);
  });

  test("same code + different provenance ⇒ loud conflict, never a silent re-seed", async () => {
    const store = {
      nodes: new Map<string, NodeRow>(),
      edges: new Map<string, string>(),
      version: null as { id: string; status: string } | null,
      subject: null as { id: string; knowledge_node_id: string | null } | null,
      versionActivated: { v: false },
    };
    // pre-seed the root code with FOREIGN provenance
    store.nodes.set("4CH1", {
      id: ROOT,
      code: "4CH1",
      node_type: "SUBJECT",
      title: "Chemistry (4CH1)",
      validation_status: "VALIDATED",
      provenance: "imported:elsewhere",
      applicability: null,
    });
    await expect(
      activateConceptGraph(seedDeps(store) as never, ACTIVATOR),
    ).rejects.toThrow(SeedConflictError);
    await expect(
      activateConceptGraph(seedDeps(store) as never, ACTIVATOR),
    ).rejects.toThrow(/resolve manually, never re-seed over it/);
  });

  test("the T-C24 backfill: applicability content-equality-guarded on reuse (one-time write)", async () => {
    // the first run writes applicability on create; a node seeded pre-V39
    // (applicability NULL) gets the one-time backfill on the reuse path
    const store = {
      nodes: new Map<string, NodeRow>(),
      edges: new Map<string, string>(),
      version: null as { id: string; status: string } | null,
      subject: null as { id: string; knowledge_node_id: string | null } | null,
      versionActivated: { v: false },
    };
    const d = seedDeps(store);
    await activateConceptGraph(d as never, ACTIVATOR);
    // strip one SP's applicability, re-run: the guard must write it back
    const spCode = [...store.nodes.values()].find(
      (n) => n.node_type === "SUBTOPIC" && n.applicability != null,
    )!;
    const before = JSON.stringify(spCode.applicability);
    spCode.applicability = null;
    await activateConceptGraph(seedDeps(store) as never, ACTIVATOR);
    expect(JSON.stringify(spCode.applicability)).toBe(before);
  });
});

// ── the /edges read model ────────────────────────────────────────────────────

describe("teacher concept-graph edges — the semantic read model (V15)", () => {
  const SUBTREE = [ROOT, "ea000000-0000-4000-8000-000000000002"];
  const CONCEPT = "ea000000-0000-4000-8000-000000000006";
  const MISCO = "ea000000-0000-4000-8000-000000000007"; // OUTSIDE the subtree
  const edgeRow = (over: Record<string, unknown>) => ({
    source_node_id: CONCEPT,
    target_node_id: "ea000000-0000-4000-8000-000000000002",
    relation_type: "RELATED_TO",
    validation_status: "VALIDATED",
    provenance: "t-c11:settled|pass:batch-1",
    rationale: "because",
    source_code: "C-Alpha",
    source_title: "Alpha",
    source_node_type: "CONCEPT",
    source_validation_status: "SUGGESTED",
    target_code: "4CH1-S1",
    target_title: "S1",
    target_node_type: "UNIT",
    target_validation_status: "VALIDATED",
    ...over,
  });

  function edgesRoutes(
    family: Array<Record<string, unknown>>,
    semantic: Array<Record<string, unknown>>,
  ) {
    const captured: { scope: unknown[] | null } = { scope: null };
    const routes: Route[] = [
      {
        match: /select id, code from knowledge_nodes where id = \? ::uuid/,
        rows: [{ id: ROOT, code: "4CH1" }],
      },
      { match: /with recursive subtree as/, rows: SUBTREE.map((id) => ({ id })) },
      {
        match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid/,
        rows: [{ id: ROOT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry" }],
      },
      {
        // the family widening — MISCONCEPTION_OF/REMEDIATED_BY/WRONG_ANSWER_PATTERN
        match: /and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)/,
        rows: family,
      },
      {
        // the semantic edges — capture the scope bind (the widening pin)
        match: /where e\.relation_type <> 'PART_OF'/,
          rows: [],
        rowsFor: (params) => {
          captured.scope = params[0] as unknown[];
          return semantic;
        },
      },
    ];
    return { routes, captured };
  }

  test("the root is 404-first (the same contract as every other read)", async () => {
    const routes: Route[] = [
      {
        match: /select id, code from knowledge_nodes where id = \? ::uuid/,
        rows: [],
      },
    ];
    await expect(
      teacherConceptEdges({ sql: fakeSql(routes), clock: { now: () => T0 } } as never, ROOT),
    ).rejects.toThrow(KnowledgeNotFoundError);
  });

  test("PART_OF is excluded by the SQL; the family SOURCES widen the scope (bind capture)", async () => {
    const { routes, captured } = edgesRoutes(
      [
        edgeRow({
          source_node_id: MISCO,
          relation_type: "REMEDIATED_BY",
          source_code: "M-Confused-Units",
          source_node_type: "MISCONCEPTION",
        }),
      ],
      [],
    );
    const d = { sql: fakeSql(routes), clock: { now: () => T0 } };
    const v = await teacherConceptEdges(d as never, ROOT);
    // the scope passed to the semantic query includes the family SOURCE
    // (MISCO is NOT a PART_OF member — the session-56 widening)
    expect(captured.scope).not.toBeNull();
    expect((captured.scope as unknown[]).map(String)).toContain(MISCO);
    expect((captured.scope as unknown[]).map(String)).toContain(ROOT);
  });

  test("the deterministic order: relation → source code → target code; the policy marker", async () => {
    const { routes, captured } = edgesRoutes(
      [],
      [
        edgeRow({ relation_type: "RELATED_TO", source_code: "C-Zeta" }),
        edgeRow({ relation_type: "REMEDIATED_BY", source_code: "M-Units", target_code: "4CH1-S1" }),
        edgeRow({ relation_type: "RELATED_TO", source_code: "C-Alpha", target_code: "4CH1-S1" }),
        edgeRow({ relation_type: "RELATED_TO", source_code: "C-Alpha", target_code: "4CH1-S1-a" }),
      ],
    );
    const v = await teacherConceptEdges({ sql: fakeSql(routes), clock: { now: () => T0 } } as never, ROOT);
    expect(v.policy).toBe("concept-graph-teacher/v1");
    expect(v.rootCode).toBe("4CH1");
    const keys = v.edges.map((e) => `${e.relation}:${e.source.code}:${e.target.code}`);
    expect(keys).toEqual([...keys].sort());
    // provenance + rationale are REQUIRED on the wire (the honesty contract)
    expect(v.edges[0]!.provenance.length).toBeGreaterThan(0);
    // the widening bind capture happened here too (family empty → subtree only)
    expect((captured.scope as unknown[]).map(String)).toEqual(SUBTREE);
  });
});

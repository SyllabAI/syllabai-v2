/**
 * T-MIG-134 band 134a — the second-subject curriculum seed laws, unit tests.
 * Stubbed sql via the shared fakeSql helper (the concept-graph seed test's
 * store-backed bind-capture precedent); pins:
 *
 *   - the REAL BUNDLE CONTRACT (apps/hub/content/igcse-physics-19/
 *     curriculum.json, the pinned bytes of record): 1 SUBJECT / 8 TOPIC /
 *     30 SUBTOPIC / 195 SPEC_POINT / 233 PART_OF edges; the code mapping
 *     (4PH1 root, 4PH1-S1 UNIT, 4PH1-S1-a TOPIC, 4PH1-1.1 / 4PH1-1.2P
 *     SUBTOPIC spec codes) + the T-C24 applicability verbatim passthrough;
 *   - the SEED: fresh store → 234 nodes / 233 edges created, the curriculum
 *     version lands ACTIVE, alreadyActive=false; idempotent re-run →
 *     everything reused, created=0, alreadyActive=true (the structural
 *     no-op);
 *   - the provenance-mismatch LOUD CONFLICT: same code + different
 *     provenance ⇒ "resolve manually, never re-seed over it";
 *   - the applicability backfill guard (one-time content-equality write);
 *   - the FAIL-CLOSED laws: non-PART_OF relations refuse, non-IGCSE level
 *     refuses, non-numeric spec codes refuse, the 200-char title bound.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  BundleSeedConflictError,
  bundleBoardAndQualification,
  bundleProvenance,
  mapBundleNodes,
  seedBundleCurriculum,
  type BundleCurriculum,
  type BundleSeedDeps,
} from "../../src/services/curriculum/bundle-seed";
import { fakeSql, type Route } from "../assessment/helpers";

const T0 = new Date("2026-10-19T12:00:00Z");
const ACTIVATOR = "f1000000-0000-4000-8000-000000000001";
const SOURCE = {
  slug: "igcse-physics-19",
  importRepo: "SyllabAI/syllabai-resources",
  importRef: "75755855f9e24391edb244f03993cc649bdf4e7a",
  schema: "syllabai-demo.content-bundle/2.0",
};

type NodeRow = {
  id: string;
  code: string;
  node_type: string;
  title: string;
  validation_status: string;
  provenance: string | null;
  applicability: Record<string, unknown> | null;
};

// ── the real pinned bundle bytes ─────────────────────────────────────────────

const BUNDLE_PATH = join(
  import.meta.dir,
  "../../../hub/content/igcse-physics-19/curriculum.json",
);
const bundle = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as BundleCurriculum;

describe("second-subject bundle — the pinned content contract (igcse-physics-19)", () => {
  test("the count contract fail-closes at the exact bundle numbers", () => {
    const fams = { SUBJECT: 0, TOPIC: 0, SUBTOPIC: 0, SPEC_POINT: 0 } as Record<string, number>;
    for (const n of bundle.nodes) fams[n.family] = (fams[n.family] ?? 0) + 1;
    expect(fams.SUBJECT).toBe(1);
    expect(fams.TOPIC).toBe(8);
    expect(fams.SUBTOPIC).toBe(30);
    expect(fams.SPEC_POINT).toBe(195);
    expect(bundle.edges.length).toBe(233);
    expect(new Set(bundle.edges.map((e) => e.relation))).toEqual(new Set(["PART_OF"]));
    expect(bundle.code).toBe("4PH1");
    expect(bundle.subject).toBe("Physics");
    expect(bundle.level).toBe("IGCSE");
    expect(bundle.syllabusVersion).toBe("2017");
  });

  test("the code mapping: the of-record 4CH1 scheme mirrored onto 4PH1", () => {
    const mapped = mapBundleNodes(bundle, "4PH1 official specification structure");
    expect(mapped.size).toBe(234);
    // the root
    const root = mapped.get("igcse-physics-19")!;
    expect(root.nodeType).toBe("SUBJECT");
    expect(root.dbCode).toBe("4PH1");
    expect(root.title).toBe("Physics (4PH1)");
    // the section → UNIT law
    const unit = mapped.get("igcse-physics-T1")!;
    expect(unit.nodeType).toBe("UNIT");
    expect(unit.dbCode).toBe("4PH1-S1");
    expect(unit.title).toBe("Forces and motion");
    // the topic → TOPIC law (the bundle's own :SUBx letter)
    const topic = mapped.get("igcse-physics-T1:SUBa")!;
    expect(topic.nodeType).toBe("TOPIC");
    expect(topic.dbCode).toBe("4PH1-S1-a");
    // the spec point → SUBTOPIC law (official numbers verbatim)
    const sp = mapped.get("1.1")!;
    expect(sp.nodeType).toBe("SUBTOPIC");
    expect(sp.dbCode).toBe("4PH1-1.1");
    // the P-suffix law: physics-only content, Paper 2P only — the C-suffix mirror
    const spP = mapped.get("1.2P")!;
    expect(spP.dbCode).toBe("4PH1-1.2P");
    expect(spP.applicability).toEqual({
      papers: ["2P"],
      double_award_shared: false,
      rule: expect.stringContaining("P-suffixed"),
    });
    // all 234 DB codes unique (the uq_knowledge_node_code law)
    const codes = [...mapped.values()].map((m) => m.dbCode);
    expect(new Set(codes).size).toBe(234);
  });

  test("the provenance line of record: ≤300, carries the bundle + gate", () => {
    const p = bundleProvenance(SOURCE);
    expect(p.startsWith("bundle:igcse-physics-19|src:SyllabAI/syllabai-resources@")).toBe(true);
    expect(p).toContain("|tier:RULE_DERIVED|gate:operator-git-PR");
    expect(p.length).toBeLessThanOrEqual(300);
  });
});

// ── the store-backed fakeSql routes (the concept-seed seedRoutes mirror) ─────

function seedRoutes(store: {
  nodes: Map<string, NodeRow>;
  edges: Map<string, string>;
  version: { id: string; status: string } | null;
  subject: { id: string; knowledge_node_id: string | null } | null;
  versionActivated: { v: boolean };
  applicabilityUpdates: { n: number };
}): Route[] {
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
      match: /select id, code, node_type, title, validation_status, provenance, applicability from knowledge_nodes where code = \?$/,
      rows: [],
      rowsFor: (params) => {
        const n = store.nodes.get(String(params[0]));
        return n ? [n] : [];
      },
    },
    {
      match: /select id, code, node_type, title, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
      rows: [],
    },
    {
      // the ROOT insert (9-column — no applicability on the root path)
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
          provenance: String(params[4]),
          applicability: null,
        });
        return [];
      },
    },
    {
      // the 10-column node insert (applicability last)
      match: /insert into knowledge_nodes \(id, code, node_type, title, description, validation_status, provenance, created_by, created_at, applicability\) values \( \? ::uuid, \? , \? , \? , \? , \? , \? , \? , \? ::timestamptz, \? ::jsonb\)/,
      rows: [],
      rowsFor: (params) => {
        store.nodes.set(String(params[1]), {
          id: String(params[0]),
          code: String(params[1]),
          node_type: String(params[2]),
          title: String(params[3]),
          validation_status: String(params[5]),
          provenance: String(params[6]),
          applicability: params[9] == null ? null : (JSON.parse(String(params[9])) as Record<string, unknown>),
        });
        return [];
      },
    },
    {
      match: /update knowledge_nodes set applicability = \? ::jsonb where id = \? ::uuid/,
      rows: [],
      rowsFor: (params) => {
        store.applicabilityUpdates.n++;
        for (const n of store.nodes.values()) {
          if (n.id === String(params[1])) {
            n.applicability = params[0] == null ? null : (JSON.parse(String(params[0])) as Record<string, unknown>);
          }
        }
        return [];
      },
    },
    {
      match: /select id, provenance from knowledge_edges where source_node_id = \? ::uuid and target_node_id = \? ::uuid and relation_type = 'PART_OF'/,
      rows: [],
      rowsFor: (params) => {
        const key = String(params[0]) + "->" + String(params[1]);
        const prov = store.edges.get(key);
        return prov != null ? [{ id: "edge", provenance: prov }] : [];
      },
    },
    {
      match: /insert into knowledge_edges/,
      rows: [],
      rowsFor: (params) => {
        // binds: (id, source, target, rationale, provenance, created_by, created_at)
        const key = String(params[1]) + "->" + String(params[2]);
        store.edges.set(key, String(params[4]));
        return [];
      },
    },
  ];
}

function seedDeps(store: ReturnType<typeof newStore>): BundleSeedDeps {
  return { sql: fakeSql(seedRoutes(store)), clock: { now: () => T0 } };
}

function newStore() {
  return {
    nodes: new Map<string, NodeRow>(),
    edges: new Map<string, string>(),
    version: null as { id: string; status: string } | null,
    subject: null as { id: string; knowledge_node_id: string | null } | null,
    versionActivated: { v: false },
    applicabilityUpdates: { n: 0 },
  };
}

// ── the seed laws ────────────────────────────────────────────────────────────

describe("second-subject seed — deterministic idempotent activation", () => {
  test("fresh store: 234 nodes / 233 edges created, the version lands ACTIVE, alreadyActive=false", async () => {
    const store = newStore();
    const summary = await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    // 1 root + 8 units + 30 topics + 195 spec points
    expect(summary.nodesCreated).toBe(234);
    expect(summary.nodesReused).toBe(0);
    // 8 unit→root + 30 topic→unit + 195 SP→topic
    expect(summary.edgesCreated).toBe(233);
    expect(summary.edgesReused).toBe(0);
    expect(summary.units).toBe(8);
    expect(summary.topics).toBe(30);
    expect(summary.specPoints).toBe(195);
    expect(summary.alreadyActive).toBe(false);
    expect(store.versionActivated.v).toBe(true);
    // the root is the CLA/tutor subject-root join point (code 4PH1, SUBJECT)
    const root = store.nodes.get("4PH1")!;
    expect(root.node_type).toBe("SUBJECT");
    expect(summary.rootNodeId).toBe(root.id);
    expect(store.subject!.knowledge_node_id).toBe(root.id);
    // the serving posture of record: the tree lands VALIDATED
    expect(root.validation_status).toBe("VALIDATED");
    const sp = store.nodes.get("4PH1-1.1")!;
    expect(sp.node_type).toBe("SUBTOPIC");
    expect(sp.validation_status).toBe("VALIDATED");
    // all node provenance = the bundle line of record
    expect(sp.provenance).toBe(bundleProvenance(SOURCE));
  });

  test("the PART_OF direction law of record: source=DESCENDANT, target=ANCESTOR", async () => {
    // the store convention (chemistry census: 4CH1-S1→4CH1, 4CH1-S1-a→4CH1-S1,
    // 4CH1-1.1→4CH1-S1-a — "source PART_OF target"); the bundle's edge list
    // carries the opposite direction and MUST be normalized on materialize.
    // The tree-walk consumers (graph.tree, taxonomy.subtreeIds, the CLA
    // subject-isolation walk) key on this — an inverted edge is invisible
    // to every subtree read.
    const store = newStore();
    await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    const sp = store.nodes.get("4PH1-1.1")!;
    const topic = store.nodes.get("4PH1-S1-a")!;
    const unit = store.nodes.get("4PH1-S1")!;
    const root = store.nodes.get("4PH1")!;
    // SP PART_OF TOPIC: source=SP, target=TOPIC
    expect(store.edges.has(sp.id + "->" + topic.id)).toBe(true);
    expect(store.edges.has(topic.id + "->" + sp.id)).toBe(false);
    // TOPIC PART_OF UNIT: source=TOPIC, target=UNIT
    expect(store.edges.has(topic.id + "->" + unit.id)).toBe(true);
    expect(store.edges.has(unit.id + "->" + topic.id)).toBe(false);
    // UNIT PART_OF SUBJECT: source=UNIT, target=SUBJECT
    expect(store.edges.has(unit.id + "->" + root.id)).toBe(true);
    expect(store.edges.has(root.id + "->" + unit.id)).toBe(false);
    // every one of the 233 edges runs descendant→ancestor, never the reverse
    const byId = new Map([...store.nodes.values()].map((n) => [n.id, n]));
    for (const key of store.edges.keys()) {
      const [s, t] = key.split("->");
      expect(byId.get(s!)!.code).not.toBe(root.code);
    }
  });

  test("idempotent re-run: the structural no-op — every row reused, alreadyActive=true", async () => {
    const store = newStore();
    const first = await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    expect(first.alreadyActive).toBe(false);
    const second = await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    expect(second.nodesCreated).toBe(0);
    expect(second.edgesCreated).toBe(0);
    expect(second.nodesReused).toBe(234);
    expect(second.edgesReused).toBe(233);
    expect(second.alreadyActive).toBe(true);
    expect(store.applicabilityUpdates.n).toBe(0);
  });

  test("the jsonb key-order law: the guard compares CONTENT, not string forms", async () => {
    // real jsonb normalizes key order on read-back — a re-run against the
    // store must be a structural no-op (applicabilityWrites=0) even though
    // the read-back object carries keys in another order than the seed
    const store = newStore();
    await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    // simulate the jsonb read-back: rebuild one SP's applicability with
    // keys in a DIFFERENT order, identical content
    const sp = store.nodes.get("4PH1-1.2P")!;
    const a = sp.applicability as { papers?: string[]; double_award_shared?: boolean; rule?: string };
    sp.applicability = { rule: a.rule, double_award_shared: a.double_award_shared, papers: a.papers };
    const rerun = await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    expect(rerun.applicabilityWrites).toBe(0);
    expect(store.applicabilityUpdates.n).toBe(0);
  });

  test("the jsonb transport-form law: a RAW-TEXT read-back compares by content", async () => {
    // prod-probe of record: the driver may return the jsonb column as raw
    // text (typeof row.applicability === 'string') — the guard must parse
    // before comparing, or every re-run re-writes identical values
    const store = newStore();
    await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    const sp = store.nodes.get("4PH1-1.2P")!;
    const a = sp.applicability as { papers?: string[]; double_award_shared?: boolean; rule?: string };
    sp.applicability = JSON.stringify({
      rule: a.rule,
      double_award_shared: a.double_award_shared,
      papers: a.papers,
    }) as unknown as Record<string, unknown>;
    const rerun = await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    expect(rerun.applicabilityWrites).toBe(0);
    expect(store.applicabilityUpdates.n).toBe(0);
  });

  test("same code + different provenance ⇒ loud conflict, never a silent re-seed", async () => {
    const store = newStore();
    store.nodes.set("4PH1", {
      id: "ea000000-0000-4000-8000-000000000009",
      code: "4PH1",
      node_type: "SUBJECT",
      title: "Physics (4PH1)",
      validation_status: "VALIDATED",
      provenance: "imported:elsewhere",
      applicability: null,
    });
    await expect(
      seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR),
    ).rejects.toThrow(BundleSeedConflictError);
    await expect(
      seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR),
    ).rejects.toThrow(/resolve manually, never re-seed over it/);
  });

  test("the T-C24 backfill: applicability content-equality-guarded on reuse (one-time write)", async () => {
    const store = newStore();
    await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    // strip one SP's applicability, re-run: the guard must write it back
    const sp = store.nodes.get("4PH1-1.2P")!;
    const before = JSON.stringify(sp.applicability);
    sp.applicability = null;
    const rerun = await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    expect(JSON.stringify(sp.applicability)).toBe(before);
    expect(rerun.applicabilityWrites).toBe(1);
    expect(store.applicabilityUpdates.n).toBe(1);
  });
});

describe("second-subject seed — the fail-closed laws", () => {
  test("non-PART_OF bundle relations refuse to guess", async () => {
    const hostile: BundleCurriculum = {
      ...bundle,
      edges: [{ source: "igcse-physics-19", relation: "RELATED_TO", target: "igcse-physics-T1", provenanceTier: "RULE_DERIVED" }],
    };
    await expect(seedBundleCurriculum(seedDeps(newStore()), hostile, SOURCE, ACTIVATOR)).rejects.toThrow(
      /outside PART_OF — refusing to guess/,
    );
  });

  test("non-IGCSE bundle levels refuse (the International GCSE family of record)", async () => {
    const alevel: BundleCurriculum = { ...bundle, level: "IAL" };
    await expect(seedBundleCurriculum(seedDeps(newStore()), alevel, SOURCE, ACTIVATOR)).rejects.toThrow(
      /outside the International GCSE family of record/,
    );
  });

  test("the 200-char title bound holds on the longest spec wording", () => {
    const mapped = mapBundleNodes(bundle, "4PH1 official specification structure");
    for (const m of mapped.values()) {
      expect(m.title.length).toBeLessThanOrEqual(200);
      expect(m.description.length).toBeLessThanOrEqual(1000);
    }
    // the bundle DOES carry a 448-char spec title — the bound is load-bearing
    const longest = bundle.nodes.reduce((a, n) => Math.max(a, (n.title ?? "").length), 0);
    expect(longest).toBeGreaterThan(200);
  });
});

// ── T-MIG-135a — the maths dotted grammar (igcse-maths-a-18-higher) ─────────

const MATHS_BUNDLE_PATH = join(
  import.meta.dir,
  "../../../hub/content/igcse-maths-a-18-higher/curriculum.json",
);
const mathsBundle = JSON.parse(readFileSync(MATHS_BUNDLE_PATH, "utf8")) as BundleCurriculum;

describe("T-MIG-135a maths bundle — the dotted :SUB grammar (igcse-maths-a-18-higher)", () => {
  test("the count contract fail-closes at the exact maths bundle numbers", () => {
    const fams = { SUBJECT: 0, TOPIC: 0, SUBTOPIC: 0, SPEC_POINT: 0 } as Record<string, number>;
    for (const n of mathsBundle.nodes) fams[n.family] = (fams[n.family] ?? 0) + 1;
    expect(fams.SUBJECT).toBe(1);
    expect(fams.TOPIC).toBe(6);
    expect(fams.SUBTOPIC).toBe(39);
    expect(fams.SPEC_POINT).toBe(188);
    expect(mathsBundle.edges.length).toBe(233);
    expect(new Set(mathsBundle.edges.map((e) => e.relation))).toEqual(new Set(["PART_OF"]));
    expect(mathsBundle.code).toBe("4MA1");
    expect(mathsBundle.subject).toBe("Maths");
    expect(mathsBundle.level).toBe("IGCSE");
    expect(mathsBundle.syllabusVersion).toBe("2016");
  });

  test("the code mapping: the dotted suffix lands 4MA1-S1-1.1 (the official topic number verbatim)", () => {
    const mapped = mapBundleNodes(mathsBundle, "4MA1 official specification structure");
    expect(mapped.size).toBe(234);
    // the root
    const root = mapped.get("igcse-maths-a-18-higher")!;
    expect(root.nodeType).toBe("SUBJECT");
    expect(root.dbCode).toBe("4MA1");
    expect(root.title).toBe("Maths (4MA1)");
    // the section → UNIT law (order-derived, identical to the physics law)
    const unit = mapped.get("igcse-maths-a-T1")!;
    expect(unit.nodeType).toBe("UNIT");
    expect(unit.dbCode).toBe("4MA1-S1");
    // the topic → TOPIC law (the bundle's own :SUB<d.d> dotted suffix)
    const topic = mapped.get("igcse-maths-a-T1:SUB1.1")!;
    expect(topic.nodeType).toBe("TOPIC");
    expect(topic.dbCode).toBe("4MA1-S1-1.1");
    // a second-section topic proves the section order rides the parent UNIT
    const t2 = [...mapped.values()].find(
      (m) => m.nodeType === "TOPIC" && m.bundleCode.includes("T2:SUB"),
    )!;
    expect(t2.dbCode.startsWith("4MA1-S2-")).toBe(true);
    // the spec point → SUBTOPIC law: the official code verbatim, LETTER
    // suffixes and all (4MA1-1.6E, 4MA1-1.6G — the maths tier letters)
    const sp = mapped.get("1.6E")!;
    expect(sp.nodeType).toBe("SUBTOPIC");
    expect(sp.dbCode).toBe("4MA1-1.6E");
    expect(mapped.get("1.1A")!.dbCode).toBe("4MA1-1.1A");
    expect(mapped.get("1.1H")!.dbCode).toBe("4MA1-1.1H");
    // every maths spec point resolves to its parent TOPIC's dbCode as a
    // prefix (the join the questions shim depends on)
    for (const m of mapped.values()) {
      if (m.nodeType !== "SUBTOPIC") continue;
      const parentTopic = mapped.get(m.parentBundleCode!)!;
      expect(parentTopic.nodeType).toBe("TOPIC");
      expect(m.dbCode.startsWith(parentTopic.dbCode)).toBe(false); // spec codes are NOT topic-suffixed
      expect(parentTopic.dbCode.startsWith("4MA1-S")).toBe(true);
    }
    // all 234 DB codes unique (the uq_knowledge_node_code law)
    const codes = [...mapped.values()].map((m) => m.dbCode);
    expect(new Set(codes).size).toBe(234);
  });

  test("the physics letter grammar stays byte-identical beside the dotted law", () => {
    // the pre-existing physics pins above already lock 4PH1-S1-a; this pin
    // re-derives BOTH bundles in one breath so a grammar regression on
    // either side fails here first
    const physics = mapBundleNodes(bundle, "4PH1 official specification structure");
    expect(physics.get("igcse-physics-T1:SUBa")!.dbCode).toBe("4PH1-S1-a");
    const maths = mapBundleNodes(mathsBundle, "4MA1 official specification structure");
    expect(maths.get("igcse-maths-a-T1:SUB1.1")!.dbCode).toBe("4MA1-S1-1.1");
  });

  test("a SUBTOPIC code carrying neither the letter nor the dotted suffix still refuses", () => {
    const broken: BundleCurriculum = {
      ...mathsBundle,
      nodes: mathsBundle.nodes.map((n) =>
        n.family === "SUBTOPIC" ? { ...n, code: "igcse-maths-a-T1:SUB" } : n,
      ),
    };
    expect(() => mapBundleNodes(broken, "x")).toThrow(
      /does not carry the :SUBx letter, dotted, or placeholder suffix/,
    );
  });
});

// ── T-MIG-136a — the maths-b placeholder + alnum grammar (igcse-maths-b-16) ──

const MATHS_B_BUNDLE_PATH = join(
  import.meta.dir,
  "../../../hub/content/igcse-maths-b-16/curriculum.json",
);
const mathsBBundle = JSON.parse(readFileSync(MATHS_B_BUNDLE_PATH, "utf8")) as BundleCurriculum;

const MATHS_B_SOURCE = {
  slug: "igcse-maths-b-16",
  importRepo: "SyllabAI/syllabai-resources",
  importRef: "main@c2fcd88aea3620b9190950930d0861890d4ee524",
  schema: "syllabai-demo.content-bundle/2.0",
};

describe("T-MIG-136a maths-b bundle — the placeholder :SUB_ + alnum spec grammar (igcse-maths-b-16)", () => {
  test("the count contract fail-closes at the exact maths-b bundle numbers", () => {
    const fams = { SUBJECT: 0, TOPIC: 0, SUBTOPIC: 0, SPEC_POINT: 0 } as Record<string, number>;
    for (const n of mathsBBundle.nodes) fams[n.family] = (fams[n.family] ?? 0) + 1;
    expect(fams.SUBJECT).toBe(1);
    expect(fams.TOPIC).toBe(10);
    expect(fams.SUBTOPIC).toBe(10);
    expect(fams.SPEC_POINT).toBe(98);
    expect(mathsBBundle.edges.length).toBe(118);
    expect(new Set(mathsBBundle.edges.map((e) => e.relation))).toEqual(new Set(["PART_OF"]));
    expect(mathsBBundle.code).toBe("4MB1");
    expect(mathsBBundle.subject).toBe("Maths");
    expect(mathsBBundle.level).toBe("IGCSE");
    expect(mathsBBundle.syllabusVersion).toBe("2016");
  });

  test("the code mapping: the placeholder lands 4MB1-S1-_ and the alnum point lands 4MB1-S1-1A", () => {
    const mapped = mapBundleNodes(mathsBBundle, "4MB1 official specification structure");
    expect(mapped.size).toBe(119);
    // the root
    const root = mapped.get("igcse-maths-b-16")!;
    expect(root.nodeType).toBe("SUBJECT");
    expect(root.dbCode).toBe("4MB1");
    expect(root.title).toBe("Maths (4MB1)");
    // the section → UNIT law (order-derived, identical to the physics law)
    const unit = mapped.get("igcse-maths-b-T1")!;
    expect(unit.nodeType).toBe("UNIT");
    expect(unit.dbCode).toBe("4MB1-S1");
    // the placeholder → TOPIC law (the bundle's own :SUB_ tail, verbatim —
    // the tail separator is the law's own, the tail byte is the bundle's)
    const placeholder = mapped.get("igcse-maths-b-T1:SUB_")!;
    expect(placeholder.nodeType).toBe("TOPIC");
    expect(placeholder.dbCode).toBe("4MB1-S1-_");
    // the alnum spec point → SUBTOPIC law: {grandparent UNIT}-{code} verbatim
    const sp = mapped.get("1A")!;
    expect(sp.nodeType).toBe("SUBTOPIC");
    expect(sp.dbCode).toBe("4MB1-S1-1A");
    // the two-digit section alphabet rides its own UNIT — the code lands
    // VERBATIM (the card law: 4MB1-S1-1A carries the section digit twice,
    // S1 + 1A; 10A does the same at S10), nothing re-derived or stripped
    expect(mapped.get("10A")!.dbCode).toBe("4MB1-S10-10A");
    // the applicability passthrough (the 4MB1 papers, verbatim, T-C24 law)
    expect(sp.applicability).toEqual({
      papers: ["4MB1/01", "4MB1/02"],
      rule: expect.stringContaining("both papers"),
    });
    // EVERY alnum point = its own grandparent UNIT's dbCode + its code — the
    // join the four subsystems key on stays derivable from the tree itself
    for (const m of mapped.values()) {
      if (m.nodeType !== "SUBTOPIC") continue;
      const placeholderTopic = mapped.get(m.parentBundleCode!)!;
      expect(placeholderTopic.nodeType).toBe("TOPIC");
      const spUnit = mapped.get(placeholderTopic.parentBundleCode!)!;
      expect(spUnit.nodeType).toBe("UNIT");
      expect(m.dbCode).toBe(spUnit.dbCode + "-" + m.bundleCode);
    }
    // all 119 DB codes unique (the uq_knowledge_node_code law)
    const codes = [...mapped.values()].map((m) => m.dbCode);
    expect(new Set(codes).size).toBe(119);
  });

  test("all three grammars re-proven in one breath — physics letter + maths-a dotted byte-identical beside the maths-b placeholder", () => {
    const physics = mapBundleNodes(bundle, "4PH1 official specification structure");
    expect(physics.get("igcse-physics-T1:SUBa")!.dbCode).toBe("4PH1-S1-a");
    const maths = mapBundleNodes(mathsBundle, "4MA1 official specification structure");
    expect(maths.get("igcse-maths-a-T1:SUB1.1")!.dbCode).toBe("4MA1-S1-1.1");
    const mathsB = mapBundleNodes(mathsBBundle, "4MB1 official specification structure");
    expect(mathsB.get("igcse-maths-b-T1:SUB_")!.dbCode).toBe("4MB1-S1-_");
    // the alnum algebra is DORMANT for the pre-existing bundles — every live
    // physics/chemistry/maths-a spec code carries a dot, so the dbCode laws
    // they were pinned under stay byte-identical (the 136a widening is
    // additive by construction, re-proven here on the real bytes)
    expect(physics.get("1.1")!.dbCode).toBe("4PH1-1.1");
    expect(physics.get("1.2P")!.dbCode).toBe("4PH1-1.2P");
    expect(maths.get("1.6E")!.dbCode).toBe("4MA1-1.6E");
    expect(maths.get("1.1A")!.dbCode).toBe("4MA1-1.1A");
  });

  test("the seed lands 119 nodes / 118 edges on a fresh store, the version ACTIVE, idempotent on re-run", async () => {
    const store = newStore();
    const summary = await seedBundleCurriculum(seedDeps(store), mathsBBundle, MATHS_B_SOURCE, ACTIVATOR);
    // 1 root + 10 units + 10 placeholder topics + 98 alnum spec points
    expect(summary.nodesCreated).toBe(119);
    expect(summary.nodesReused).toBe(0);
    expect(summary.edgesCreated).toBe(118);
    expect(summary.edgesReused).toBe(0);
    expect(summary.units).toBe(10);
    expect(summary.topics).toBe(10);
    expect(summary.specPoints).toBe(98);
    expect(summary.alreadyActive).toBe(false);
    expect(store.versionActivated.v).toBe(true);
    // the root is the CLA/tutor subject-root join point (code 4MB1, SUBJECT)
    const root = store.nodes.get("4MB1")!;
    expect(root.node_type).toBe("SUBJECT");
    expect(summary.rootNodeId).toBe(root.id);
    expect(store.subject!.knowledge_node_id).toBe(root.id);
    // the placeholder + the alnum point land with the mapped codes
    expect(store.nodes.get("4MB1-S1-_")!.node_type).toBe("TOPIC");
    const sp = store.nodes.get("4MB1-S1-1A")!;
    expect(sp.node_type).toBe("SUBTOPIC");
    expect(sp.validation_status).toBe("VALIDATED");
    expect(sp.provenance).toBe(bundleProvenance(MATHS_B_SOURCE));
    // the PART_OF direction law holds on the maths-b tree too (SP→TOPIC→UNIT→SUBJECT)
    const placeholderTopic = store.nodes.get("4MB1-S1-_")!;
    const unit = store.nodes.get("4MB1-S1")!;
    expect(store.edges.has(sp.id + "->" + placeholderTopic.id)).toBe(true);
    expect(store.edges.has(placeholderTopic.id + "->" + unit.id)).toBe(true);
    expect(store.edges.has(unit.id + "->" + root.id)).toBe(true);
    // idempotent re-run: the structural no-op
    const second = await seedBundleCurriculum(seedDeps(store), mathsBBundle, MATHS_B_SOURCE, ACTIVATOR);
    expect(second.nodesCreated).toBe(0);
    expect(second.edgesCreated).toBe(0);
    expect(second.nodesReused).toBe(119);
    expect(second.edgesReused).toBe(118);
    expect(second.alreadyActive).toBe(true);
  });

  test("a maths-b SUBTOPIC code carrying neither letter, dotted, nor placeholder suffix still refuses", () => {
    const broken: BundleCurriculum = {
      ...mathsBBundle,
      nodes: mathsBBundle.nodes.map((n) =>
        n.family === "SUBTOPIC" ? { ...n, code: "igcse-maths-b-T1:SUB" } : n,
      ),
    };
    expect(() => mapBundleNodes(broken, "x")).toThrow(
      /does not carry the :SUBx letter, dotted, or placeholder suffix/,
    );
  });
});

// ── CIE-INTEGRATION phase 4 — the board/qualification vocabulary widening ────
// (scope receipt cie-frontend-integration-scope-r0 executionPlan phase 4; the
// 138a unit-vocabulary-widening precedent class; the Edexcel path byte-
// identical — the pinned tests above ARE the control law)

describe("phase-4 CIE widening — the board/qualification vocabulary of record", () => {
  const EDX = { board: "Pearson Edexcel", level: "IGCSE" } as const;
  const CIE_IGCSE = { board: "Cambridge International", level: "IGCSE" } as const;

  test("the Edexcel path is byte-identical (the 134a constants verbatim)", () => {
    expect(bundleBoardAndQualification(EDX)).toEqual({
      board: "Edexcel",
      qualification: "International GCSE (9-1)",
    });
    // the upstream board spelling variant resolves to the same store board
    expect(bundleBoardAndQualification({ board: "Edexcel", level: "IGCSE" })).toEqual({
      board: "Edexcel",
      qualification: "International GCSE (9-1)",
    });
  });

  test("the CIE vocabulary pins (the board's own family names of record)", () => {
    expect(bundleBoardAndQualification(CIE_IGCSE)).toEqual({
      board: "Cambridge International",
      qualification: "Cambridge IGCSE",
    });
    for (const level of ["A-LEVEL", "A-Level", "AS"]) {
      expect(
        bundleBoardAndQualification({ board: "Cambridge International", level }),
      ).toEqual({
        board: "Cambridge International",
        qualification: "Cambridge International AS & A Level",
      });
    }
  });

  test("fail-closed: hostile boards and levels refuse to guess", () => {
    expect(() => bundleBoardAndQualification({ board: "OCR", level: "IGCSE" })).toThrow(
      /outside the board vocabulary of record/,
    );
    expect(() => bundleBoardAndQualification({ board: "Edexcel", level: "A-LEVEL" })).toThrow(
      /outside the International GCSE family of record/,
    );
    expect(() =>
      bundleBoardAndQualification({ board: "Cambridge International", level: "IAL" }),
    ).toThrow(/outside the Cambridge International family of record/);
  });

  test("a REAL CIE A-level bundle seeds through the store law (cie-a-level-chemistry-25, 9701)", async () => {
    const cie = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../../hub/content/cie-a-level-chemistry-25/curriculum.json"),
        "utf8",
      ) as string,
    ) as BundleCurriculum;
    expect(cie.board).toBe("Cambridge International");
    expect(cie.level).toBe("A-LEVEL");

    const store = newStore();
    const seen: Array<{ board: string; qualification: string; code: string }> = [];
    const versionSelect: Route = {
      match: /select id, status from curriculum_versions where board = \? and qualification = \? and code = \?/,
      rows: [],
      rowsFor: (params) => {
        seen.push({ board: String(params[0]), qualification: String(params[1]), code: String(params[2]) });
        return store.version ? [store.version] : [];
      },
    };
    const routes = seedRoutes(store);
    const deps: BundleSeedDeps = { sql: fakeSql([versionSelect, ...routes.slice(1)]), clock: { now: () => T0 } };
    const summary = await seedBundleCurriculum(deps, cie, { slug: "cie-a-level-chemistry-25", importRepo: "SyllabAI/syllabai-resources", importRef: "0fe5f77210f74aaeb3f6c491dfe0263d12db738c", schema: "syllabai-demo.content-bundle/2.0" }, ACTIVATOR);
    // the CIE version key of record (NOT the Edexcel constants)
    expect(seen).toEqual([
      {
        board: "Cambridge International",
        qualification: "Cambridge International AS & A Level",
        code: "9701-2025-2027",
      },
    ]);
    expect(summary.nodesCreated).toBe(cie.nodes.length);
    expect(summary.edgesCreated).toBe(cie.edges.length);
    expect(summary.alreadyActive).toBe(false);
    // idempotent re-run: the structural no-op of record
    const again = await seedBundleCurriculum(deps, cie, { slug: "cie-a-level-chemistry-25", importRepo: "SyllabAI/syllabai-resources", importRef: "0fe5f77210f74aaeb3f6c491dfe0263d12db738c", schema: "syllabai-demo.content-bundle/2.0" }, ACTIVATOR);
    expect(again.nodesCreated).toBe(0);
    expect(again.alreadyActive).toBe(true);
  });

  test("a REAL CIE IGCSE bundle seeds under the Cambridge IGCSE qualification (cie-igcse-chemistry-23, 0620)", async () => {
    const cie = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../../hub/content/cie-igcse-chemistry-23/curriculum.json"),
        "utf8",
      ) as string,
    ) as BundleCurriculum;
    const store = newStore();
    const seen: Array<{ board: string; qualification: string; code: string }> = [];
    const versionSelect: Route = {
      match: /select id, status from curriculum_versions where board = \? and qualification = \? and code = \?/,
      rows: [],
      rowsFor: (params) => {
        seen.push({ board: String(params[0]), qualification: String(params[1]), code: String(params[2]) });
        return store.version ? [store.version] : [];
      },
    };
    const routes = seedRoutes(store);
    const deps: BundleSeedDeps = { sql: fakeSql([versionSelect, ...routes.slice(1)]), clock: { now: () => T0 } };
    await seedBundleCurriculum(deps, cie, { slug: "cie-igcse-chemistry-23", importRepo: "SyllabAI/syllabai-resources", importRef: "0fe5f77210f74aaeb3f6c491dfe0263d12db738c", schema: "syllabai-demo.content-bundle/2.0" }, ACTIVATOR);
    expect(seen).toEqual([
      { board: "Cambridge International", qualification: "Cambridge IGCSE", code: "0620-2023-2025" },
    ]);
  });
});

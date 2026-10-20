/**
 * T-MIG-134 band 134a — the second-subject curriculum seed laws, unit tests.
 * Stubbed sql via the shared fakeSql helper (the concept-graph seed test's
 * store-backed bind-capture precedent); pins:
 *
 *   - the REAL BUNDLE CONTRACT (apps/hub/content/igcse-physics-19/
 *     curriculum.json, the pinned bytes of record): 1 SUBJECT / 8 TOPIC /
 *     30 SUBTOPIC / 195 SPEC_POINT / 233 PART_OF edges; the code mapping
 *     (4PH1 root, 4PH1-S1 UNIT, 4PH1-S1-a TOPIC, 4PH1-1.1 / 4PH1-1.2P
 *     SPEC_POINT spec codes — the T-MIG-139 F.5 §7 gate-G2 CONVERGED
 *     landing, was SUBTOPIC pre-139) + the T-C24 applicability verbatim
 *     passthrough;
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
  sameSeedExceptBundle,
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
    // the spec point → SPEC_POINT law (T-MIG-139 G2 convergence; official
    // numbers verbatim)
    const sp = mapped.get("1.1")!;
    expect(sp.nodeType).toBe("SPEC_POINT");
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
    expect(sp.node_type).toBe("SPEC_POINT");
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
    // the spec point → SPEC_POINT law: the official code verbatim, LETTER
    // suffixes and all (4MA1-1.6E, 4MA1-1.6G — the maths tier letters)
    const sp = mapped.get("1.6E")!;
    expect(sp.nodeType).toBe("SPEC_POINT");
    expect(sp.dbCode).toBe("4MA1-1.6E");
    expect(mapped.get("1.1A")!.dbCode).toBe("4MA1-1.1A");
    expect(mapped.get("1.1H")!.dbCode).toBe("4MA1-1.1H");
    // every maths spec point resolves to its parent TOPIC's dbCode as a
    // prefix (the join the questions shim depends on)
    for (const m of mapped.values()) {
      if (m.nodeType !== "SPEC_POINT") continue;
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
      /does not carry the :SUBx letter, dotted, placeholder, or letter-prefixed suffix/,
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
    // the alnum spec point → SPEC_POINT law (T-MIG-139 G2 convergence): {grandparent UNIT}-{code} verbatim
    const sp = mapped.get("1A")!;
    expect(sp.nodeType).toBe("SPEC_POINT");
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
      if (m.nodeType !== "SPEC_POINT") continue;
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
    expect(sp.node_type).toBe("SPEC_POINT");
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
      /does not carry the :SUBx letter, dotted, placeholder, or letter-prefixed suffix/,
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

// ── the run-002 repair program — the seed-law widenings (CIE-INTEGRATION) ────
//
// The cie-phase4-db-plane run #2 (39472595952) honest-red census surfaced
// five defect classes on the disposable COW; the three SEED classes get
// their pins here (the tx seam + the asset class live in the orchestrator's
// repair test file). The Edexcel laws stay byte-identical — every existing
// pin above re-proves that on every run.

describe("run-002 repair — the sameSeedExceptBundle shared-code reuse law", () => {
  const base = "bundle:X|src:SyllabAI/syllabai-resources@0fe5f77210f74aaeb3f6c491dfe0263d12db738c|schema:syllabai-demo.content-bundle/2.0|tier:RULE_DERIVED|gate:operator-git-PR";

  test("a pure bundle:<slug> delta is the shared-resolve case (true)", () => {
    expect(sameSeedExceptBundle("bundle:A|" + base.split("|").slice(1).join("|"), "bundle:B|" + base.split("|").slice(1).join("|"))).toBe(true);
  });

  test("byte-equal lines are the trivial same-seed case (true — the guard short-circuits them earlier)", () => {
    expect(sameSeedExceptBundle(base, base)).toBe(true);
  });

  test("a src-ref delta still refuses (the drift guard holds)", () => {
    const other = base.replace("0fe5f77210f74aaeb3f6c491dfe0263d12db738c", "75755855f9e24391edb244f03993cc649bdf4e7a");
    expect(sameSeedExceptBundle(other, base)).toBe(false);
  });

  test("a schema/tier delta refuses, segment-count delta refuses, null refuses", () => {
    expect(sameSeedExceptBundle(base.replace("RULE_DERIVED", "OPERATOR"), base)).toBe(false);
    expect(sameSeedExceptBundle(base + "|extra", base)).toBe(false);
    expect(sameSeedExceptBundle(null, base)).toBe(false);
    // no bundle segment on either side, byte-equal = the trivial same-seed case
    expect(sameSeedExceptBundle("src:X@1|schema:s", "src:X@1|schema:s")).toBe(true);
    // a bundle-segment delta requires a bundle segment on BOTH sides
    expect(sameSeedExceptBundle("bundle:A|src:X@1|schema:s", "src:X@1|schema:s")).toBe(false);
  });

  test("REAL cross-bank 9709 pair: the sibling joins ONLY the version-scoped root; the tail-based UNITs stay disjoint (the graft class is structurally gone — optionA)", async () => {
    const load = (slug: string) =>
      JSON.parse(
        readFileSync(join(import.meta.dir, "../../../hub/content/" + slug + "/curriculum.json"), "utf8"),
      ) as BundleCurriculum;
    const mechanics = load("cie-a-level-maths-20-mechanics");
    const pure1 = load("cie-a-level-maths-20-pure-1");
    const src = (slug: string) => ({
      slug, importRepo: "SyllabAI/syllabai-resources",
      importRef: "0fe5f77210f74aaeb3f6c491dfe0263d12db738c",
      schema: "syllabai-demo.content-bundle/2.0",
    });

    const store = newStore();
    const first = await seedBundleCurriculum(seedDeps(store), mechanics, src("cie-a-level-maths-20-mechanics"), ACTIVATOR);
    expect(first.nodesCreated).toBe(mechanics.nodes.length);
    // the optionA identities of record: the version-scoped root + mechanics'
    // own tail-based UNIT (official T4 tail) — the pre-optionA order law
    // landed BOTH banks on 9709-S1 (the graft)
    expect(store.nodes.has("9709-2023-2025")).toBe(true);
    expect(store.nodes.has("9709-2023-2025-S4")).toBe(true);
    expect(store.nodes.has("9709-S1")).toBe(false);

    // the sibling bank: joins the shared version-scoped root ONLY — its own
    // UNIT comes from its own official tail (T1), never the first bank's node
    const second = await seedBundleCurriculum(seedDeps(store), pure1, src("cie-a-level-maths-20-pure-1"), ACTIVATOR);
    expect(second.nodesReused).toBe(1); // 9709-2023-2025 (the root)
    expect(second.nodesCreated).toBe(pure1.nodes.length - 1);
    expect(second.edgesReused).toBe(0);
    expect(second.edgesCreated).toBe(pure1.edges.length);
    expect(second.alreadyActive).toBe(false);
    // the sibling's own tail-based UNIT, disjoint from mechanics'
    expect(store.nodes.has("9709-2023-2025-S1")).toBe(true);
    // the shared root keeps the FIRST bank's provenance (never re-seeded over)
    expect(store.nodes.get("9709-2023-2025")!.provenance).toBe(bundleProvenance(src("cie-a-level-maths-20-mechanics")));
    // the banks' own trees are component-scoped and version-scoped
    expect(store.nodes.has("9709-2023-2025-1.1.1")).toBe(true);
    expect(store.nodes.has("9709-2023-2025-4.1.1")).toBe(true);

    // idempotency across BOTH banks on re-run (the structural no-op holds)
    const again = await seedBundleCurriculum(seedDeps(store), mechanics, src("cie-a-level-maths-20-mechanics"), ACTIVATOR);
    expect(again.nodesCreated).toBe(0);
    expect(again.alreadyActive).toBe(true);
    const again2 = await seedBundleCurriculum(seedDeps(store), pure1, src("cie-a-level-maths-20-pure-1"), ACTIVATOR);
    expect(again2.nodesCreated).toBe(0);
    expect(again2.alreadyActive).toBe(true);
  });

  test("a src-ref change on the SAME bundle still conflicts (never re-seed over it)", async () => {
    const store = newStore();
    await seedBundleCurriculum(seedDeps(store), bundle, SOURCE, ACTIVATOR);
    const drifted = { ...SOURCE, importRef: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" };
    expect(() => seedBundleCurriculum(seedDeps(store), bundle, drifted, ACTIVATOR)).toThrow(
      /already exists with different provenance/,
    );
  });
});

describe("run-002 repair — the dbCode shape widenings (synthetic CIE mini-bundles)", () => {
  const CIEnode = (family: string, code: string, parents: string[], order: number) => ({
    family, code, title: code, description: null, parents, provenanceTier: "RULE_DERIVED", order, applicability: null,
  });
  const miniBundle = (slug: string, code: string, extra: Array<ReturnType<typeof CIEnode>>) => ({
    board: "Cambridge International",
    level: "IGCSE",
    subject: "Mini (" + code + ")",
    code,
    syllabusVersion: "2025-2027",
    nodes: [
      CIEnode("SUBJECT", slug, [], 1),
      CIEnode("TOPIC", code + "-TE1", [slug], 1),
      ...extra,
    ],
    edges: [
      { source: slug, target: code + "-TE1", relation: "PART_OF", provenanceTier: "RULE_DERIVED" },
      ...extra.map((n) => ({ source: n.parents[0]!, target: n.code, relation: "PART_OF", provenanceTier: "RULE_DERIVED" })),
    ],
  }) as BundleCurriculum;
  const cieSource = (slug: string) => ({
    slug, importRepo: "SyllabAI/syllabai-resources",
    importRef: "0fe5f77210f74aaeb3f6c491dfe0263d12db738c",
    schema: "syllabai-demo.content-bundle/2.0",
  });

  test("FOURTH shape: the letter-prefixed :SUB tail lands the tail-based UNIT + sub verbatim (optionA law)", () => {
    const b = miniBundle("cie-mini-letter", "X101", [
      CIEnode("SUBTOPIC", "X101-TE1:SUBE1.1", ["X101-TE1"], 1),
    ]);
    const mapped = mapBundleNodes(b, "prefix");
    // the optionA laws: the version-scoped namespace + the official -T tail
    expect(mapped.get("X101-TE1")!.dbCode).toBe("X101-2025-2027-SE1");
    expect(mapped.get("X101-TE1")!.nodeType).toBe("UNIT");
    expect(mapped.get("X101-TE1:SUBE1.1")!.dbCode).toBe("X101-2025-2027-SE1-E1.1");
    expect(mapped.get("X101-TE1:SUBE1.1")!.nodeType).toBe("TOPIC");
  });

  test("FIFTH shape: the letter-prefixed unit.seq SPEC_POINT lands <ns>-S1.001 verbatim (0500/0470/8021 law)", () => {
    const b = miniBundle("cie-mini-sp", "X102", [
      CIEnode("SUBTOPIC", "X102-TE1:SUB_", ["X102-TE1"], 1),
      CIEnode("SPEC_POINT", "S1.001", ["X102-TE1:SUB_"], 1),
      CIEnode("SPEC_POINT", "S1.002", ["X102-TE1:SUB_"], 2),
    ]);
    const mapped = mapBundleNodes(b, "prefix");
    expect(mapped.get("S1.001")!.dbCode).toBe("X102-2025-2027-S1.001");
    expect(mapped.get("S1.001")!.nodeType).toBe("SPEC_POINT");
    expect(mapped.get("S1.002")!.dbCode).toBe("X102-2025-2027-S1.002");
  });

  test("the widened shapes seed through the store law end-to-end and stay idempotent", async () => {
    const b = miniBundle("cie-mini-seed", "X103", [
      CIEnode("SUBTOPIC", "X103-TE1:SUBC1.1", ["X103-TE1"], 1),
      CIEnode("SPEC_POINT", "S1.001", ["X103-TE1:SUBC1.1"], 1),
    ]);
    const store = newStore();
    const summary = await seedBundleCurriculum(seedDeps(store), b, cieSource("cie-mini-seed"), ACTIVATOR);
    // 1 subject + 1 unit + 1 topic + 1 spec point
    expect(summary.nodesCreated).toBe(4);
    expect(summary.edgesCreated).toBe(3);
    expect(store.nodes.has("X103-2025-2027-SE1-C1.1")).toBe(true);
    expect(store.nodes.has("X103-2025-2027-S1.001")).toBe(true);
    // the version-scoped root of record (the optionA namespace law)
    expect(store.nodes.has("X103-2025-2027")).toBe(true);
    // the board-aware title rider: a Cambridge qualification carries the
    // board's own family name (never the Pearson string)
    expect(store.nodes.get("X103-2025-2027")!.title).toBe("Mini (X103) (X103)");
    const again = await seedBundleCurriculum(seedDeps(store), b, cieSource("cie-mini-seed"), ACTIVATOR);
    expect(again.nodesCreated).toBe(0);
    expect(again.alreadyActive).toBe(true);
  });

  test("the Edexcel title path stays byte-identical (the 134a Pearson string verbatim)", () => {
    const mapped = mapBundleNodes(bundle, "4PH1 official specification structure");
    expect(mapped.get("igcse-physics-19")!.description).toBe(
      "Pearson Edexcel International GCSE (9-1) Physics (4PH1, 2017 specification)",
    );
  });
});

describe("ruling A — the optionA identity laws (trace 1a15b161bf960249)", () => {
  const load = (slug: string) =>
    JSON.parse(
      readFileSync(join(import.meta.dir, "../../../hub/content/" + slug + "/curriculum.json"), "utf8"),
    ) as BundleCurriculum;

  test("the tail-based UNIT law on the REAL fleet grammars (the of-record tails, fail-closed)", () => {
    // 9709: six banks, one TOPIC each, official tails T1..T6 -> S1..S6 disjoint
    expect(mapBundleNodes(load("cie-a-level-maths-20-pure-1"), "p").get("cie-a-level-maths-2023-2025-T1")!.dbCode).toBe("9709-2023-2025-S1");
    expect(mapBundleNodes(load("cie-a-level-maths-20-pure-3"), "p").get("cie-a-level-maths-2023-2025-T3")!.dbCode).toBe("9709-2023-2025-S3");
    expect(mapBundleNodes(load("cie-a-level-maths-20-mechanics"), "p").get("cie-a-level-maths-2023-2025-T4")!.dbCode).toBe("9709-2023-2025-S4");
    // 0653: the component-scoped trio vocabularies -> SB/SC/SP (the order law collided all three)
    expect(mapBundleNodes(load("cie-igcse-science-combined-science-23-biology"), "p").get("cie-igcse-science-combined-science-2023-2024-TB1")!.dbCode).toBe("0653-2023-2024-SB1");
    expect(mapBundleNodes(load("cie-igcse-science-combined-science-23-chemistry"), "p").get("cie-igcse-science-combined-science-2023-2024-TC1")!.dbCode).toBe("0653-2023-2024-SC1");
    expect(mapBundleNodes(load("cie-igcse-science-combined-science-23-physics"), "p").get("cie-igcse-science-combined-science-2023-2024-TP1")!.dbCode).toBe("0653-2023-2024-SP1");
    // 0580: core/extended official C/E sections -> SC/SE disjoint
    expect(mapBundleNodes(load("cie-igcse-maths-25-core"), "p").get("cie-igcse-maths-2025-2027-TC1")!.dbCode).toBe("0580-2025-2027-SC1");
    expect(mapBundleNodes(load("cie-igcse-maths-25-extended"), "p").get("cie-igcse-maths-2025-2027-TE1")!.dbCode).toBe("0580-2025-2027-SE1");
    // 0500: the syllabus's own S-prefixed sections land SS (mechanical, official)
    expect(mapBundleNodes(load("cie-igcse-english-language-20"), "p").get("cie-igcse-english-language-2024-2026-TS1")!.dbCode).toBe("0500-2024-2026-SS1");
    // 0452: plain digit tails
    expect(mapBundleNodes(load("cie-igcse-accounting-21"), "p").get("cie-igcse-accounting-2023-2025-T1")!.dbCode).toBe("0452-2023-2025-S1");
  });

  test("the version-scoped namespace splits the cross-version pairs (the 0452 class)", () => {
    // the SAME spec string under two bundle generations lands in TWO disjoint namespaces
    const a21 = mapBundleNodes(load("cie-igcse-accounting-21"), "p");
    const a25 = mapBundleNodes(load("cie-igcse-accounting-25"), "p");
    expect(a21.get("cie-igcse-accounting-2023-2025-T1")!.dbCode).toBe("0452-2023-2025-S1");
    expect(a25.get("cie-igcse-accounting-2027-2029-T1")!.dbCode).toBe("0452-2027-2029-S1");
    // the version-scoped root carries the generation (the curriculumCode symmetry)
    expect(a21.get("cie-igcse-accounting-21")!.dbCode).toBe("0452-2023-2025");
    expect(a25.get("cie-igcse-accounting-25")!.dbCode).toBe("0452-2027-2029");
  });

  test("the sixth spec shape: the official trailing variant letter lands verbatim (the run-003 latent class)", () => {
    // 462 points across 7 banks carry 'C4.1.1a' / 'P1.5.1b' — the pre-optionA
    // law refused them mid-fleet; the optionA census caught the class
    const core = mapBundleNodes(load("cie-igcse-maths-25-core"), "p");
    expect(core.get("C4.1.1a")!.dbCode).toBe("0580-2025-2027-C4.1.1a");
    expect(core.get("C4.1.1a")!.nodeType).toBe("SPEC_POINT");
    const phys = mapBundleNodes(load("cie-igcse-science-combined-science-23-physics"), "p");
    expect(phys.get("P3.3.1a")!.dbCode).toBe("0653-2023-2024-P3.3.1a");
  });

  test("a CIE TOPIC without the official -T tail refuses (never derive a UNIT identity from order)", () => {
    const b = load("cie-a-level-maths-20-pure-1");
    const drifted = {
      ...b,
      nodes: b.nodes.map((n) =>
        n.family === "TOPIC" ? { ...n, code: "cie-a-level-maths-2023-2025-SECTION-ONE" } : n,
      ),
    } as BundleCurriculum;
    expect(() => mapBundleNodes(drifted, "p")).toThrow(/does not carry the official -T tail/);
  });

  test("the title-drift refusal: a shared dbCode whose titles disagree is tree drift (honest red)", async () => {
    const mk = (slug: string, subject: string) => ({
      board: "Cambridge International",
      level: "IGCSE",
      subject,
      code: "X900",
      syllabusVersion: "2025-2027",
      nodes: [
        { family: "SUBJECT", code: slug, title: subject + " (X900)", description: null, parents: [], provenanceTier: "RULE_DERIVED", order: 1, applicability: null },
        { family: "TOPIC", code: "X900-TE1", title: "Number", description: null, parents: [slug], provenanceTier: "RULE_DERIVED", order: 1, applicability: null },
      ],
      edges: [
        { source: slug, target: "X900-TE1", relation: "PART_OF", provenanceTier: "RULE_DERIVED" },
      ],
    }) as BundleCurriculum;
    const src = (slug: string) => ({
      slug, importRepo: "SyllabAI/syllabai-resources",
      importRef: "0fe5f77210f74aaeb3f6c491dfe0263d12db738c",
      schema: "syllabai-demo.content-bundle/2.0",
    });
    const store = newStore();
    await seedBundleCurriculum(seedDeps(store), mk("cie-mini-a", "Alpha"), src("cie-mini-a"), ACTIVATOR);
    // the sibling bank: same code + same version -> the same version-scoped
    // root dbCode, but the subject name (and the mapped root title) differs
    // — the pre-optionA law absorbed this silently; the optionA law refuses
    expect(() =>
      seedBundleCurriculum(seedDeps(store), mk("cie-mini-b", "Beta"), src("cie-mini-b"), ACTIVATOR),
    ).toThrow(/tree drift on a shared code/);
  });

  test("the title-drift refusal holds on the same-bundle re-run path too (store-side drift is drift)", async () => {
    const b = load("cie-a-level-maths-20-pure-1");
    const src = {
      slug: "cie-a-level-maths-20-pure-1", importRepo: "SyllabAI/syllabai-resources",
      importRef: "0fe5f77210f74aaeb3f6c491dfe0263d12db738c",
      schema: "syllabai-demo.content-bundle/2.0",
    };
    const store = newStore();
    await seedBundleCurriculum(seedDeps(store), b, src, ACTIVATOR);
    // a hand-edit under the shared root's code: the re-run refuses (the G3/G5
    // receipt-keyed manual resolution is the only path, never a re-seed over it)
    const root = store.nodes.get("9709-2023-2025")!;
    root.title = "Hand-edited title";
    expect(() => seedBundleCurriculum(seedDeps(store), b, src, ACTIVATOR)).toThrow(/tree drift on a shared code/);
  });

  test("the Edexcel path stays byte-identical under the optionA gate (the order-based UNIT law, the plain namespace)", () => {
    const mapped = mapBundleNodes(bundle, "4PH1 official specification structure");
    expect(mapped.get("igcse-physics-19")!.dbCode).toBe("4PH1");
    const unit = [...mapped.values()].find((m) => m.nodeType === "UNIT")!;
    expect(unit.dbCode).toBe("4PH1-S1");
    const spec = [...mapped.values()].find((m) => m.nodeType === "SPEC_POINT")!;
    expect(spec.dbCode.startsWith("4PH1-")).toBe(true);
    expect(spec.dbCode.includes("2017")).toBe(false);
  });
});

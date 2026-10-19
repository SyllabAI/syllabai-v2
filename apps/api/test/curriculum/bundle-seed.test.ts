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

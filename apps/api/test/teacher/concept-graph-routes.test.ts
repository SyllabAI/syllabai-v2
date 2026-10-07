/**
 * T-MIG-085 route tests (r1c mount band) — the observable HTTP contract of
 * TeacherConceptGraphController (frozen activate :66 / edges :87 @ 6cad6ef)
 * over an IN-MEMORY Hono app wiring the REAL 053-t2 services
 * (services/teacher/concept-edges.ts + concept-seed.ts) over stubbed sql —
 * the T-MIG-079 route-test pattern (test/learner/kg-routes.test.ts).
 *
 * Mounted paths (pinned from the HUB CALLERS — apps/hub/src/lib/api.ts
 * :979-990 conceptGraphActivate()/conceptGraphEdges(); the hub runs
 * against the Java core today so its emitted paths are Java-faithful):
 *   GET  /api/v1/teacher/concept-graph/edges?rootId=
 *   POST /api/v1/teacher/concept-graph/activate
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (teacher.ts conceptGraphEdgesViewSchema / seedSummarySchema —
 * pre-ratified, zero new wire). Laws pinned here:
 *   - authz shell (SecurityConfig :87 /api/v1/teacher/** parity): anonymous
 *     → the Boot 401 body with the request path; a STUDENT → the Boot 403
 *     body — the shell precedes every param law and the transaction;
 *   - the rootId param law: missing → 400 validation_failed "missing
 *     required parameter: rootId" (GlobalExceptionHandler :185-190); a
 *     malformed UUID → 400 bad_request "malformed request" (:167-170) —
 *     both BEFORE any sql;
 *   - the edges read model: 404-first root ("knowledge node not found:
 *     <id>" — the teacher band's kg.ts :57 verbatim), the
 *     concept-graph-teacher/v1 policy marker, the deterministic
 *     relation→source code→target code order;
 *   - the activate seed: 200 (the report-shaped ResponseEntity, NOT a 201 —
 *     the sme.ts :34 precedent) with the real 4CH1 counters (420 nodes /
 *     709 edges fresh; the structural no-op re-run alreadyActive=true);
 *     the frozen @Transactional runs as ONE transaction on the injected
 *     seam (begin → commit, concept-seed.ts :153-156), rolling back on the
 *     loud SeedConflictError (409 "…resolve manually, never re-seed over
 *     it"); activatedBy threads the caller's uuid (the created_by author).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createConceptGraphRouter, type ConceptSeedDeps } from "../../src/routes/knowledgefamily";
import { toErrorResponse } from "../../src/services/identity/errors";
import { conceptGraphEdgesViewSchema, seedSummarySchema } from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";
import type { SqlFn } from "../../src/services/identity/users";

// ── fixed-constant uuids (seed-shaped; replay-stable) ───────────────────────

const ROOT = "ea000000-0000-4000-8000-000000000001"; // 4CH1
const SUBTREE_B = "ea000000-0000-4000-8000-000000000002";
const CONCEPT = "ea000000-0000-4000-8000-000000000006";
const MISCO = "ea000000-0000-4000-8000-000000000007"; // OUTSIDE the subtree
const OUTSIDE_ROOT = "ea000000-0000-4000-8000-000000000012";
const TEACHER = "ee000000-0000-4000-8000-000000000001";

const T0 = new Date("2026-10-01T12:00:00Z");
const CLOCK = { newId: () => "7e571d00-0000-4000-8000-000000000001", now: () => T0 };

// ── /edges fixtures (the concept-graph.test.ts route shapes) ────────────────

const edgeRow = (over: Record<string, unknown>) => ({
  source_node_id: CONCEPT,
  target_node_id: SUBTREE_B,
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

function edgesRoutes(family: Array<Record<string, unknown>>, semantic: Array<Record<string, unknown>>): Route[] {
  return [
    {
      // the root lookup (teacherConceptEdges :92-96)
      match: /select id, code from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: ROOT, code: "4CH1" }],
    },
    {
      // the recursive PART_OF subtree CTE (kg.ts subtreeIds)
      match: /with recursive subtree as/,
      rows: [ROOT, SUBTREE_B].map((id) => ({ id })),
    },
    {
      // kgNode404 (the subtree's own 404-first, kg.ts :52-59)
      match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: ROOT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry" }],
    },
    {
      // the family widening — MISCONCEPTION_OF/REMEDIATED_BY/WRONG_ANSWER_PATTERN
      match: /and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)/,
      rows: family,
    },
    {
      // the semantic edges — non-PART_OF, BOTH endpoints inside the scope
      match: /where e\.relation_type <> 'PART_OF'/,
      rows: semantic,
    },
  ];
}

// ── the seed fixture: the MATERIALIZING store (the concept-graph.test.ts
//    seedRoutes, copied so the route test exercises the TRUE reuse paths) ────

type NodeRow = {
  id: string;
  code: string;
  node_type: string;
  title: string;
  validation_status: string;
  provenance: string | null;
  applicability: Record<string, unknown> | null;
};

type SeedStore = {
  nodes: Map<string, NodeRow>;
  edges: Map<string, string>;
  version: { id: string; status: string } | null;
  subject: { id: string; knowledge_node_id: string | null } | null;
  versionActivated: { v: boolean };
  createdBy: string | null;
};

function freshStore(): SeedStore {
  return {
    nodes: new Map(),
    edges: new Map(),
    version: null,
    subject: null,
    versionActivated: { v: false },
    createdBy: null,
  };
}

function seedRoutes(store: SeedStore): Route[] {
  const uuid = (n: number) => `f2000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
      // the ROOT insert (9-column — no applicability on the root path)
      match: /insert into knowledge_nodes \(id, code, node_type, title, description, validation_status, provenance, created_by, created_at\) values \( \? ::uuid, \? , 'SUBJECT', \? , \? , 'VALIDATED', \? , \? , \? ::timestamptz\)/,
      rows: [],
      rowsFor: (params) => {
        store.nodes.set(String(params[1]), {
          id: String(params[0]),
          code: String(params[1]),
          node_type: "SUBJECT",
          title: String(params[2]),
          validation_status: "VALIDATED",
          provenance: params[4] == null ? null : String(params[4]),
          applicability: null,
        });
        // params[5] = created_by — the activatedBy threading pin
        store.createdBy = String(params[5]);
        return [];
      },
    },
    {
      // the node insert (10-column)
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
        return store.edges.has(key) ? [{ id: uuid(seq++), provenance: store.edges.get(key)! }] : [];
      },
    },
    {
      // resolveSemanticEdge(): the (source, target, relation) identity lookup
      match: /select id, provenance from knowledge_edges where source_node_id = \? ::uuid and target_node_id = \? ::uuid and relation_type = \?/,
      rows: [],
      rowsFor: (params): Array<Record<string, unknown>> => {
        const key = `${params[0]}|${params[1]}|${params[2]}`;
        return store.edges.has(key) ? [{ id: uuid(seq++), provenance: store.edges.get(key)! }] : [];
      },
    },
    {
      // the ATTACH insert ('PART_OF' + null strength are literals)
      match: /insert into knowledge_edges \(id, source_node_id, target_node_id, relation_type, strength, rationale, validation_status, provenance, created_by, created_at\) values \( \? ::uuid, \? ::uuid, \? ::uuid, 'PART_OF', null, \? , \? , \? , \? , \? ::timestamptz\)/,
      rows: [],
      rowsFor: (params) => {
        store.edges.set(`${params[1]}|${params[2]}|PART_OF`, String(params[5]));
        return [];
      },
    },
    {
      // the SEMANTIC insert (relation + confidence bound)
      match: /insert into knowledge_edges \(id, source_node_id, target_node_id, relation_type, strength, rationale, validation_status, provenance, created_by, created_at\) values \( \? ::uuid, \? ::uuid, \? ::uuid, \? , \? , \? , 'VALIDATED', \? , \? , \? ::timestamptz\)/,
      rows: [],
      rowsFor: (params) => {
        store.edges.set(`${params[1]}|${params[2]}|${params[3]}`, String(params[6]));
        return [];
      },
    },
  ];
}

interface SeedDeps {
  edges: { sql: ReturnType<typeof fakeSql>; clock: typeof CLOCK };
  seed: ConceptSeedDeps & { sql: ReturnType<typeof fakeSql> };
  calls: string[];
}

/**
 * The deps WITH the route-owned transaction seam — a recording
 * begin/commit/rollback wrapper around the SAME fakeSql (the sme.ts
 * R-TX shape: unit tests forward the transaction to the base stub, the
 * statements themselves are the pins).
 */
function makeSeedDeps(store: SeedStore): SeedDeps {
  const sql = fakeSql(seedRoutes(store));
  const calls: string[] = [];
  const transaction = async <T>(body: (tx: SqlFn) => Promise<T>): Promise<T> => {
    calls.push("begin");
    try {
      const out = await body(sql);
      calls.push("commit");
      return out;
    } catch (e) {
      calls.push("rollback");
      throw e;
    }
  };
  return {
    edges: { sql, clock: CLOCK },
    seed: { sql, clock: CLOCK, transaction },
    calls,
  };
}

// ── app assembly (mirrors index.ts: auth injection + boundary) ──────────────

type AuthFn = (c: Context) => Record<string, unknown> | null;

const TEACHER_AUTH = {
  email: "teacher@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const STUDENT_AUTH = {
  email: "student@example.edu",
  userId: "00000000-0000-4000-8000-000000000041",
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const anon = () => null;

function makeApp(auth: AuthFn, deps: SeedDeps) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/concept-graph", createConceptGraphRouter(deps));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404 | 409);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return { app, deps };
}

// ── authz shell (SecurityConfig :87 hasAnyRole('TEACHER','ADMIN') parity) ───

describe("authz shell — /api/v1/teacher/concept-graph/**", () => {
  test("anonymous GET /edges: Boot 401 body with the request path — the shell precedes the param law", async () => {
    const { app } = makeApp(anon, makeSeedDeps(freshStore()));
    const res = await app.request(`/api/v1/teacher/concept-graph/edges?rootId=${ROOT}`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/teacher/concept-graph/edges");
    expect(typeof body.timestamp).toBe("string");
  });

  test("anonymous POST /activate: Boot 401 — the seed never starts (no transaction began)", async () => {
    const { app, deps } = makeApp(anon, makeSeedDeps(freshStore()));
    const res = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(res.status).toBe(401);
    expect(deps.calls).toEqual([]);
  });

  test("student GET /edges: Boot 403 Forbidden (hasAnyRole TEACHER,ADMIN)", async () => {
    const { app } = makeApp(() => STUDENT_AUTH, makeSeedDeps(freshStore()));
    const res = await app.request(`/api/v1/teacher/concept-graph/edges?rootId=${ROOT}`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(body.path).toBe("/api/v1/teacher/concept-graph/edges");
  });

  test("student POST /activate: Boot 403 — before any sql or transaction", async () => {
    const { app, deps } = makeApp(() => STUDENT_AUTH, makeSeedDeps(freshStore()));
    const res = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(res.status).toBe(403);
    expect(deps.calls).toEqual([]);
  });
});

// ── GET /edges — the param laws + the read model ────────────────────────────

describe("GET /edges — param law + the semantic read model", () => {
  test("missing rootId: 400 validation_failed 'missing required parameter: rootId' — no sql issued", async () => {
    const { app, deps } = makeApp(() => TEACHER_AUTH, makeSeedDeps(freshStore()));
    const res = await app.request("/api/v1/teacher/concept-graph/edges");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
    expect(deps.edges.sql.queries.length).toBe(0);
  });

  test("malformed rootId: 400 bad_request 'malformed request' — no sql issued", async () => {
    const { app, deps } = makeApp(() => TEACHER_AUTH, makeSeedDeps(freshStore()));
    const res = await app.request("/api/v1/teacher/concept-graph/edges?rootId=not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect(deps.edges.sql.queries.length).toBe(0);
  });

  test("200: schema-valid ConceptGraphEdgesView — the policy marker, the deterministic order", async () => {
    const deps = makeSeedDeps(freshStore());
    // swap in the edges fixtures (the seed store stays for the activate pins)
    const edgeSql = fakeSql(
      edgesRoutes(
        [
          edgeRow({
            source_node_id: MISCO,
            relation_type: "REMEDIATED_BY",
            source_code: "M-Confused-Units",
            source_node_type: "MISCONCEPTION",
          }),
        ],
        [
          edgeRow({ relation_type: "RELATED_TO", source_code: "C-Zeta" }),
          edgeRow({ relation_type: "REMEDIATED_BY", source_code: "M-Units", target_code: "4CH1-S1" }),
          edgeRow({ relation_type: "RELATED_TO", source_code: "C-Alpha", target_code: "4CH1-S1" }),
        ],
      ),
    );
    deps.edges = { sql: edgeSql, clock: CLOCK };
    const { app } = makeApp(() => TEACHER_AUTH, deps);
    const res = await app.request(`/api/v1/teacher/concept-graph/edges?rootId=${ROOT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => conceptGraphEdgesViewSchema.parse(body)).not.toThrow();
    expect(body.rootId).toBe(ROOT);
    expect(body.rootCode).toBe("4CH1");
    expect(body.policy).toBe("concept-graph-teacher/v1");
    const keys = body.edges.map(
      (e: { relation: string; source: { code: string }; target: { code: string } }) =>
        `${e.relation}:${e.source.code}:${e.target.code}`,
    );
    expect(keys).toEqual([...keys].sort()); // relation → source code → target code
    // provenance + rationale REQUIRED on the wire (the T-C11 honesty contract)
    expect(body.edges[0].provenance.length).toBeGreaterThan(0);
  });

  test("unknown root: 404 not_found 'knowledge node not found: {id}' (the teacher band's verbatim shape)", async () => {
    const deps = makeSeedDeps(freshStore());
    deps.edges = {
      sql: fakeSql([{ match: /select id, code from knowledge_nodes where id = \? ::uuid/, rows: [] }]),
      clock: CLOCK,
    };
    const { app } = makeApp(() => TEACHER_AUTH, deps);
    const res = await app.request(`/api/v1/teacher/concept-graph/edges?rootId=${OUTSIDE_ROOT}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`knowledge node not found: ${OUTSIDE_ROOT}`);
  });
});

// ── POST /activate — the transactional seed over HTTP ───────────────────────

describe("POST /activate — the idempotent 4CH1 seed, ONE transaction", () => {
  test("teacher: 200 SeedSummary, schema-valid, the real counters, activatedBy threads created_by", async () => {
    const store = freshStore();
    const { app, deps } = makeApp(() => TEACHER_AUTH, makeSeedDeps(store));
    const res = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => seedSummarySchema.parse(body)).not.toThrow();
    // 1 root + 4 sections + 28 subsections + 182 SPs + 12 practicals + 193 concepts
    expect(body.nodesCreated).toBe(420);
    expect(body.edgesCreated).toBe(709); // structure + 211 anchors + 272 validated semantic
    expect(body.alreadyActive).toBe(false);
    expect(store.versionActivated.v).toBe(true); // the curriculum version lands ACTIVE
    // the transaction ran exactly once, begin → commit
    expect(deps.calls).toEqual(["begin", "commit"]);
    // activatedBy = the caller's uuid — the seed's created_by author
    expect(store.createdBy).toBe(TEACHER);
  });

  test("idempotent re-run: 200 with alreadyActive=true (the structural no-op)", async () => {
    const store = freshStore();
    const { app } = makeApp(() => TEACHER_AUTH, makeSeedDeps(store));
    const first = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(first.status).toBe(200);
    const second = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(() => seedSummarySchema.parse(body)).not.toThrow();
    expect(body.nodesCreated).toBe(0);
    expect(body.edgesCreated).toBe(0);
    expect(body.alreadyActive).toBe(true);
  });

  test("store drift: 409 conflict '…resolve manually, never re-seed over it' — the transaction ROLLED BACK", async () => {
    const store = freshStore();
    store.nodes.set("4CH1", {
      id: ROOT,
      code: "4CH1",
      node_type: "SUBJECT",
      title: "Chemistry (4CH1)",
      validation_status: "VALIDATED",
      provenance: "imported:elsewhere",
      applicability: null,
    });
    const { app, deps } = makeApp(() => TEACHER_AUTH, makeSeedDeps(store));
    const res = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.status).toBe(409);
    expect(body.error).toBe("conflict");
    expect(body.message).toContain("resolve manually, never re-seed over it");
    expect(deps.calls).toEqual(["begin", "rollback"]); // no partial writes
    expect(store.versionActivated.v).toBe(false); // the version never landed ACTIVE
  });
});

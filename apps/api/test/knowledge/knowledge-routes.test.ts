/**
 * T-MIG-084 route tests (r1c mount band) — the observable HTTP contract of
 * KnowledgeController's 4 GETs over /api/v1/knowledge (frozen :17-46 @
 * 6cad6ef), over an IN-MEMORY Hono app wiring the REAL 053-t1 services
 * (services/knowledge/index.ts) over stubbed sql (no Neon) — the
 * T-MIG-079 route-test pattern (test/learner/kg-routes.test.ts).
 *
 * Mounted paths (pinned from the HUB CALLERS — api.ts :485-495 +
 * core-topics.ts :96 + citation-map.ts :76; the hub runs against the Java
 * core today so its emitted paths are Java-faithful):
 *   GET /api/v1/knowledge/nodes/{id}
 *   GET /api/v1/knowledge/nodes/{id}/misconceptions
 *   GET /api/v1/knowledge/nodes/{id}/prerequisites
 *   GET /api/v1/knowledge/nodes/{id}/tree?includeMisconceptions=
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (knowledge.ts nodeViewSchema / prerequisiteViewSchema —
 * pre-ratified, zero new wire) and key-pinned against the frozen DTO
 * records. Error laws pinned here:
 *   - authz shell: anonymous → the Boot 401 body with the request path
 *     (SecurityConfig :91 anyRequest().authenticated() parity — no
 *     specific matcher for the prefix; the shell precedes every param
 *     law), authenticated → 200/404 (no role gate on the spine);
 *   - @PathVariable UUID mismatch → 400 bad_request "malformed request"
 *     (GlobalExceptionHandler :167-170 parity) — BEFORE any sql;
 *   - the 404-first node law: "knowledge node <id> not found" (the
 *     shared NotFoundException :14-16, service-owned);
 *   - the includeMisconceptions param law: optional, default TRUE (the
 *     hub client default api.ts :485); Spring StringToBooleanConverter
 *     vocabulary; a conversion failure → 400 bad_request "malformed
 *     request". The fold side effect is pinned at the sql level: with the
 *     fold ON, the family-edge query is issued; with it OFF (and by
 *     default absent when the service would fold... disclosed: default-true
 *     exercises the SAME fold query) — the explicit false short-circuits
 *     the fold query entirely.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createKnowledgeRouter } from "../../src/routes/knowledgefamily";
import { toErrorResponse } from "../../src/services/identity/errors";
import { nodeViewSchema, prerequisiteViewSchema } from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixed-constant uuids (seed-shaped; replay-stable) ───────────────────────

const SUBJECT = "ea000000-0000-4000-8000-000000000001"; // root 4CH1
const TOPIC = "ea000000-0000-4000-8000-000000000003";
const SUBTOPIC = "ea000000-0000-4000-8000-000000000004";
const MISCONCEPTION = "ea000000-0000-4000-8000-000000000006";
const PREREQ_A = "ea000000-0000-4000-8000-000000000007";
const PREREQ_B = "ea000000-0000-4000-8000-000000000008";
const OUTSIDE = "ea000000-0000-4000-8000-000000000012"; // not a node at all

const NOW = new Date("2026-10-06T08:00:00Z");

// ── fixtures (the knowledge.test.ts route shapes, minimal happy set) ────────

const nodeRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: SUBTOPIC,
  code: "4CH1/1.2",
  node_type: "SUBTOPIC",
  title: "Titration calculations",
  description: null,
  validation_status: "VALIDATED",
  provenance: "seed",
  applicability: { papers: ["1CH1"], tier: "foundation" },
  ...over,
});

const nodeByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
  rows,
});

const nodesByIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const subtreeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? ::uuid union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \) select n\.id from knowledge_nodes n where n\.id in \(select id from subtree\)$/,
  rows,
});

const partOfEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type = 'PART_OF'$/,
  rows,
});

const familyEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability, e\.source_node_id as edge_source_node_id, e\.target_node_id as edge_target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)$/,
  rows,
});

const closureRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /with recursive prereq as \( select e\.target_node_id as node_id, 1 as depth from knowledge_edges e where e\.source_node_id = \? ::uuid and e\.relation_type = 'REQUIRES_PREREQUISITE' union select e\.target_node_id, p\.depth \+ 1 from knowledge_edges e join prereq p on e\.source_node_id = p\.node_id where e\.relation_type = 'REQUIRES_PREREQUISITE' and p\.depth < 10 \) select node_id, max\(depth\) as depth from prereq group by node_id order by depth desc, node_id$/,
  rows,
});

const misconceptionEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = \? ::uuid and e\.relation_type = 'MISCONCEPTION_OF'$/,
  rows,
});

// ── app assembly (mirrors index.ts: auth injection + boundary) ──────────────

type AuthFn = (c: Context) => Record<string, unknown> | null;

const STUDENT = {
  email: "student@example.edu",
  userId: "00000000-0000-4000-8000-000000000041",
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const asStudent = () => STUDENT;
const anon = () => null;

function makeApp(auth: AuthFn, routes: Route[]) {
  const deps = { sql: fakeSql(routes), clock: { newId: () => "7e571d00-0000-4000-8000-000000000001", now: () => NOW } };
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/knowledge", createKnowledgeRouter(deps));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return { app, deps };
}

// ── authz shell (SecurityConfig :91 anyRequest().authenticated() parity) ────

describe("GET /api/v1/knowledge/nodes/{id} — authz shell", () => {
  test("anonymous: Boot 401 body with the request path — the shell precedes every param law", async () => {
    const { app } = makeApp(anon, [nodeByIdRoute([])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBTOPIC}`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(`/api/v1/knowledge/nodes/${SUBTOPIC}`);
    expect(typeof body.timestamp).toBe("string");
  });

  test("anonymous tree call: 401 even before the param law could fire", async () => {
    const { app } = makeApp(anon, [nodeByIdRoute([])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBTOPIC}/tree`);
    expect(res.status).toBe(401);
  });

  test("any authenticated role reads the spine (student 200 — no role gate)", async () => {
    const { app } = makeApp(asStudent, [nodeByIdRoute([nodeRow()])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBTOPIC}`);
    expect(res.status).toBe(200);
  });
});

// ── the UUID path law (400s short-circuit before any query) ─────────────────

describe("GET /api/v1/knowledge/nodes/{id} — the @PathVariable UUID law", () => {
  test("malformed id: 400 bad_request 'malformed request' — no sql issued", async () => {
    const { app, deps } = makeApp(asStudent, []);
    const res = await app.request("/api/v1/knowledge/nodes/kn-1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });

  test("malformed id on the tree leg too (the surface test's kn-1 placeholder is NOT a legal id)", async () => {
    const { app, deps } = makeApp(asStudent, []);
    const res = await app.request("/api/v1/knowledge/nodes/kn-1/tree?includeMisconceptions=true");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });
});

// ── the flat node read + the 404-first law ──────────────────────────────────

describe("GET /nodes/{id} — the flat projection over HTTP", () => {
  test("200: schema-valid NodeView, enum NAMES, applicability verbatim, children []", async () => {
    const { app } = makeApp(asStudent, [nodeByIdRoute([nodeRow()])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBTOPIC}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => nodeViewSchema.parse(body)).not.toThrow();
    expect(body.id).toBe(SUBTOPIC);
    expect(body.code).toBe("4CH1/1.2");
    expect(body.type).toBe("SUBTOPIC");
    expect(body.validationStatus).toBe("VALIDATED");
    expect(body.applicability).toEqual({ papers: ["1CH1"], tier: "foundation" });
    expect(body.children).toEqual([]); // flat — children only in tree views
  });

  test("unknown node: 404 not_found 'knowledge node {id} not found' (the 404-first law)", async () => {
    const { app } = makeApp(asStudent, [nodeByIdRoute([])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${OUTSIDE}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`knowledge node ${OUTSIDE} not found`);
  });
});

// ── the tree + the includeMisconceptions param law ──────────────────────────

describe("GET /nodes/{id}/tree — the subtree + the param law", () => {
  const treeRoutes = (withFamily: boolean): Route[] => [
    nodeByIdRoute([nodeRow({ id: TOPIC, code: "4CH1/1.1", node_type: "TOPIC", title: "Ionic bonding", applicability: null })]),
    subtreeRoute([{ id: TOPIC }]),
    nodesByIdsRoute([nodeRow({ id: TOPIC, code: "4CH1/1.1", node_type: "TOPIC", title: "Ionic bonding", applicability: null })]),
    partOfEdgesRoute([]),
    familyEdgesRoute(
      withFamily
        ? [
            {
              ...nodeRow({
                id: MISCONCEPTION,
                code: "M-INV",
                node_type: "MISCONCEPTION",
                title: "inverts the ratio",
                applicability: null,
                provenance: null,
              }),
              edge_source_node_id: MISCONCEPTION,
              edge_target_node_id: TOPIC,
              source_code: "M-INV",
            },
          ]
        : [],
    ),
  ];

  test("explicit includeMisconceptions=false: 200 schema-valid tree, NO fold query issued", async () => {
    const { app, deps } = makeApp(asStudent, treeRoutes(false));
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree?includeMisconceptions=false`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => nodeViewSchema.parse(body)).not.toThrow();
    expect(body.type).toBe("TOPIC");
    expect(body.children).toEqual([]);
    // the V15 fold query never ran — the explicit false short-circuits it
    const issued = (deps.sql as unknown as { queries: string[] }).queries.join("\n");
    expect(issued).not.toContain("MISCONCEPTION_OF");
  });

  test("includeMisconceptions=true: 200 — the V15 fold attaches misconceptions FLAT", async () => {
    const { app } = makeApp(asStudent, treeRoutes(true));
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree?includeMisconceptions=true`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => nodeViewSchema.parse(body)).not.toThrow();
    expect(body.children.map((c: { code: string }) => c.code)).toEqual(["M-INV"]);
    expect(body.children[0].children).toEqual([]); // attached FLAT, not a subtree member
  });

  test("ABSENT param: default TRUE — the hub client default (api.ts :485), the fold query runs", async () => {
    const { app, deps } = makeApp(asStudent, treeRoutes(true));
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => nodeViewSchema.parse(body)).not.toThrow();
    expect(body.children.map((c: { code: string }) => c.code)).toEqual(["M-INV"]);
    const issued = (deps.sql as unknown as { queries: string[] }).queries.join("\n");
    expect(issued).toContain("MISCONCEPTION_OF"); // the default folds
  });

  test("unparseable includeMisconceptions: 400 bad_request 'malformed request' — no sql issued", async () => {
    const { app, deps } = makeApp(asStudent, []);
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree?includeMisconceptions=maybe`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });
});

// ── the prerequisites closure ────────────────────────────────────────────────

describe("GET /nodes/{id}/prerequisites — the closure over HTTP", () => {
  test("200: schema-valid PrerequisiteView[], deepest first (the remediation walk-back order)", async () => {
    const { app } = makeApp(asStudent, [
      nodeByIdRoute([nodeRow()]),
      closureRoute([
        { node_id: PREREQ_B, depth: 2 },
        { node_id: PREREQ_A, depth: 1 },
      ]),
      nodesByIdsRoute([
        nodeRow({ id: PREREQ_A, code: "4CH1/1.1", title: "Direct prereq" }),
        nodeRow({ id: PREREQ_B, code: "4CH1/0.9", title: "Transitive prereq" }),
      ]),
    ]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBTOPIC}/prerequisites`);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const p of body) expect(() => prerequisiteViewSchema.parse(p)).not.toThrow();
    expect(body.map((p: { code: string; depth: number }) => [p.code, p.depth])).toEqual([
      ["4CH1/0.9", 2],
      ["4CH1/1.1", 1],
    ]);
  });

  test("prerequisites rides the 404-first node law", async () => {
    const { app } = makeApp(asStudent, [nodeByIdRoute([])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${OUTSIDE}/prerequisites`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe(`knowledge node ${OUTSIDE} not found`);
  });
});

// ── the misconceptions read ──────────────────────────────────────────────────

describe("GET /nodes/{id}/misconceptions — the V15 sources over HTTP", () => {
  test("200: schema-valid NodeView[] in edge-query order (pass-through, no ORDER BY upstream)", async () => {
    const { app } = makeApp(asStudent, [
      nodeByIdRoute([nodeRow({ id: TOPIC, node_type: "TOPIC", applicability: null })]),
      misconceptionEdgesRoute([
        nodeRow({ id: MISCONCEPTION, code: "M-INV", node_type: "MISCONCEPTION", applicability: null }),
      ]),
    ]);
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/misconceptions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const m of body) expect(() => nodeViewSchema.parse(m)).not.toThrow();
    expect(body.map((m: { code: string }) => m.code)).toEqual(["M-INV"]);
    expect(body[0].children).toEqual([]); // flat views
  });

  test("unknown topic: 404 not_found (the 404-first law, service-owned)", async () => {
    const { app } = makeApp(asStudent, [nodeByIdRoute([])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${OUTSIDE}/misconceptions`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe(`knowledge node ${OUTSIDE} not found`);
  });
});

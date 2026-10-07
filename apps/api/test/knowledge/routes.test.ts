/**
 * T-MIG-082 tranche-1 route tests (r4b) — the observable HTTP contract of
 * KnowledgeController (@RequestMapping /api/v1/knowledge, frozen :17-46 —
 * 4 GETs: node / tree / prerequisites / misconceptions), over an IN-MEMORY
 * Hono app wiring the REAL T-MIG-053 tranche-1 services (services/
 * knowledge/index.ts) over stubbed sql (no Neon) — the T-MIG-079 route-test
 * pattern; the fixtures mirror test/knowledge/knowledge.test.ts shapes.
 *
 * Pinned laws:
 *   - the authz shell: all four paths answer the Boot 401 body with the
 *     request path for anonymous callers BEFORE any handler work;
 *   - the {id} UUID law: malformed → 400 bad_request "malformed request"
 *     (GlobalExceptionHandler :167-170 MethodArgumentTypeMismatch parity)
 *     with NO sql issued (the 400 short-circuits before the service);
 *   - the includeMisconceptions conversion law (:36-41,
 *     @RequestParam(defaultValue = "false") boolean): absent → false; the
 *     Spring StringToBooleanConverter words true/on/yes/1 and
 *     false/off/no/0 (case-insensitive); anything else → 400 malformed;
 *   - the 404-first node law: "knowledge node {id} not found" (the shared
 *     NotFoundException rendering, KnowledgeGraphService node reads);
 *   - the tree fold: includeMisconceptions=false serves no misconception
 *     children (the family-edges route is never queried); =true folds them
 *     in with the V15 dedupe law;
 *   - the closure order: deepest-first then node id (the CTE's ORDER BY);
 *   - the misconception direction law: source = the misconception, in
 *     pass-through order.
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (knowledge.ts — nodeViewSchema / prerequisiteViewSchema,
 * pre-ratified, zero new wire).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createKnowledgeRouter } from "../../src/routes/knowledge";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  nodeViewSchema,
  prerequisiteViewSchema,
} from "@syllabai/contracts";
import type { KnowledgeDeps } from "../../src/services/knowledge";
import type { SubmitClock } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixed-constant uuids (the knowledge.test.ts fleet, reused verbatim) ─────

const SUBJECT = "ea000000-0000-4000-8000-000000000001";
const TOPIC = "ea000000-0000-4000-8000-000000000003";
const SUBTOPIC = "ea000000-0000-4000-8000-000000000004";
const MISCONCEPTION = "ea000000-0000-4000-8000-000000000006";
const PREREQ_A = "ea000000-0000-4000-8000-000000000007";
const PREREQ_B = "ea000000-0000-4000-8000-000000000008";

const NOW = new Date("2026-10-06T08:00:00Z");
const clock: SubmitClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => NOW,
};
const deps = (routes: Route[]): KnowledgeDeps => ({ sql: fakeSql(routes), clock });

// ── row factories + route shapes (knowledge.test.ts) ─────────────────────────

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

const subtreeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? ::uuid union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \) select n\.id from knowledge_nodes n where n\.id in \(select id from subtree\)$/,
  rows,
});

const nodesByIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
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

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + boundary) ─

type AuthFn = (c: Context) => Record<string, unknown> | null;

function makeApp(auth: AuthFn, routes: Route[]) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/knowledge", createKnowledgeRouter(deps(routes)));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return app;
}

const LEARNER_AUTH = {
  email: "student@example.edu",
  userId: "f1000000-0000-4000-8000-000000000001",
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const asLearner = () => LEARNER_AUTH;
const anon = () => null;

// ── the authz shell ──────────────────────────────────────────────────────────

describe("GET /api/v1/knowledge — authz shell", () => {
  test("anonymous: Boot 401 body with the request path, before any work", async () => {
    const app = makeApp(anon, [nodeByIdRoute([])]);
    for (const path of [
      `/api/v1/knowledge/nodes/${SUBJECT}`,
      `/api/v1/knowledge/nodes/${SUBJECT}/tree`,
      `/api/v1/knowledge/nodes/${SUBJECT}/prerequisites`,
      `/api/v1/knowledge/nodes/${SUBJECT}/misconceptions`,
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe(path);
    }
  });
});

// ── GET /nodes/{id} ──────────────────────────────────────────────────────────

describe("GET /api/v1/knowledge/nodes/{id}", () => {
  test("happy path: the flat node read (200, canonical schema, pinned body)", async () => {
    const app = makeApp(asLearner, [nodeByIdRoute([nodeRow()])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBTOPIC}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(nodeViewSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      id: SUBTOPIC,
      code: "4CH1/1.2",
      type: "SUBTOPIC",
      title: "Titration calculations",
      description: null,
      validationStatus: "VALIDATED",
      provenance: "seed",
      applicability: { papers: ["1CH1"], tier: "foundation" },
      children: [],
    });
  });

  test("malformed UUID → 400 bad_request 'malformed request' with NO sql issued", async () => {
    const app = makeApp(asLearner, []);
    const res = await app.request("/api/v1/knowledge/nodes/not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("unknown node → 404 not_found 'knowledge node {id} not found' (404-first)", async () => {
    const app = makeApp(asLearner, [nodeByIdRoute([])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBJECT}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`knowledge node ${SUBJECT} not found`);
  });
});

// ── GET /nodes/{id}/tree ─────────────────────────────────────────────────────

const treeRoutes = (misconceptionChildren: Array<Record<string, unknown>>) => [
  nodeByIdRoute([nodeRow({ id: TOPIC, code: "4CH1/1.1", node_type: "TOPIC", title: "Ionic bonding", applicability: null })]),
  subtreeRoute([{ id: TOPIC }, { id: SUBTOPIC }]),
  nodesByIdsRoute([
    nodeRow({ id: TOPIC, code: "4CH1/1.1", node_type: "TOPIC", title: "Ionic bonding", applicability: null }),
    nodeRow({ id: SUBTOPIC, code: "4CH1/1.1a", title: "Titration" }),
  ]),
  partOfEdgesRoute([
    { source_node_id: SUBTOPIC, target_node_id: TOPIC, source_code: "4CH1/1.1" },
  ]),
  familyEdgesRoute(misconceptionChildren),
];

describe("GET /api/v1/knowledge/nodes/{id}/tree", () => {
  test("absent param → the defaultValue=false law: no fold, family edges never queried", async () => {
    let familyQueried = 0;
    const routes = treeRoutes([]);
    routes[routes.length - 1] = {
      ...routes[routes.length - 1],
      rowsFor: () => {
        familyQueried++;
        return [];
      },
    } as Route;
    const app = makeApp(asLearner, routes);
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(nodeViewSchema.safeParse(body).success).toBe(true);
    expect(body.children[0].code).toBe("4CH1/1.1a");
    expect(body.children[0].children).toEqual([]);
    expect(familyQueried).toBe(0);
  });

  test("includeMisconceptions=true → the V15 misconception fold (children attach)", async () => {
    const app = makeApp(
      asLearner,
      treeRoutes([
        {
          ...nodeRow({ id: MISCONCEPTION, code: "MSC/1", node_type: "MISCONCEPTION", title: "Inverts the ratio" }),
          edge_source_node_id: MISCONCEPTION,
          edge_target_node_id: SUBTOPIC,
          source_code: "MSC/1",
        },
      ]),
    );
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree?includeMisconceptions=true`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // the misconception attaches under SUBTOPIC (the edge target)
    const sub = body.children[0];
    expect(sub.children.map((c: { code: string }) => c.code)).toContain("MSC/1");
  });

  test("the Spring conversion words: TRUE/On/yes/1 → true; Off/0 → false (case-insensitive)", async () => {
    for (const word of ["TRUE", "On", "yes", "1"]) {
      const app = makeApp(asLearner, treeRoutes([]));
      const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree?includeMisconceptions=${word}`);
      expect(res.status).toBe(200);
    }
    for (const word of ["Off", "NO", "0", "false"]) {
      const app = makeApp(asLearner, treeRoutes([]));
      const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree?includeMisconceptions=${word}`);
      expect(res.status).toBe(200);
    }
  });

  test("includeMisconceptions=maybe → 400 bad_request 'malformed request' (conversion failure)", async () => {
    const app = makeApp(asLearner, treeRoutes([]));
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/tree?includeMisconceptions=maybe`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("malformed UUID → 400 with NO sql issued", async () => {
    const app = makeApp(asLearner, []);
    const res = await app.request("/api/v1/knowledge/nodes/bogus/tree");
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });

  test("unknown root → 404 (the same 404-first law)", async () => {
    const app = makeApp(asLearner, [nodeByIdRoute([])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBJECT}/tree`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`knowledge node ${SUBJECT} not found`);
  });
});

// ── GET /nodes/{id}/prerequisites ────────────────────────────────────────────

describe("GET /api/v1/knowledge/nodes/{id}/prerequisites", () => {
  test("happy path: the closure chain, deepest-first then node id (canonical schema)", async () => {
    const app = makeApp(
      asLearner,
      [
        nodeByIdRoute([nodeRow({ id: SUBTOPIC })]),
        closureRoute([
          { node_id: PREREQ_B, depth: 2 },
          { node_id: PREREQ_A, depth: 1 },
        ]),
        // the closure's follow-up: the node details for the chain (id = any)
        nodesByIdsRoute([
          nodeRow({ id: PREREQ_A, code: "4CH1/0.1", title: "Prior maths" }),
          nodeRow({ id: PREREQ_B, code: "4CH1/0.2", title: "Units" }),
        ]),
      ],
    );
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBTOPIC}/prerequisites`);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const item of body) {
      expect(prerequisiteViewSchema.safeParse(item).success).toBe(true);
    }
    expect(body.map((p: { id: string }) => p.id)).toEqual([PREREQ_B, PREREQ_A]); // depth 2 before 1
    expect(body[0].depth).toBe(2);
    expect(body[0].code).toBe("4CH1/0.2");
  });

  test("unknown node → 404 (the 404-first law fires before the closure)", async () => {
    const app = makeApp(asLearner, [nodeByIdRoute([])]);
    const res = await app.request(`/api/v1/knowledge/nodes/${SUBTOPIC}/prerequisites`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`knowledge node ${SUBTOPIC} not found`);
  });

  test("malformed UUID → 400 with NO sql issued", async () => {
    const app = makeApp(asLearner, []);
    const res = await app.request("/api/v1/knowledge/nodes/xyz/prerequisites");
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });
});

// ── GET /nodes/{id}/misconceptions ───────────────────────────────────────────

describe("GET /api/v1/knowledge/nodes/{id}/misconceptions", () => {
  test("happy path: the MISCONCEPTION_OF family, source = the misconception", async () => {
    const app = makeApp(
      asLearner,
      [
        nodeByIdRoute([nodeRow({ id: TOPIC })]),
        misconceptionEdgesRoute([
          nodeRow({ id: MISCONCEPTION, code: "MSC/2", node_type: "MISCONCEPTION", title: "Adds charges wrong", applicability: null }),
        ]),
      ],
    );
    const res = await app.request(`/api/v1/knowledge/nodes/${TOPIC}/misconceptions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(nodeViewSchema.safeParse(body[0]).success).toBe(true);
    expect(body[0].code).toBe("MSC/2");
  });

  test("malformed UUID → 400 with NO sql issued; unknown → 404", async () => {
    const app = makeApp(asLearner, []);
    expect((await app.request("/api/v1/knowledge/nodes/zzz/misconceptions")).status).toBe(400);
    const app2 = makeApp(asLearner, [nodeByIdRoute([])]);
    const res = await app2.request(`/api/v1/knowledge/nodes/${TOPIC}/misconceptions`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`knowledge node ${TOPIC} not found`);
  });
});

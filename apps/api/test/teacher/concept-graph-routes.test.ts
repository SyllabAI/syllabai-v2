/**
 * T-MIG-082 tranche-A route tests (R0) — the observable HTTP contract of
 * TeacherConceptGraphController (frozen :58-96 @ 6cad6ef), over an IN-MEMORY
 * Hono app wiring the REAL 053-t2 services (concept-seed.ts activateConcept-
 * Graph over the loaded snapshot + concept-edges.ts teacherConceptEdges)
 * through fakeSql. ZERO service edits.
 *
 * Pinned here (the WIRE laws):
 *   - the authz shell: /api/v1/teacher/** requires TEACHER/ADMIN — anonymous
 *     401, authenticated STUDENT 403, BEFORE any param law;
 *   - GET /edges param laws: MISSING rootId → 400 validation_failed "missing
 *     required parameter: rootId"; malformed → 400 bad_request "malformed
 *     request"; NO sql issued on either (the route owns the shape);
 *   - GET /edges happy → 200 with the policy marker "concept-graph-teacher/
 *     v1" and the DETERMINISTIC ORDER (relation, source code, target code)
 *     visible through the wire; PART_OF excluded; the misconception-family
 *     widening sources participate;
 *   - GET /edges unknown root → 404 (message verbatim from the 053 t2 port —
 *     SEE THE FILED DRIFT: the frozen NotFoundException renders "knowledge
 *     node {id} not found" while the port throws "knowledge node not found:
 *     {id}"; no capture pins this 404, the drift is filed on the card for
 *     the review lane, never silently hacked at the route layer);
 *   - POST /activate → 200 (the @ResponseStatus(HttpStatus.OK) law — POST
 *     but NOT 201) with the seed summary; the store-drift conflict → 409
 *     conflict (the frozen ConflictException law, triggered through the
 *     subject-linked-node mismatch).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createConceptGraphRouter, type ConceptGraphDeps } from "../../src/routes/conceptgraph";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, type Route } from "../assessment/helpers";
import type { SubmitClock } from "../../src/services/selfmark";

// ── fixtures ─────────────────────────────────────────────────────────────────

const TEACHER = "ee000000-0000-4000-8000-0000000000c1";
const ROOT = "ea000000-0000-4000-8000-0000000000e1";
const SP1 = "ea000000-0000-4000-8000-0000000000e2"; // spec point
const SP2 = "ea000000-0000-4000-8000-0000000000e3"; // spec point
const MSC1 = "ea000000-0000-4000-8000-0000000000e4"; // misconception, attaches to SP1
const LINKED_BAD = "ea000000-0000-4000-8000-0000000000e9"; // wrong-code linked root

const NOW = new Date("2026-10-06T08:00:00Z");
const clock: SubmitClock = { newId: () => "7e571d00-0000-4000-8000-00000000000c", now: () => NOW };

const rootRow = { id: ROOT, code: "4CH1" };

const edge = (over: Partial<Record<string, unknown>>): Record<string, unknown> => ({
  source_node_id: SP1, target_node_id: SP2, relation_type: "REMEDIATED_BY",
  validation_status: "VALIDATED", provenance: "t-c11:settled", rationale: "r",
  source_code: "4CH1/1.1a", source_title: "Titration", source_node_type: "SUBTOPIC",
  source_validation_status: "VALIDATED",
  target_code: "4CH1/0.1", target_title: "Prior maths", target_node_type: "SUBTOPIC",
  target_validation_status: "VALIDATED",
  ...over,
});

const rootSelect = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, code from knowledge_nodes where id = \? ::uuid$/, rows,
});
const kgNode404Select = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid$/, rows,
});
const subtreeSelect = (rows: Array<Record<string, unknown>>): Route => ({
  match: /with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? ::uuid union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \) select n\.id from knowledge_nodes n where n\.id in \(select id from subtree\)$/,
  rows,
});
const familySelect = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id join knowledge_nodes t on t\.id = e\.target_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)$/,
  rows,
});
const semanticSelect = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id join knowledge_nodes t on t\.id = e\.target_node_id where e\.relation_type <> 'PART_OF' and e\.source_node_id = any\( \? ::uuid\[\]\) and e\.target_node_id = any\( \? ::uuid\[\]\)$/,
  rows,
});

/** the /edges happy fixture — the family widening pulls MSC1 into the scope
 *  (its MISCONCEPTION_OF edge targets SP1), so its REMEDIATED_BY edge to SP2
 *  survives the both-endpoints law. */
function edgesRoutes(semanticRows: Array<Record<string, unknown>>): Route[] {
  return [
    rootSelect([rootRow]),
    kgNode404Select([{ id: ROOT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry" }]),
    subtreeSelect([{ id: ROOT }, { id: SP1 }, { id: SP2 }]),
    familySelect([
      edge({
        source_node_id: MSC1, target_node_id: SP1, relation_type: "MISCONCEPTION_OF",
        source_code: "MSC/1", source_title: "Inverts the ratio", source_node_type: "MISCONCEPTION",
      }),
    ]),
    semanticSelect(semanticRows),
  ];
}

// ── app assembly ─────────────────────────────────────────────────────────────

type AuthFn = (c: Context) => Record<string, unknown> | null;
const asTeacher = () => ({ email: "t@example.edu", userId: TEACHER, roles: ["TEACHER"], tokenVersion: 1 });
const asStudent = () => ({ email: "s@example.edu", userId: TEACHER, roles: ["STUDENT"], tokenVersion: 1 });
const anon = () => null;

function makeApp(auth: AuthFn, routes: Route[]) {
  const deps: ConceptGraphDeps = { sql: fakeSql(routes), clock };
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/concept-graph", createConceptGraphRouter(deps));
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

const base = "/api/v1/teacher/concept-graph";
const authed = { headers: { Authorization: "Bearer x" } };

// ── the pins ─────────────────────────────────────────────────────────────────

describe("concept-graph router — shells and param laws", () => {
  test("anonymous → Boot 401; STUDENT → Boot 403 (TEACHER/ADMIN)", async () => {
    const { app } = makeApp(anon, []);
    const res401 = await app.request(`${base}/edges?rootId=${ROOT}`);
    expect(res401.status).toBe(401);
    expect(await res401.json()).toMatchObject({ status: 401, error: "Unauthorized" });

    const app403 = makeApp(asStudent, []).app;
    const res403 = await app403.request(`${base}/edges?rootId=${ROOT}`, authed);
    expect(res403.status).toBe(403);
    expect(await res403.json()).toMatchObject({ status: 403, error: "Forbidden" });
  });

  test("MISSING rootId → 400 validation_failed verbatim; malformed → 400 bad_request; NO sql issued", async () => {
    const { app, deps } = makeApp(asTeacher, []);
    const missing = await app.request(`${base}/edges`, authed);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      error: "validation_failed", message: "missing required parameter: rootId",
    });
    const malformed = await app.request(`${base}/edges?rootId=zz`, authed);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "bad_request", message: "malformed request" });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });
});

describe("concept-graph router — GET /edges", () => {
  test("happy → 200, the policy marker, and the DETERMINISTIC ORDER (relation → source → target)", async () => {
    // deliberately UNSORTED fixture: the wire must sort by relation, then
    // source code, then target code
    const rows = [
      edge({ source_code: "4CH1/1.1a", target_code: "4CH1/0.1", relation_type: "WRONG_ANSWER_PATTERN" }),
      edge({ source_code: "4CH1/0.1", target_code: "4CH1/1.1a", relation_type: "REMEDIATED_BY" }),
      edge({ source_code: "4CH1/1.1a", target_code: "4CH1/1.1b", relation_type: "REMEDIATED_BY" }),
      edge({
        source_node_id: MSC1, source_code: "MSC/1", source_title: "Inverts the ratio",
        source_node_type: "MISCONCEPTION", target_code: "4CH1/1.1a", target_title: "Titration",
        relation_type: "REMEDIATED_BY",
      }),
    ];
    const { app } = makeApp(asTeacher, edgesRoutes(rows));
    const res = await app.request(`${base}/edges?rootId=${ROOT}`, authed);
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.policy).toBe("concept-graph-teacher/v1");
    expect(view.rootId).toBe(ROOT);
    expect(view.rootCode).toBe("4CH1");
    expect(view.edges.map((e: { relation: string; source: { code: string }; target: { code: string } }) =>
      `${e.relation}:${e.source.code}>${e.target.code}`)).toEqual([
      "REMEDIATED_BY:4CH1/0.1>4CH1/1.1a",
      "REMEDIATED_BY:4CH1/1.1a>4CH1/1.1b",
      "REMEDIATED_BY:MSC/1>4CH1/1.1a", // localeCompare: digits before letters
      "WRONG_ANSWER_PATTERN:4CH1/1.1a>4CH1/0.1",
    ]);
  });

  test("unknown root → 404 (the ported message verbatim — the FILED drift, see header)", async () => {
    const { app } = makeApp(asTeacher, [rootSelect([])]);
    const res = await app.request(`${base}/edges?rootId=${LINKED_BAD}`, authed);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("knowledge node not found: " + LINKED_BAD);
  });
});

describe("concept-graph router — POST /activate", () => {
  test("happy seed over an empty store → 200 (NOT 201) with the snapshot-driven summary", async () => {
    // every SELECT returns empty (fresh store) and every INSERT is a no-op —
    // the REAL seed flow runs end-to-end over the loaded snapshot; the
    // structural counts come from the snapshot, the created counters from
    // the fresh-store path
    const catchAll: Route = { match: /.*/, rows: [] };
    const { app, deps } = makeApp(asTeacher, [catchAll]);
    const res = await app.request(`${base}/activate`, { method: "POST", ...authed });
    expect(res.status).toBe(200);
    const summary = await res.json();
    expect(summary.sections).toBeGreaterThan(0);
    expect(summary.specPoints).toBeGreaterThan(0);
    expect(summary.nodesCreated).toBeGreaterThan(0);
    expect(summary.alreadyActive).toBe(false);
    expect(Object.keys(summary).sort()).toEqual([
      "alreadyActive", "conceptNodes", "curriculumVersionId", "edgesCreated", "edgesReused",
      "nodesCreated", "nodesReused", "practicals", "rootNodeId", "sections", "specPoints",
      "subjectId", "subsections", "validatedSemanticEdges",
    ]);
    // the version lands ACTIVE (:211-213)
    expect((deps.sql as unknown as { queries: string[] }).queries.some((q) => q.startsWith("update curriculum_versions"))).toBe(true);
  });

  test("the store-drift conflict → 409 conflict (the subject-linked-node mismatch law)", async () => {
    const routes: Route[] = [
      // ⚠️ fakeSql takes the FIRST match — the catch-all MUST be LAST
      {
        match: /select id, knowledge_node_id from subjects/,
        rows: [{ id: "f4000000-0000-4000-8000-000000000001", knowledge_node_id: LINKED_BAD }],
      },
      {
        match: /select id, code, node_type, title, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
        rows: [{ id: LINKED_BAD, code: "NOT-4CH1", node_type: "SUBJECT", title: "?", validation_status: "VALIDATED", provenance: "seed", applicability: null }],
      },
      { match: /.*/, rows: [] }, // everything else empty (fresh store)
    ];
    const { app } = makeApp(asTeacher, routes);
    const res = await app.request(`${base}/activate`, { method: "POST", ...authed });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.message).toBe("subject 4CH1 is linked to KG node NOT-4CH1, expected the seed root 4CH1");
  });
});

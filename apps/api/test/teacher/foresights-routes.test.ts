/**
 * T-FORESIGHT-V0-PLAN-1 Stage B route tests — the observable HTTP contract
 * of GET /api/v1/teacher/classes/{classId}/foresights?rootId=&nodeId= over
 * an IN-MEMORY Hono app wiring the REAL Stage A service over stubbed sql
 * (no Neon) — the T-MIG-079 route-test pattern (kg-coverage-routes.test.ts
 * is the harness precedent; foresights.test.ts is the fixture precedent,
 * shapes reused verbatim, never re-declared law).
 *
 * Pinned laws:
 *   - the M5 shells: the path answers the Boot 401 body anon and the Boot
 *     403 body for an authenticated STUDENT (the class-level @PreAuthorize
 *     parity + the SecurityConfig /api/v1/teacher/** rule) BEFORE any work;
 *   - the param laws, with NO sql issued: missing rootId → 400
 *     validation_failed "missing required parameter: rootId"; missing
 *     nodeId → 400 validation_failed "missing required parameter: nodeId";
 *     when BOTH are missing the rootId envelope wins (the frozen signature
 *     order: path params → rootId → nodeId); malformed classId/rootId/
 *     nodeId → 400 bad_request "malformed request";
 *   - the gates THROUGH THE WIRE, service-owned (the route never
 *     re-guesses): unknown class → 404 not_found "class not found";
 *     another teacher's class → 403 forbidden "this class belongs to
 *     another teacher"; target outside the subject subtree → 404 not_found
 *     "curriculum topic in this subject not found: …";
 *   - NO archived-class gate on reads: an ARCHIVED class answers 200 (the
 *     F-072 law — the 409 is a write gate; the coverage PUT above keeps
 *     its own);
 *   - the 200 body is the Stage A view VERBATIM, validated against the
 *     canonical classForesightsViewSchema — C1 headline and C3 disclosure
 *     ride the wire untouched; the asOf is the injected clock anchor
 *     (ADR-031, one anchor through the wire).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeacherClassesKgRouter } from "../../src/routes/teacher-kg";
import { toErrorResponse } from "../../src/services/identity/errors";
import { classForesightsViewSchema } from "@syllabai/contracts";
import type { KnowledgeDeps } from "../../src/services/knowledge";
import type { SubmitClock } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixed-constant uuids (the foresights.test.ts fleet, reused verbatim) ────

const ROOT = "ea000000-0000-4000-8000-000000000001"; // 4CH1 subject root
const SEC = "ea000000-0000-4000-8000-000000000002"; // UNIT
const SUB = "ea000000-0000-4000-8000-000000000003"; // TOPIC
const SP1 = "ea000000-0000-4000-8000-000000000004"; // SUBTOPIC — practiced
const SP2 = "ea000000-0000-4000-8000-000000000005"; // SUBTOPIC — never practiced
const CONCEPT = "ea000000-0000-4000-8000-000000000006"; // anchors to SP1
const MISCO = "ea000000-0000-4000-8000-000000000007"; // folds under SP1
const TGT = "ea000000-0000-4000-8000-000000000008"; // TOPIC b — the target
const OUTSIDE = "ea000000-0000-4000-8000-000000000012"; // not in this subtree

const CLASS_ID = "ec000000-0000-4000-8000-000000000001";
const TEACHER = "ed000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "ed000000-0000-4000-8000-000000000002";

const L1 = "eb000000-0000-4000-8000-000000000001"; // Ada
const L2 = "eb000000-0000-4000-8000-000000000002"; // Ben
const L3 = "eb000000-0000-4000-8000-000000000003"; // Cy
const L4 = "eb000000-0000-4000-8000-000000000004"; // Dee — DISABLED member

const T0 = new Date("2026-10-01T12:00:00Z");
const T0_ISO = "2026-10-01T12:00:00.000Z";
const ELEVEN_D = "2026-09-20T12:00:00Z"; // 11d before the anchor
const FRESH = "2026-09-30T12:00:00Z"; // 1d before the anchor

const clock: SubmitClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => T0,
};
const deps = (routes: Route[]): KnowledgeDeps => ({ sql: fakeSql(routes), clock });

// ── node/row factories (foresights.test.ts shapes) ──────────────────────────

const node = (id: string, code: string, type: string, title: string) => ({
  id,
  code,
  node_type: type,
  title,
  description: null,
  validation_status: "VALIDATED",
  provenance: "spec:4CH1-2017|tier:RULE_DERIVED|gate:operator-git-PR|extract:c09_spec_graph_extract.py",
  applicability: type === "SUBTOPIC" ? { papers: ["1H"] } : null,
});

const treeNodes = [
  node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)"),
  node(SEC, "4CH1-S1", "UNIT", "Section 1"),
  node(SUB, "4CH1-S1-a", "TOPIC", "Topic a"),
  node(SP1, "4CH1-S1-a-1", "SUBTOPIC", "Spec point 1"),
  node(SP2, "4CH1-S1-a-2", "SUBTOPIC", "Spec point 2"),
  node(CONCEPT, "C-Alpha", "CONCEPT", "Alpha concept"),
  node(TGT, "4CH1-S1-b", "TOPIC", "Topic b"),
];

const subtreeIds = [ROOT, SEC, SUB, SP1, SP2, CONCEPT, TGT];

function treeRoutes(): Route[] {
  return [
    {
      // node404 (knowledge/index.ts) — the 404-first root read (8-col single)
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
      rows: [node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)")],
    },
    {
      // kgNode404 (teacher/kg.ts) — the 4-col single read
      match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: ROOT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry (4CH1)" }],
    },
    {
      // the 4-col bulk node fetch (prerequisiteChain + any other)
      match: /select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/,
      rows: treeNodes.map((n) => ({ id: n.id, code: n.code, node_type: n.node_type, title: n.title })),
    },
    {
      // the recursive PART_OF subtree CTE (tree read)
      match: /with recursive subtree as/,
      rows: subtreeIds.map((id) => ({ id })),
    },
    {
      // the subtree node rows (8-col any)
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any/,
      rows: treeNodes,
    },
    {
      // PART_OF children edges (structure)
      match: /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any/,
      rows: [
        { source_node_id: SEC, target_node_id: ROOT, source_code: "4CH1-S1" },
        { source_node_id: SUB, target_node_id: SEC, source_code: "4CH1-S1-a" },
        { source_node_id: SP1, target_node_id: SUB, source_code: "4CH1-S1-a-1" },
        { source_node_id: SP2, target_node_id: SUB, source_code: "4CH1-S1-a-2" },
        { source_node_id: CONCEPT, target_node_id: SP1, source_code: "C-Alpha" },
        { source_node_id: TGT, target_node_id: SEC, source_code: "4CH1-S1-b" },
      ],
    },
    {
      // the V15 misconception-family fold — MISCO attaches under SP1
      match: /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability, e\.source_node_id as edge_source_node_id, e\.target_node_id as edge_target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id/,
      rows: [
        {
          id: MISCO,
          code: "M-Confused-Units",
          node_type: "MISCONCEPTION",
          title: "Units confusion",
          description: null,
          validation_status: "SUGGESTED",
          provenance: CONCEPT,
          applicability: null,
          edge_source_node_id: MISCO,
          edge_target_node_id: SP1,
          source_code: "M-Confused-Units",
        },
      ],
    },
  ];
}

interface Evidence {
  classRow?: Record<string, unknown>;
  members?: string[];
  skills?: Array<Record<string, unknown>>;
  misconceptions?: Array<Record<string, unknown>>;
  closureRows?: Array<{ node_id: string; depth: number }>;
}

function routesFor(e: Evidence): Route[] {
  const classRows =
    e.classRow === undefined
      ? [{ id: CLASS_ID, name: "10A Chemistry", status: "ACTIVE", teacher_id: TEACHER }]
      : [e.classRow];
  return [
    {
      // graphOwnedClass — the F-072 gate verbatim
      match: /select id, name, status, teacher_id from classes where id = \? ::uuid/,
      rows: classRows,
    },
    ...treeRoutes(),
    {
      // memberStudentIds — the class scope source
      match: /select student_id from class_members where class_id = \? ::uuid order by enrolled_at asc/,
      rows: (e.members ?? [L1, L2, L3, L4]).map((id) => ({ student_id: id })),
    },
    {
      // enabledRoster — member ids resolved against accounts, ENABLED only
      match: /select id, display_name, enabled from users where id = any/,
      rows: [
        { id: L1, display_name: "Ada", enabled: true },
        { id: L2, display_name: "Ben", enabled: true },
        { id: L3, display_name: "Cy", enabled: true },
        { id: L4, display_name: "Dee", enabled: false },
      ],
    },
    {
      // Query A — skill_states over roster × (target ∪ chain ∪ anchors)
      match: /from skill_states/,
      rows: e.skills ?? [],
    },
    {
      // Query B — misconception_states over roster × misco-under-direct
      match: /from misconception_states/,
      rows: e.misconceptions ?? [],
    },
    {
      // prerequisiteChain closure override (per-scenario)
      match: /select node_id, max\(depth\) as depth from prereq group by node_id order by depth desc, node_id/,
      rows: e.closureRows ?? [],
    },
    {
      // conceptAnchorsWithin override (per-scenario)
      match: /and s\.node_type = 'CONCEPT'/,
      rows: [],
    },
  ];
}

const skill = (
  learnerId: string,
  nodeId: string,
  mastery: number,
  attempts = 5,
) => ({
  learner_id: learnerId,
  node_id: nodeId,
  mastery,
  attempts,
  correct_count: Math.floor(attempts / 2),
  last_practiced_at: ELEVEN_D,
});

const misco = (learnerId: string, probability: number) => ({
  learner_id: learnerId,
  misconception_node_id: MISCO,
  probability,
  evidence_count: 4,
  last_evidence_at: FRESH,
});

const CHAIN_SP1 = [{ node_id: SP1, depth: 1 }];

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + boundary) ─

type AuthFn = (c: Context) => Record<string, unknown> | null;

function makeApp(auth: AuthFn, routes: Route[]) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/classes", createTeacherClassesKgRouter(deps(routes)));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 403 | 404 | 409);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-01T12:00:00Z" },
      500 as const,
    );
  });
  return app;
}

const foresightsPath = (over: { classId?: string; rootId?: string; nodeId?: string } = {}) => {
  const params = new URLSearchParams();
  if (over.rootId !== undefined) params.set("rootId", over.rootId);
  if (over.nodeId !== undefined) params.set("nodeId", over.nodeId);
  const qs = params.toString();
  return `/api/v1/teacher/classes/${over.classId ?? CLASS_ID}/foresights${qs ? `?${qs}` : ""}`;
};
const happyPath = () => foresightsPath({ rootId: ROOT, nodeId: TGT });

const TEACHER_AUTH = {
  email: "teacher@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const asTeacher = () => TEACHER_AUTH;
const anon = () => null;
const asStudent = () => ({
  email: "student@example.edu",
  userId: L1,
  roles: ["STUDENT"],
  tokenVersion: 1,
});

// ── the laws ─────────────────────────────────────────────────────────────────

describe("foresights route — the M5 shells (before any work)", () => {
  test("anonymous → Boot 401 with the request path, before any sql", async () => {
    const app = makeApp(anon, []);
    const res = await app.request(happyPath());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(`/api/v1/teacher/classes/${CLASS_ID}/foresights`);
  });

  test("authenticated STUDENT → Boot 403 (the class-level @PreAuthorize parity)", async () => {
    const app = makeApp(asStudent, []);
    const res = await app.request(happyPath());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });
});

describe("foresights route — the param laws (NO sql issued)", () => {
  test("missing rootId → 400 validation_failed 'missing required parameter: rootId'", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request(foresightsPath({ nodeId: TGT }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
  });

  test("missing nodeId → 400 validation_failed 'missing required parameter: nodeId'", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request(foresightsPath({ rootId: ROOT }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: nodeId");
  });

  test("both missing → the rootId envelope wins (the frozen signature order)", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request(foresightsPath());
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("missing required parameter: rootId");
  });

  test("malformed classId / rootId / nodeId → 400 bad_request 'malformed request'", async () => {
    const app = makeApp(asTeacher, []);
    for (const path of [
      foresightsPath({ classId: "bogus", rootId: ROOT, nodeId: TGT }),
      foresightsPath({ rootId: "zzz", nodeId: TGT }),
      foresightsPath({ rootId: ROOT, nodeId: "zzz" }),
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("bad_request");
      expect(body.message).toBe("malformed request");
    }
  });
});

describe("foresights route — the gates through the wire (service-owned, F-072 order)", () => {
  test("unknown class → 404 not_found 'class not found'", async () => {
    const missApp = makeApp(asTeacher, [
      {
        match: /select id, name, status, teacher_id from classes where id = \? ::uuid/,
        rows: [],
      },
    ]);
    const res = await missApp.request(happyPath());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("class not found");
  });

  test("another teacher's class → 403 forbidden 'this class belongs to another teacher'", async () => {
    const app = makeApp(
      asTeacher,
      routesFor({
        classRow: {
          id: CLASS_ID,
          name: "10A Chemistry",
          status: "ACTIVE",
          teacher_id: OTHER_TEACHER,
        },
      }),
    );
    const res = await app.request(happyPath());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("this class belongs to another teacher");
  });

  test("target outside the subject subtree → 404 (subject isolation, never a silent hop)", async () => {
    const app = makeApp(asTeacher, routesFor({ closureRows: CHAIN_SP1 }));
    const res = await app.request(foresightsPath({ rootId: ROOT, nodeId: OUTSIDE }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`curriculum topic in this subject not found: ${OUTSIDE}`);
  });

  test("an ARCHIVED class stays readable → 200 (the F-072 law: the 409 is a write gate)", async () => {
    const app = makeApp(
      asTeacher,
      routesFor({
        classRow: {
          id: CLASS_ID,
          name: "10A Chemistry",
          status: "ARCHIVED",
          teacher_id: TEACHER,
        },
        closureRows: CHAIN_SP1,
        skills: [skill(L1, SP1, 0.9), skill(L2, SP1, 0.6)],
      }),
    );
    const res = await app.request(happyPath());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classState).toBe("ASSESSABLE_READY");
  });
});

describe("foresights route — the 200 body is the Stage A view verbatim", () => {
  test("ASSESSABLE_READY through the wire: schema-valid, C1 headline + C3 disclosure untouched, clock-pinned asOf", async () => {
    const app = makeApp(
      asTeacher,
      routesFor({
        closureRows: CHAIN_SP1,
        skills: [skill(L1, SP1, 0.9), skill(L2, SP1, 0.6)],
        misconceptions: [misco(L1, 0.9)],
      }),
    );
    const res = await app.request(happyPath());
    expect(res.status).toBe(200);
    const body = await res.json();
    // the canonical wire schema (pre-ratified Stage A — zero new wire here)
    const parsed = classForesightsViewSchema.parse(body);
    expect(parsed.policy).toBe("foresights/v1");
    expect(parsed.classState).toBe("ASSESSABLE_READY");
    expect(parsed.targetTopic).toEqual({
      nodeId: TGT,
      code: "4CH1-S1-b",
      title: "Topic b",
    });
    expect(parsed.unlockPath).toBeNull();
    // the C1 headline template, byte-exact through the wire
    expect(parsed.headline).toBe(
      "This class looks ready for Topic b: every prerequisite it has practiced sits at DEVELOPING or above.",
    );
    // the C3 disclosure rides the wire (every client renders provenance)
    expect(parsed.disclosure).toContain("A readiness prior — not a measurement of Topic b.");
    // ONE clock anchor through the wire (ADR-031): the injected clock
    expect(parsed.asOf).toBe(T0_ISO);
    expect(parsed.disclosure).toContain(`at ${parsed.asOf}`);
    // the evidence surface: the Stage A view's EXACT top-level shape —
    // the wire invents nothing and drops nothing (no engagement fields)
    const keys = Object.keys(body).sort();
    expect(keys).toEqual([
      "asOf",
      "classId",
      "classReason",
      "classState",
      "contextChain",
      "disclosure",
      "distribution",
      "headline",
      "learners",
      "policy",
      "prerequisites",
      "rootId",
      "targetMeasured",
      "targetTopic",
      "unlockPath",
    ]);
  });

  test("NOT_ASSESSABLE through the wire: the C4 unlockPath names the unmeasured prereq", async () => {
    const app = makeApp(asTeacher, routesFor({ closureRows: [{ node_id: SP2, depth: 1 }] }));
    const res = await app.request(happyPath());
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = classForesightsViewSchema.parse(body);
    expect(parsed.classState).toBe("NOT_ASSESSABLE");
    expect(parsed.classReason).toBe("UNMEASURED_PREREQUISITES");
    expect(parsed.unlockPath).toEqual({
      nodeId: SP2,
      code: "4CH1-S1-a-2",
      title: "Spec point 2",
    });
    expect(parsed.headline).toBe(
      "This cannot be honestly predicted yet: 4CH1-S1-a-2 has no class evidence. Assign 4CH1-S1-a-2 practice to unlock a prediction.",
    );
    // no band fabricated anywhere on the wire
    expect(parsed.prerequisites[0]!.masteryBand).toBe("UNMEASURED");
    expect(parsed.prerequisites[0]!.meanEffectiveMastery).toBeNull();
  });
});

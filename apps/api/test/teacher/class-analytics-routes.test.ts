/**
 * T-CLASS-MOUNT-1 route tests — the observable HTTP contract of the
 * ClassAnalytics family (the T-MIG-053 tranche-2 ROUTES tranche, the lane
 * the CD-A run-001 disclosure called the "hub Class Intelligence dark
 * path"): GET /api/v1/teacher/class/overview?rootId=, /learners?rootId=,
 * /topics/{nodeId}/drill-down?rootId= over an IN-MEMORY Hono app wiring
 * the REAL tranche-2 services over stubbed sql (no Neon) — the
 * foresights-routes.test.ts harness pattern (kg-coverage-routes.test.ts
 * is the ancestor; analytics.test.ts is the fixture precedent, shapes
 * reused verbatim, never re-declared law).
 *
 * Pinned laws:
 *   - the M5 shells: the path answers the Boot 401 body anon and the Boot
 *     403 body for an authenticated STUDENT (the SecurityConfig
 *     /api/v1/teacher/** rule; the router owns its authz internally)
 *     BEFORE any sql;
 *   - the param laws, with NO sql issued: missing rootId → 400
 *     validation_failed "missing required parameter: rootId" ("" behaves
 *     as ABSENT — the Spring non-String binding parity); malformed
 *     rootId → 400 bad_request "malformed request"; the drill-down's
 *     {nodeId} path param binds FIRST (frozen signature order: path
 *     params → query params) — a malformed nodeId wins the envelope over
 *     a missing rootId;
 *   - the service-owned gates THROUGH THE WIRE (the route never
 *     re-guesses): unknown root → 404 not_found "knowledge node <id>
 *     not found" (the tree read's 404-first); a topic outside the
 *     subtree → 404 not_found "curriculum topic in this subject not
 *     found: …" (the §5 hard subject isolation — never a cross-subject
 *     hop);
 *   - the 200 bodies are the tranche-2 views VERBATIM, validated against
 *     the canonical @syllabai/contracts schemas (classOverviewViewSchema /
 *     classLearnerViewSchema / topicDrillDownViewSchema) — zero
 *     route-level reshaping; the recentActivity.windowStart is the ONE
 *     injected clock anchor (ADR-031 through the wire);
 *   - NO class gate of any kind: the surface predates class scoping — the
 *     roster is ALL enabled STUDENTS (no classId param exists to bind);
 *   - determinism: two identical requests return byte-identical bodies.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { createClassAnalyticsRouter } from "../../src/routes/class-analytics";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  classLearnerViewSchema,
  classOverviewViewSchema,
  topicDrillDownViewSchema,
} from "@syllabai/contracts";
import type { AnalyticsDeps } from "../../src/services/teacher/analytics";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixed-constant uuids (the analytics.test.ts fleet, reused verbatim) ──────

const ROOT = "ea000000-0000-4000-8000-000000000001"; // 4CH1 subject root
const SEC = "ea000000-0000-4000-8000-000000000002"; // UNIT
const SUB = "ea000000-0000-4000-8000-000000000003"; // TOPIC
const SP1 = "ea000000-0000-4000-8000-000000000004"; // SUBTOPIC (spec point)
const SP2 = "ea000000-0000-4000-8000-000000000005"; // SUBTOPIC, no evidence
const CONCEPT = "ea000000-0000-4000-8000-000000000006"; // anchors to SP1
const MISCO = "ea000000-0000-4000-8000-000000000007"; // folds under SP1
const UNKNOWN_ROOT = "ea000000-0000-4000-8000-0000000000f0"; // absent node

const L1 = "eb000000-0000-4000-8000-000000000001"; // Ada — measured, weak
const L2 = "eb000000-0000-4000-8000-000000000002"; // Ben — measured, secure
const L3 = "eb000000-0000-4000-8000-000000000003"; // Cy — unmeasured
const PAPER = "ee000000-0000-4000-8000-000000000001";
const Q1 = "ec000000-0000-4000-8000-000000000001";
const TEACHER = "ed000000-0000-4000-8000-0000000000aa";

const T0 = new Date("2026-10-01T12:00:00Z");

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
];

const subtreeIds = [ROOT, SEC, SUB, SP1, SP2, CONCEPT];

function treeRoutes(): Route[] {
  return [
    {
      // node404 (knowledge/index.ts) — the 404-first root read (8-col single),
      // param-aware: an absent id returns ZERO rows → the service 404s
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
      rows: [],
      rowsFor: (params) =>
        params[0] === ROOT ? [node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)")] : [],
    },
    {
      // kgNode404 (teacher/kg.ts) — the 4-col single read
      match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: ROOT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry (4CH1)" }],
    },
    {
      // kg.ts prerequisiteChain node fetch (4-col bulk)
      match: /select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/,
      rows: treeNodes.map((n) => ({ id: n.id, code: n.code, node_type: n.node_type, title: n.title })),
    },
    {
      // the recursive PART_OF subtree CTE
      match: /with recursive subtree as/,
      rows: subtreeIds.map((id) => ({ id })),
    },
    {
      // the subtree node rows (8-col any)
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any/,
      rows: treeNodes,
    },
    {
      // PART_OF children edges (structure) — the concept anchors to SP1
      match: /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any/,
      rows: [
        { source_node_id: SEC, target_node_id: ROOT, source_code: "4CH1-S1" },
        { source_node_id: SUB, target_node_id: SEC, source_code: "4CH1-S1-a" },
        { source_node_id: SP1, target_node_id: SUB, source_code: "4CH1-S1-a-1" },
        { source_node_id: SP2, target_node_id: SUB, source_code: "4CH1-S1-a-2" },
        { source_node_id: CONCEPT, target_node_id: SP1, source_code: "C-Alpha" },
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
  skills?: Array<Record<string, unknown>>;
  misconceptions?: Array<Record<string, unknown>>;
  engagements?: Array<Record<string, unknown>>;
  dueReviews?: Array<Record<string, unknown>>;
  recentAttempts?: Array<Record<string, unknown>>;
  servableCandidates?: Array<Record<string, unknown>>;
  prereqEdges?: Array<Record<string, unknown>>;
  closureRows?: Array<Record<string, unknown>>;
  anchorEdges?: Array<Record<string, unknown>>;
  drillEvidence?: Array<Record<string, unknown>>;
  drillServable?: Array<Record<string, unknown>>;
  users?: Array<Record<string, unknown>>;
  pendingAnswers?: number;
}

function evidenceRoutes(e: Evidence): Route[] {
  return [
    { match: /from skill_states/, rows: e.skills ?? [] },
    { match: /from misconception_states/, rows: e.misconceptions ?? [] },
    { match: /from tutor_topic_engagements/, rows: e.engagements ?? [] },
    { match: /from review_schedules/, rows: e.dueReviews ?? [] },
    {
      match: /select a\.learner_id as learner_id, count\(\*\) as total/,
      rows: e.recentAttempts ?? [],
    },
    { match: /from exam_papers p/, rows: [] },
    {
      // activeWithin candidates (the servable rollup source)
      match: /from questions q\s*where q\.active = true and \(q\.primary_topic_node_id = any/,
      rows: e.servableCandidates ?? [],
    },
    {
      // kg.ts prerequisiteChain closure CTE (node_id, depth) — FIRST match
      match: /select node_id, max\(depth\) as depth from prereq group by node_id order by depth desc, node_id/,
      rows: e.closureRows ?? [],
    },
    {
      // prerequisiteRelations (the t1 exported derivation, re-run CTE)
      match: /where e\.relation_type = 'REQUIRES_PREREQUISITE'/,
      rows: e.prereqEdges ?? [],
    },
    {
      // conceptAnchorsWithin (kg.ts — PART_OF sourced at CONCEPT)
      match: /and s\.node_type = 'CONCEPT'/,
      rows: e.anchorEdges ?? [],
    },
    {
      match: /select count\(\*\) as n from answers a/,
      rows: [{ n: e.pendingAnswers ?? 0 }],
    },
    {
      // activeByTopic candidates (drill-down servable refs)
      match: /from questions q\s*where q\.active = true and \(q\.primary_topic_node_id = \? or exists \( select 1 from question_topics qt where qt\.question_id = q\.id and qt\.node_id = \? \)\) order by q\.difficulty/,
      rows: e.drillServable ?? [],
    },
    {
      // representative evidence (the §5 raw leg)
      match: /select a\.id as attempt_id, a\.learner_id, a\.correct, a\.marks_awarded, a\.marking_state, a\.created_at, q\.id as question_id, q\.external_ref, q\.marks as question_marks from attempts a join questions q on q\.id = a\.question_id where q\.primary_topic_node_id = \? ::uuid or exists/,
      rows: e.drillEvidence ?? [],
    },
    {
      // namesFor / findAllById (affected + evidence names)
      match: /select id, display_name from users where id = any/,
      rows: e.users ?? [],
    },
    { match: /from question_spec_points qsp/, rows: [] },
    { match: /from question_options o/, rows: [] },
    {
      // the enabled STUDENT cohort (findEnabledByRole :25-28)
      match: /from users u\s*join user_roles r on r\.user_id = u\.id\s*where r\.role = 'STUDENT' and u\.enabled = true/,
      rows: e.users ?? [],
    },
  ];
}

const ENGINE = {
  decay: (await import("../../src/services/learner")).LEARNER_ENGINE_PAPER_DEFAULTS.decay,
  bdt: (await import("../../src/services/learner")).LEARNER_ENGINE_PAPER_DEFAULTS.bdt,
  // the frozen CONFIG law (application.yml :88/:91): weak-mastery-ceiling
  // 0.45, min-attempts-for-weakness 2 — the values the frozen production
  // wire runs; the route adds NOTHING on top.
  weakMasteryCeiling: 0.45,
  minAttemptsForWeakness: 2,
};

function makeDeps(e: Evidence): AnalyticsDeps {
  return {
    sql: fakeSql([...treeRoutes(), ...evidenceRoutes(e)]),
    clock: { newId: () => "7e571d00-0000-4000-8000-000000000001", now: () => T0 },
    engine: ENGINE,
  } as AnalyticsDeps;
}

const skill = (learnerId: string, nodeId: string, mastery: number, attempts = 5) => ({
  learner_id: learnerId,
  node_id: nodeId,
  mastery,
  attempts,
  correct_count: Math.floor(attempts / 2),
});

const misco = (learnerId: string, probability: number) => ({
  learner_id: learnerId,
  misconception_node_id: MISCO,
  probability,
  evidence_count: 4,
  last_evidence_at: "2026-09-30T12:00:00Z", // fresh against the T0 anchor
});

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + boundary) ─

type AuthFn = (c: Context) => Record<string, unknown> | null;

function makeApp(auth: AuthFn, e: Evidence) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/class", createClassAnalyticsRouter(makeDeps(e)));
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

const overviewPath = (rootId?: string) =>
  rootId === undefined
    ? "/api/v1/teacher/class/overview"
    : `/api/v1/teacher/class/overview?rootId=${encodeURIComponent(rootId)}`;
const learnersPath = (rootId?: string) =>
  rootId === undefined
    ? "/api/v1/teacher/class/learners"
    : `/api/v1/teacher/class/learners?rootId=${encodeURIComponent(rootId)}`;
const drillPath = (nodeId: string, rootId?: string) =>
  `/api/v1/teacher/class/topics/${nodeId}/drill-down${rootId === undefined ? "" : `?rootId=${encodeURIComponent(rootId)}`}`;

const TEACHER_AUTH = {
  email: "teacher@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const anon = () => null;
const asTeacher = () => TEACHER_AUTH;
const asStudent = () => ({
  email: "student@example.edu",
  userId: L1,
  roles: ["STUDENT"],
  tokenVersion: 1,
});

// ── the laws ─────────────────────────────────────────────────────────────────

describe("class-analytics routes — the M5 shells (before any work)", () => {
  test("anonymous → Boot 401 with the request path, before any sql", async () => {
    const app = makeApp(anon, {});
    const res = await app.request(overviewPath(ROOT));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/teacher/class/overview");
  });

  test("authenticated STUDENT → Boot 403, before any sql (all three paths)", async () => {
    const app = makeApp(asStudent, {});
    for (const path of [overviewPath(ROOT), learnersPath(ROOT), drillPath(SP1, ROOT)]) {
      const res = await app.request(path);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    }
  });
});

describe("class-analytics routes — the query binding laws (no sql issued)", () => {
  test("missing rootId → 400 validation_failed 'missing required parameter: rootId' (overview + learners)", async () => {
    const app = makeApp(asTeacher, {});
    for (const path of [overviewPath(), learnersPath()]) {
      const res = await app.request(path);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("validation_failed");
      expect(body.message).toBe("missing required parameter: rootId");
    }
  });

  test("empty rootId ('') behaves as ABSENT for the non-String param → the same validation_failed envelope", async () => {
    const app = makeApp(asTeacher, {});
    const res = await app.request(overviewPath(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
  });

  test("malformed rootId → 400 bad_request 'malformed request' (all three GETs)", async () => {
    const app = makeApp(asTeacher, {});
    for (const path of [overviewPath("not-a-uuid"), learnersPath("not-a-uuid"), drillPath(SP1, "not-a-uuid")]) {
      const res = await app.request(path);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("bad_request");
      expect(body.message).toBe("malformed request");
    }
  });

  test("the drill-down path param binds FIRST: malformed {nodeId} wins over a missing rootId (frozen signature order)", async () => {
    const app = makeApp(asTeacher, {});
    const res = await app.request(drillPath("not-a-uuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("the drill-down with a valid path param still carries the rootId law", async () => {
    const app = makeApp(asTeacher, {});
    const res = await app.request(drillPath(SP1));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
  });
});

describe("class-analytics routes — the service-owned gates through the wire", () => {
  test("unknown root → 404 not_found 'knowledge node <id> not found' (the tree read's 404-first)", async () => {
    const app = makeApp(asTeacher, {});
    const res = await app.request(overviewPath(UNKNOWN_ROOT));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`knowledge node ${UNKNOWN_ROOT} not found`);
  });

  test("topic outside the subtree → 404 not_found 'curriculum topic in this subject not found: …' (§5 hard isolation)", async () => {
    const app = makeApp(asTeacher, {});
    const res = await app.request(drillPath(MISCO, ROOT));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`curriculum topic in this subject not found: ${MISCO}`);
  });
});

describe("class-analytics routes — the 200 bodies are the tranche-2 views VERBATIM", () => {
  test("overview parses through classOverviewViewSchema; the one clock anchor rides the wire", async () => {
    const app = makeApp(asTeacher, {
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
      ],
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.9)],
      engagements: [
        { learner_id: L1, node_id: SP1, signal_type: "TOPIC_ENGAGEMENT", occurred_at: "2026-09-30T00:00:00Z" },
      ],
      dueReviews: [{ learner_id: L1, node_id: SP1 }],
      recentAttempts: [
        { learner_id: L1, total: 3, correct: 1, last_activity: "2026-09-29T10:00:00Z" },
      ],
      servableCandidates: [
        { id: Q1, external_ref: "Q-1", question_type: "MCQ", stem: "s", marks: 1, difficulty: 2, expected_time_seconds: 60, command_word: null, primary_topic_node_id: SP1, exam_paper_id: PAPER, provenance: null, active: true },
      ],
      pendingAnswers: 2,
    });
    const res = await app.request(overviewPath(ROOT));
    expect(res.status).toBe(200);
    const body = await res.json();
    const v = classOverviewViewSchema.parse(body);
    expect(v.rootId).toBe(ROOT);
    expect(v.rootCode).toBe("4CH1");
    expect(v.policy).toBe("class-analytics/v1");
    expect(v.enrolledLearners).toBe(2);
    expect(v.learnersWithEvidence).toBe(2);
    expect(v.measuredTopics).toBe(1);
    const sp1 = v.topics.find((t) => t.nodeId === SP1)!;
    expect(sp1.meanMastery).toBe(0.55); // round4((0.2+0.9)/2) — the raw stored mean
    expect(sp1.masteryBand).toBe("DEVELOPING"); // the shared learner bands
    expect(v.recentActivity.windowStart).toBe("2026-09-17T12:00:00.000Z"); // 14d before THE anchor
    expect(v.recentActivity.structuredAnswersPendingMarking).toBe(2);
  });

  test("learners parse through classLearnerViewSchema; the frozen attention order rides the wire", async () => {
    const app = makeApp(asTeacher, {
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
        { id: L3, display_name: "Cy", created_at: "2026-01-03T00:00:00Z" },
      ],
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.9)],
      misconceptions: [misco(L1, 0.9)],
    });
    const res = await app.request(learnersPath(ROOT));
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = z.array(classLearnerViewSchema).parse(body);
    expect(rows.map((r) => r.learnerId)).toEqual([L1, L2, L3]); // weakest measured → secure → unmeasured last
    expect(rows[0]!.evidenceState).toBe("MEASURED");
    expect(rows[0]!.activeMisconceptions).toBe(1);
    expect(rows[2]!.evidenceState).toBe("UNMEASURED");
    expect(rows[2]!.meanMastery).toBeNull(); // honest absence, never zero
  });

  test("drill-down parses through topicDrillDownViewSchema; the affected-learner sort + servable hand-off ride the wire", async () => {
    const app = makeApp(asTeacher, {
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
      ],
      skills: [{ ...skill(L1, SP1, 0.2), attempts: 3 }],
      misconceptions: [misco(L1, 0.9), misco(L2, 0.8)],
      drillServable: [
        {
          id: Q1, external_ref: "Q-1", question_type: "MCQ", stem: "s", marks: 1,
          difficulty: 2, expected_time_seconds: 60, command_word: null,
          primary_topic_node_id: SP1, exam_paper_id: null, provenance: null, active: true,
        },
      ],
    });
    const res = await app.request(drillPath(SP1, ROOT));
    expect(res.status).toBe(200);
    const body = await res.json();
    const v = topicDrillDownViewSchema.parse(body);
    expect(v.rootId).toBe(ROOT);
    expect(v.topic.code).toBe("4CH1-S1-a-1");
    expect(v.affectedLearners.length).toBe(2);
    // sort: reason asc is the PLAIN string order (frozen Comparator) —
    // ACTIVE_MISCONCEPTION < LOW_MASTERY_AND_ACTIVE_MISCONCEPTION
    expect(v.affectedLearners[0]!.learnerId).toBe(L2);
    expect(v.affectedLearners[0]!.reason).toBe("ACTIVE_MISCONCEPTION");
    expect(v.affectedLearners[0]!.mastery).toBeNull(); // misconception-only — honest null
    expect(v.affectedLearners[1]!.reason).toBe("LOW_MASTERY_AND_ACTIVE_MISCONCEPTION");
    expect(v.servableQuestions[0]!.externalRef).toBe("Q-1");
  });

  test("determinism: two identical requests return byte-identical bodies", async () => {
    const app = makeApp(asTeacher, {
      users: [{ id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" }],
      skills: [skill(L1, SP1, 0.2)],
    });
    const a = await app.request(overviewPath(ROOT));
    const b = await app.request(overviewPath(ROOT));
    expect(await a.text()).toBe(await b.text());
  });
});

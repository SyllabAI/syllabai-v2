/**
 * T-MIG-034 route tests — the observable HTTP contract of
 * GET /api/v1/teacher/tests/preview and /weakness-options over an
 * IN-MEMORY Hono app (no Neon). Binding envelopes per the frozen handler
 * law and the four standing R6 captures (401 shells + the captured
 * missing-rootId validation_failed envelope). The builder's queries go
 * through stubbed sql; servable serving is duck-typed (the T-MIG-031
 * ServableQuestions class is consumed read-only, its shape is its public
 * method contract).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTestBuilderRouter } from "../../src/routes/testbuilder";
import { buildTestBuilderModule, type ClassAnalyticsPort } from "../../src/services/testbuilder";
import { fakeSql, type Route } from "../assessment/helpers";

const ROOT_ID = "a1000000-0000-4000-8000-000000000001";
const TOPIC_A = "a2000000-0000-4000-8000-00000000000a";
const TOPIC_B = "a2000000-0000-4000-8000-00000000000b";
const TEACHER_ID = "aa645313-5930-4381-91ed-caff67a2f836";

const SUBTREE_MATCH = /with recursive subtree as \(/;
const NODE_MATCH = /select id, code, title from knowledge_nodes where id = \?/;
const VERSIONS_MATCH = /select id, question_id, validation_state from question_versions where question_id = \? order by version desc/;
const SCHEME_MATCH = /select id, validation_state from mark_schemes where question_version_id = \? order by created_at desc limit 1/;
const POINTS_MATCH = /select mp\.ref, mp\.text, mp\.marks, mp\.acceptance_criteria, qp\.label as part_label from mark_points mp left join question_parts qp on qp\.id = mp\.question_part_id where mp\.mark_scheme_id = \? order by mp\.ordering/;
const QT_MATCH = /select node_id, question_id from question_topics where question_id = any\( \? ::uuid\[\]\)/;

function nodeRow(id: string, code: string) {
  return { id, code, title: `Title ${code}` };
}

function sqlStub(extra: Route[] = []) {
  // extra routes FIRST — fakeSql is first-match-wins, so per-test overrides
  // must shadow the defaults
  return fakeSql([
    ...extra,
    { match: NODE_MATCH, rows: [nodeRow(ROOT_ID, "PHYS")] },
    { match: SUBTREE_MATCH, rows: [{ id: ROOT_ID }, { id: TOPIC_A }, { id: TOPIC_B }] },
  ]);
}

function servableStub(byTopic: Record<string, Array<Record<string, unknown>>>) {
  return {
    activeByTopic: async (topic: string) => byTopic[topic] ?? [],
    activeWithin: async (ids: string[]) => ids.flatMap((i) => byTopic[i] ?? []),
  };
}

function qRow(id: string, marks: number, difficulty: number, type = "MCQ_SINGLE") {
  return {
    id,
    externalRef: null,
    type,
    stem: `stem ${id}`,
    marks,
    difficulty,
    expectedTimeSeconds: 60,
    commandWord: null,
    primaryTopicNodeId: TOPIC_A,
    examPaperId: null,
    options: [],
    parts: [],
    specPointCodes: [],
    specPoints: [],
  };
}

const Q1 = "b1000000-0000-4000-8000-000000000001";
const Q2 = "b1000000-0000-4000-8000-000000000002";
const Q3 = "b1000000-0000-4000-8000-000000000003";

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  opts: { analytics?: ClassAnalyticsPort | null; extra?: Route[]; byTopic?: Record<string, Array<Record<string, unknown>>> } = {},
) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const sql = sqlStub(opts.extra ?? []);
  const module = buildTestBuilderModule(sql, opts.analytics === undefined ? null : opts.analytics);
  // duck-typed servable injection (the builder consumes the method contract)
  if (opts.byTopic) {
    (module.builder as unknown as { deps: { servable: unknown } }).deps.servable =
      servableStub(opts.byTopic);
  }
  app.route("/api/v1/teacher/tests", createTestBuilderRouter({ builder: module.builder }));
  return app;
}

const TEACHER = {
  email: "teacher@example.edu",
  userId: TEACHER_ID,
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const LEARNER = { ...TEACHER, roles: ["STUDENT"] };

describe("GET /api/v1/teacher/tests/preview", () => {
  test("unauthenticated -> Boot 401 body (w3-teacher-tests-preview-unauthed-401 shape)", async () => {
    const res = await makeApp(() => null).request(`/api/v1/teacher/tests/preview?rootId=${ROOT_ID}`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/teacher/tests/preview");
  });

  test("learner role -> Boot 403 (hasAnyRole TEACHER,ADMIN — SecurityConfig.java:87)", async () => {
    const res = await makeApp(() => LEARNER).request(`/api/v1/teacher/tests/preview?rootId=${ROOT_ID}`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("Forbidden");
  });

  test("missing rootId -> 400 validation_failed 'missing required parameter: rootId' (captured envelope)", async () => {
    const res = await makeApp(() => TEACHER).request("/api/v1/teacher/tests/preview");
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
    // the captured envelope has no extra keys
    expect(Object.keys(body).sort()).toEqual(["error", "message", "status", "timestamp"]);
  });

  test("non-UUID rootId / non-integer maxQuestions -> 400 bad_request 'malformed request' (type-mismatch law)", async () => {
    const app = makeApp(() => TEACHER);
    const badUuid = await app.request("/api/v1/teacher/tests/preview?rootId=not-a-uuid");
    expect(badUuid.status).toBe(400);
    expect(((await badUuid.json()) as Record<string, unknown>).error).toBe("bad_request");
    const badInt = await app.request(`/api/v1/teacher/tests/preview?rootId=${ROOT_ID}&maxQuestions=abc`);
    expect(badInt.status).toBe(400);
    expect(((await badInt.json()) as Record<string, unknown>).message).toBe("malformed request");
    const badBool = await app.request(`/api/v1/teacher/tests/preview?rootId=${ROOT_ID}&includeAnswers=maybe`);
    expect(badBool.status).toBe(400);
  });

  test("unknown root -> 404 not_found 'knowledge node … not found' (KnowledgeGraphService.node 404 contract)", async () => {
    const sql = fakeSql([
      { match: NODE_MATCH, rows: [] }, // root lookup misses
    ]);
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("syllabai.auth" as never, TEACHER as never);
      await next();
    });
    const module = buildTestBuilderModule(sql, null);
    app.route("/api/v1/teacher/tests", createTestBuilderRouter({ builder: module.builder }));
    const res = await app.request(`/api/v1/teacher/tests/preview?rootId=${ROOT_ID}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`knowledge node ${ROOT_ID} not found`);
  });

  test("assembly: subtree filter, first-wins attribution, difficulty-then-id, coverage counts", async () => {
    const byTopic = {
      [TOPIC_A]: [qRow(Q3, 3, 3), qRow(Q1, 1, 1)],
      [TOPIC_B]: [qRow(Q2, 2, 2), qRow(Q1, 1, 1)], // Q1 again — first topic wins
    };
    const app = makeApp(() => TEACHER, {
      byTopic,
      extra: [{ match: NODE_MATCH, rows: [], rowsFor: (p) => [nodeRow(String(p[0]), "T")] }],
    });
    const res = await app.request(
      `/api/v1/teacher/tests/preview?rootId=${ROOT_ID}&topicNodeIds=${TOPIC_A},${TOPIC_B}`,
    );
    expect(res.status).toBe(200);
    const view = (await res.json()) as {
      questionCount: number;
      totalMarks: number;
      targetMarks: number | null;
      topics: Array<{ topicNodeId: string; servableQuestions: number; code: string | null; title: string | null }>;
      questions: Array<{ id: string; topicCode: string | null; answers: unknown[]; schemeState: string | null }>;
    };
    expect(view.questionCount).toBe(3);
    expect(view.totalMarks).toBe(6);
    expect(view.targetMarks).toBeNull();
    // difficulty-then-id order (Q1 difficulty 1, Q2 2, Q3 3)
    expect(view.questions.map((x) => x.id)).toEqual([Q1, Q2, Q3]);
    // first-wins attribution: Q1 attributed to TOPIC_A
    expect(view.questions[0]!.topicCode).toBe("T");
    // coverage = per-topic availability BEFORE the cap
    expect(view.topics).toEqual([
      { topicNodeId: TOPIC_A, code: "T", title: "Title T", servableQuestions: 2 },
      { topicNodeId: TOPIC_B, code: "T", title: "Title T", servableQuestions: 2 },
    ]);
    // includeAnswers defaults false → no answer key, schemeState null
    expect(view.questions[0]!.answers).toEqual([]);
    expect(view.questions[0]!.schemeState).toBeNull();
  });

  test("answer key: STRUCTURED-only, current version + current scheme, schemeState reported", async () => {
    const structured = qRow(Q1, 4, 1, "STRUCTURED");
    const byTopic = { [TOPIC_A]: [structured] };
    const app = makeApp(() => TEACHER, {
      byTopic,
      extra: [
        { match: NODE_MATCH, rows: [], rowsFor: (p) => [nodeRow(String(p[0]), "T")] },
        {
          match: VERSIONS_MATCH,
          rows: [{ id: "c1000000-0000-4000-8000-000000000001", question_id: Q1, validation_state: "VALIDATED" }],
        },
        {
          match: SCHEME_MATCH,
          rows: [{ id: "d1000000-0000-4000-8000-000000000001", validation_state: "VALIDATED" }],
        },
        {
          match: POINTS_MATCH,
          rows: [
            { ref: "A1", text: "states F=ma", marks: 2, acceptance_criteria: ["equation"], part_label: "a" },
            { ref: null, text: "general point", marks: 2, acceptance_criteria: null, part_label: null },
          ],
        },
      ],
    });
    const res = await app.request(
      `/api/v1/teacher/tests/preview?rootId=${ROOT_ID}&topicNodeIds=${TOPIC_A}&includeAnswers=true`,
    );
    expect(res.status).toBe(200);
    const view = (await res.json()) as { questions: Array<{ answers: Array<Record<string, unknown>>; schemeState: string | null }> };
    expect(view.questions[0]!.schemeState).toBe("VALIDATED");
    expect(view.questions[0]!.answers).toEqual([
      { partLabel: "a", ref: "A1", text: "states F=ma", marks: 2, acceptanceCriteria: ["equation"] },
      { partLabel: null, ref: null, text: "general point", marks: 2, acceptanceCriteria: [] },
    ]);
  });

  test("targetMarks: marks-aware selection with the clamp echoed", async () => {
    const byTopic = {
      [TOPIC_A]: [qRow(Q3, 9, 3), qRow(Q1, 4, 1), qRow(Q2, 4, 2)],
    };
    const app = makeApp(() => TEACHER, {
      byTopic,
      extra: [{ match: NODE_MATCH, rows: [], rowsFor: (p) => [nodeRow(String(p[0]), "T")] }],
    });
    const res = await app.request(
      `/api/v1/teacher/tests/preview?rootId=${ROOT_ID}&topicNodeIds=${TOPIC_A}&targetMarks=8`,
    );
    expect(res.status).toBe(200);
    const view = (await res.json()) as { questionCount: number; totalMarks: number; targetMarks: number | null };
    // greedy 4+4=8 fits exactly; 9 does not
    expect(view.targetMarks).toBe(8);
    expect(view.totalMarks).toBe(8);
    expect(view.questionCount).toBe(2);
  });
});

describe("GET /api/v1/teacher/tests/weakness-options", () => {
  test("missing rootId -> the captured validation_failed envelope (w3-tests-weakness-options-teacher-200)", async () => {
    const res = await makeApp(() => TEACHER).request("/api/v1/teacher/tests/weakness-options");
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
  });

  test("DORMANT analytics port -> 501 not_implemented with the task reference (honest gap)", async () => {
    const res = await makeApp(() => TEACHER).request(`/api/v1/teacher/tests/weakness-options?rootId=${ROOT_ID}`);
    expect(res.status).toBe(501);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("not_implemented");
    expect(String(body.message)).toContain("class analytics dependency not yet ported");
  });

  test("with a synthetic analytics port: reasons, targeting counts, gaps, deterministic order", async () => {
    const analytics: ClassAnalyticsPort = {
      overview: async () => ({
        enrolledLearners: 12,
        learnersWithEvidence: 9,
        topics: [
          {
            nodeId: TOPIC_A, code: "P2.3", title: "Forces",
            learnersMeasured: 9, meanMastery: 0.38, masteryBand: "LOW",
            learnersWithActiveMisconception: 2, activeMisconceptionSignals: 5,
            evidenceBackedAttempts: 40, tutorEngagements: 3, dueReviews: 11,
          },
          {
            nodeId: TOPIC_B, code: "P2.1", title: "Motion",
            learnersMeasured: 0, meanMastery: null, masteryBand: null,
            learnersWithActiveMisconception: 0, activeMisconceptionSignals: 0,
            evidenceBackedAttempts: 7, tutorEngagements: 1, dueReviews: 0,
          },
        ],
        weakPrerequisites: [
          { prerequisiteCode: "P2.1", dependents: [{ nodeId: TOPIC_A }] },
        ],
      }),
    };
    const app = makeApp(() => TEACHER, {
      analytics,
      byTopic: {}, // targeting counts run through the servable boundary (empty)
      extra: [{ match: NODE_MATCH, rows: [], rowsFor: (p) => [nodeRow(String(p[0]), "T")] }],
    });
    const res = await app.request(`/api/v1/teacher/tests/weakness-options?rootId=${ROOT_ID}`);
    expect(res.status).toBe(200);
    const view = (await res.json()) as {
      policy: string;
      weakTopics: Array<{ topicNodeId: string; reasons: string[]; blockedByPrerequisiteCodes: string[]; servableQuestions: number }>;
      coverageGaps: Array<{ topicNodeId: string; servableQuestions: number }>;
      selectionHint: string;
    };
    expect(view.policy).toBe("test-builder-weakness/v1");
    expect(view.weakTopics).toHaveLength(1);
    expect(view.weakTopics[0]!.reasons).toEqual([
      "LOW_MEAN_MASTERY",
      "ACTIVE_MISCONCEPTION_PRESENT",
      "BLOCKED_BY_WEAK_PREREQUISITE",
    ]);
    expect(view.weakTopics[0]!.blockedByPrerequisiteCodes).toEqual(["P2.1"]);
    // TOPIC_B: unmeasured WITH class activity → coverage gap (never claimed
    // weak); 0 servable questions → dropped from the gaps list (honest)
    expect(view.coverageGaps).toEqual([]);
    expect(view.selectionHint).toContain("/api/v1/teacher/tests/preview");
  });
});

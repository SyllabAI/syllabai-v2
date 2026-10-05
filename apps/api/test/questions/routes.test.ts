/**
 * T-MIG-031 tranche-2 route tests — the observable HTTP contract of
 * QuestionController (GET /api/v1/questions, /families, /topics, /{id},
 * /{id}/mark-scheme) over REAL services on stubbed sql (the 032 route-test
 * pattern; the tranche-1 fakeSql helper seam). 200 bodies validated against
 * the CANONICAL T-MIG-018 schemas; error envelopes pinned to the captured
 * Boot 401 + the frozen handler law (malformed-request 400, NotFoundException
 * envelopes verbatim incl. the captured w3-question-unknown-authed-404 body).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createQuestionsRouter } from "../../src/routes/questions";
import { buildQuestionsModule } from "../../src/services/questions";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  markSchemeRevealViewSchema,
  questionFamilyViewSchema,
  questionTopicTaxonomyViewSchema,
  studentQuestionViewSchema,
} from "@syllabai/contracts";
import {
  BY_ID,
  LIST_ALL,
  LIST_BY_TOPIC,
  LIST_WITHIN,
  MCQ_ID,
  MCQ_ROW,
  PART_1_ID,
  PART_2_ID,
  SCHEME_ID,
  SECTION_A_ID,
  STRUCTURED_ID,
  STRUCTURED_ROW,
  TOPIC2_ID,
  TOPIC_ID,
  UNKNOWN_ID,
  VERSION_ID,
  fakeSql,
  servableRoutes,
  type Route,
} from "./helpers";

// subject root for the rootId paths (a PART_OF subtree root that exists)
const ROOT_ID = "30000000-0000-4000-8000-000000000001";
// a version head id for the reveal fixture
const SCHEME_POINTS = [
  { id: "63000000-0000-4000-8000-000000000001", ref: "ai-1", ordering: 1, text: "first point", marks: 2, question_part_id: PART_1_ID },
  { id: "63000000-0000-4000-8000-000000000003", ref: "ai-3", ordering: 1, text: "general note", marks: 1, question_part_id: null },
];

/** Standard extra route table: two servable rows, topic mappings, graph
 * metadata, the PART_OF subtree for ROOT_ID, reveal scheme fixtures. */
function baseRoutes(): Route[] {
  return [
    { match: LIST_ALL, rows: [MCQ_ROW, STRUCTURED_ROW] },
    { match: LIST_BY_TOPIC, rows: [STRUCTURED_ROW] },
    { match: LIST_WITHIN, rows: [MCQ_ROW, STRUCTURED_ROW] },
    { match: BY_ID, rows: [MCQ_ROW], rowsFor: (p) => (p[0] === UNKNOWN_ID ? [] : [MCQ_ROW]) },
    {
      // subtreeIds existence check (404-first) — only ROOT_ID exists
      match: /select id from knowledge_nodes where id = \?/,
      rows: [{ id: ROOT_ID }],
      rowsFor: (p) => (p[0] === ROOT_ID ? [{ id: ROOT_ID }] : []),
    },
    {
      // the recursive PART_OF CTE (scope: ROOT_ID → both topics)
      match: /WITH RECURSIVE subtree/,
      rows: [{ id: ROOT_ID }, { id: TOPIC_ID }, { id: TOPIC2_ID }],
    },
    {
      // taxonomy node metadata (counted topics + their PART_OF parents)
      match: /select id, code, title from knowledge_nodes/,
      rows: [
        { id: TOPIC_ID, code: "T1", title: "States of matter" },
        { id: TOPIC2_ID, code: "T2", title: "Elements, compounds and mixtures" },
        { id: SECTION_A_ID, code: "S1", title: "Section A" },
      ],
    },
    {
      match: /select question_id, node_id from question_topics/,
      rows: [{ question_id: STRUCTURED_ID, node_id: TOPIC2_ID }],
    },
    {
      match: /from knowledge_edges/,
      rows: [{ source_id: TOPIC_ID, target_id: SECTION_A_ID }, { source_id: TOPIC2_ID, target_id: SECTION_A_ID }],
    },
    {
      // reveal: current version head + newest scheme + points + parts
      match: /from question_versions v where v\.question_id = \? order by v\.version desc/,
      rows: [{ id: VERSION_ID, version: 2 }],
    },
    {
      match: /from mark_schemes s/,
      rows: [{ id: SCHEME_ID, validation_state: "VALIDATED" }],
      rowsFor: (p) => (p[0] === VERSION_ID ? [{ id: SCHEME_ID, validation_state: "VALIDATED" }] : []),
    },
    { match: /from mark_points mp/, rows: SCHEME_POINTS },
    {
      match: /from question_parts p/,
      rows: [
        { part_id: PART_1_ID, label: "a", prompt: "part one", command_word: "state", marks: 4, part_ordering: 1 },
        { part_id: PART_2_ID, label: "b", prompt: "part two", command_word: "explain", marks: 2, part_ordering: 2 },
      ],
    },
  ];
}

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  extra: Route[] = [],
  revealPolicy = "VALIDATED_ONLY",
) {
  const sql = fakeSql([...extra, ...baseRoutes(), ...servableRoutes()]);
  const module = buildQuestionsModule(sql, revealPolicy);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/questions", createQuestionsRouter(module));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" }, 500 as const);
  });
  return { app, sql };
}

const STUDENT = { email: "student@example.edu", userId: "aa645313-5930-4381-91ed-caff67a2f836", roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const anon = () => null;

const BASE = "/api/v1/questions";

describe("authz shell (SecurityConfig.java:91 parity)", () => {
  test("unauthed list → 401 Boot body (w3-questions-list-unauthed-401)", async () => {
    const res = await makeApp(anon).app.request(BASE);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(BASE);
    expect(typeof body.timestamp).toBe("string");
  });

  test("unauthed /families, /topics, /:id, /:id/mark-scheme → same 401 shell (captured pins)", async () => {
    const app = makeApp(anon).app;
    for (const path of [`${BASE}/families`, `${BASE}/topics`, `${BASE}/${UNKNOWN_ID}`, `${BASE}/${UNKNOWN_ID}/mark-scheme`]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    }
  });
});

describe("GET / (list :39-51)", () => {
  test("student → 200 canonical StudentQuestionView[] (allActive precedence)", async () => {
    const { app, sql } = makeApp(asStudent);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const body = await res.json();
    const views = studentQuestionViewSchema.array().parse(body);
    expect(views.map((q) => q.id)).toEqual([MCQ_ID, STRUCTURED_ID]);
    expect(sql.queries.some((q) => q.includes("from questions q"))).toBe(true);
  });

  test("topicNodeId precedence → activeByTopic (controller law :42-44)", async () => {
    const { app, sql } = makeApp(asStudent);
    const res = await app.request(`${BASE}?topicNodeId=${TOPIC_ID}`);
    expect(res.status).toBe(200);
    const views = studentQuestionViewSchema.array().parse(await res.json());
    expect(views.map((q) => q.id)).toEqual([STRUCTURED_ID]);
    const listQuery = sql.queries.find((q) => q.includes("from questions q"))!;
    expect(listQuery).toMatch(/q\.primary_topic_node_id = \? or exists/);
  });

  test("rootId precedence → subtreeIds (404-first) then activeWithin (:45-49)", async () => {
    const { app, sql } = makeApp(asStudent);
    const res = await app.request(`${BASE}?rootId=${ROOT_ID}`);
    expect(res.status).toBe(200);
    const views = studentQuestionViewSchema.array().parse(await res.json());
    expect(views.map((q) => q.id)).toEqual([MCQ_ID, STRUCTURED_ID]);
    // the resolver ran (node check + CTE) BEFORE the question list
    const nodeCheck = sql.queries.findIndex((q) => q.includes("from knowledge_nodes where id = ?"));
    const cte = sql.queries.findIndex((q) => q.includes("WITH RECURSIVE subtree"));
    const list = sql.queries.findIndex((q) => q.includes("from questions q"));
    expect(nodeCheck).toBeGreaterThanOrEqual(0);
    expect(cte).toBeGreaterThan(nodeCheck);
    expect(list).toBeGreaterThan(cte);
  });

  test("unparseable topicNodeId → 400 bad_request 'malformed request' (UUID conversion parity)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}?topicNodeId=not-a-uuid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ status: 400, error: "bad_request", message: "malformed request", timestamp: expect.any(String) });
  });

  test("unknown rootId → 404 'knowledge node {uuid} not found', BEFORE any question work", async () => {
    const { app, sql } = makeApp(asStudent);
    const res = await app.request(`${BASE}?rootId=${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`knowledge node ${UNKNOWN_ID} not found`);
    expect(sql.queries.some((q) => q.includes("from questions q"))).toBe(false);
  });
});

describe("GET /families (families :60-70)", () => {
  test("student → 200 canonical QuestionFamilyView[] (whole-question reassembly)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`${BASE}/families`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const families = questionFamilyViewSchema.array().parse(body);
    // SME-corpus families sort FIRST (compareSource: source then qNum);
    // non-corpus rows (null-ref seed MCQ → NON_SME sentinel) serve after.
    // STRUCTURED_ROW keys on the SME base ref — its -p1 suffix stripped;
    // MCQ_ROW (null ref) keys by row id.
    expect(families.map((f) => f.key)).toEqual(["sme-eq-1-1-states-of-matter-q16", MCQ_ID]);
    expect(families[1]).toEqual({
      key: MCQ_ID,
      ref: MCQ_ID, // null-ref fallback to the family key (tranche-1 disclosed pin)
      marks: 1,
      difficulty: 2,
      type: "MCQ",
      multi: false,
      parts: [studentQuestionViewSchema.parse({
        id: MCQ_ID,
        externalRef: null,
        type: "MCQ_SINGLE",
        stem: "  What  is the state symbol? ",
        marks: 1,
        difficulty: 2,
        expectedTimeSeconds: 45,
        commandWord: null,
        primaryTopicNodeId: TOPIC_ID,
        examPaperId: null,
        options: [
          { id: "50000000-0000-4000-8000-00000000000a", label: "A", text: "solid" },
          { id: "50000000-0000-4000-8000-00000000000b", label: "B", text: "liquid" },
        ],
        parts: [],
        specPointCodes: [],
        specPoints: [],
      })],
    });
  });

  test("rootId scoping rides the same 404-first subtree resolver", async () => {
    const { app, sql } = makeApp(asStudent);
    const res = await app.request(`${BASE}/families?rootId=${ROOT_ID}`);
    expect(res.status).toBe(200);
    questionFamilyViewSchema.array().parse(await res.json());
    expect(sql.queries.some((q) => q.includes("WITH RECURSIVE subtree"))).toBe(true);
  });

  test("unparseable rootId → 400 malformed request", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/families?rootId=zzz`);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });
});

describe("GET /topics (topics :79-82)", () => {
  test("student → 200 canonical QuestionTopicTaxonomyView (code-ordered sections)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/topics`);
    expect(res.status).toBe(200);
    const view = questionTopicTaxonomyViewSchema.parse(await res.json());
    expect(view.sections).toHaveLength(1);
    const section = view.sections[0]!;
    expect(section.nodeId).toBe(SECTION_A_ID);
    expect(section.topics.map((t) => t.code)).toEqual(["T1", "T2"]);
    // badge == click invariant: topic questionCount == list length served
    const t1 = section.topics.find((t) => t.code === "T1")!;
    expect(t1.questionCount).toBe(2);
    expect(view.totalDistinctQuestions).toBe(2);
    expect(view.totalDistinctFamilies).toBe(2);
  });

  test("rootId scopes the census; stray topicNodeId is IGNORED (Spring undeclared-param parity)", async () => {
    const { app, sql } = makeApp(asStudent);
    const scoped = await app.request(`${BASE}/topics?rootId=${ROOT_ID}`);
    expect(scoped.status).toBe(200);
    questionTopicTaxonomyViewSchema.parse(await scoped.json());
    expect(sql.queries.some((q) => q.includes("WITH RECURSIVE subtree"))).toBe(true);
    // undeclared param garbage on /topics must NOT 400 (only rootId binds)
    const stray = await app.request(`${BASE}/topics?topicNodeId=not-a-uuid`);
    expect(stray.status).toBe(200);
  });

  test("unknown rootId → 404 'knowledge node …' (unknown roots 404 exactly like list)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/topics?rootId=${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`knowledge node ${UNKNOWN_ID} not found`);
  });
});

describe("GET /:id (get :84-88)", () => {
  test("known question → 200 canonical StudentQuestionView", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/${MCQ_ID}`);
    expect(res.status).toBe(200);
    const view = studentQuestionViewSchema.parse(await res.json());
    expect(view.id).toBe(MCQ_ID);
    expect(view.options).toHaveLength(2);
  });

  test("unknown question → 404 with the CAPTURED envelope (w3-question-unknown-authed-404)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`question ${UNKNOWN_ID} not found`);
    expect(typeof body.timestamp).toBe("string");
  });

  test("unservable question (inactive / blocked-paper / no validated version) → same 404, never 200-empty", async () => {
    const app = makeApp(asStudent, [
      { match: BY_ID, rows: [] }, // override: BY_ID resolves nothing
    ]).app;
    const res = await app.request(`${BASE}/${MCQ_ID}`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`question ${MCQ_ID} not found`);
  });

  test("bad uuid path → 400 bad_request 'malformed request' (MethodArgumentTypeMismatch parity)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/not-a-uuid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });
});

describe("GET /:id/mark-scheme (markScheme :97-102)", () => {
  test("VALIDATED scheme → 200 canonical MarkSchemeRevealView", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/${MCQ_ID}/mark-scheme`);
    expect(res.status).toBe(200);
    const view = markSchemeRevealViewSchema.parse(await res.json());
    expect(view.questionId).toBe(MCQ_ID);
    expect(view.schemeId).toBe(SCHEME_ID);
    expect(view.schemeMarks).toBe(3); // 2 + 1 derived, not a column
    expect(view.parts.map((p) => p.partId)).toEqual([PART_1_ID, PART_2_ID]);
    expect(view.parts[0]!.points.map((p) => p.ref)).toEqual(["ai-1"]);
    expect(view.generalPoints.map((p) => p.ref)).toEqual(["ai-3"]);
  });

  test("policy withholds → 204 EMPTY body (ResponseEntity.noContent parity)", async () => {
    // SUGGESTED scheme under the default VALIDATED_ONLY policy withholds
    const res = await makeApp(
      asStudent,
      [{ match: /from mark_schemes s/, rows: [{ id: SCHEME_ID, validation_state: "SUGGESTED" }] }],
    ).app.request(`${BASE}/${MCQ_ID}/mark-scheme`);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  test("unservable question → 404 BEFORE any scheme lookup (reveal rides the servability gate)", async () => {
    const { app, sql } = makeApp(asStudent, [{ match: BY_ID, rows: [] }]);
    const res = await app.request(`${BASE}/${UNKNOWN_ID}/mark-scheme`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`question ${UNKNOWN_ID} not found`);
    // no version/scheme query was issued
    expect(sql.queries.some((q) => q.includes("from mark_schemes"))).toBe(false);
  });

  test("bad uuid path → 400 malformed request (conversion precedes the handler)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/xyz/mark-scheme`);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });
});

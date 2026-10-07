/**
 * ContentController teacher-methods route tests (T-MIG-088) — the observable
 * HTTP contract of the r4b mount band's content slice, over an IN-MEMORY
 * Hono app that simulates the REAL index.ts mount order: the T-MIG-020
 * teacher-content router FIRST, this lane's teacher-content-methods router
 * AFTER it (no index.ts contact — the operator integrates centrally).
 *
 * What the card's 5 endpoints resolve to at the wire:
 *   GET  /enumerate            → 501 honest seam (THIS lane's new router)
 *   GET  /enumerate/structured → 501 honest seam (THIS lane's new router)
 *   GET  /fetch                → 501 honest seam (THIS lane's new router)
 *   GET  /questions/{id}/topics → 200 REAL service seam — the T-MIG-020
 *        router's handler over the REAL ContentReviewService
 *        (questionTopicRows, the ContentController.java:763-797 port) on
 *        stubbed sql; bodies pinned to topicRowViewSchema.
 *   POST /questions/{id}/topics → 501 honest seam (the T-MIG-020 router's,
 *        owned by its T-MIG-023 filing) — the mapping WRITE exists nowhere
 *        in the services tree, so this lane mounts NO new handler.
 *
 * The 501 WHY (pinned here so it can't silently regress): frozen
 * ContentController.java enumerate/fetch wire truth is un-captured (the
 * 178-case corpus exercises none of this family — r4b census), the hub
 * emits no caller for the three paths, and no service logic or contracts
 * schema for them exists in the tree — a fabricated 200 would invent
 * behaviour.
 *
 * Authz shells (SecurityConfig :87 TEACHER/ADMIN): anonymous → Boot 401,
 * student → Boot 403 — BEFORE every handler, on both routers.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeacherContentRouter } from "../../src/routes/content";
import { createTeacherContentMethodsRouter } from "../../src/routes/teacher-content-methods";
import type { ContentReadApp } from "../../src/services/content";
import { ContentReviewService } from "../../src/services/content/review";
import {
  QuestionReadRepository,
  QuestionTopicReadRepository,
  KnowledgeNodeDisplayRepository,
  QuestionVersionReadRepository,
  MarkSchemeReadRepository,
} from "../../src/services/content/review-repos";
import { ExamPaperRepository } from "../../src/services/content/repositories";
import { toErrorResponse } from "../../src/services/identity/errors";
import { topicRowViewSchema } from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; golden law @ 6cad6ef) ───────────────────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const QUESTION = "40000000-0000-4000-8000-000000000001";
const UNKNOWN_QUESTION = "40000000-0000-4000-8000-0000000000e3";
const NODE_1 = "20000000-0000-4000-8000-000000000001";
const NODE_2 = "20000000-0000-4000-8000-000000000002";

// ── the real seam's SQL shapes (review.ts + review-repos.ts, verbatim) ──────

const questionRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /^select id, primary_topic_node_id from questions where id = \? ::uuid limit 1$/,
  rows,
});

const topicRowsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /^select node_id, is_primary from question_topics where question_id = \? ::uuid$/,
  rows,
});

const nodeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /^select id, code, title from knowledge_nodes where id = \? ::uuid limit 1$/,
  rows,
});

// review-queue v1's three grouped reads (review.ts reviewQueue) — wired so
// the ownership test can drive the T-MIG-020 handler end to end
const emptyQueueRoutes: Route[] = [
  {
    match: /^select id, subject_id, title, paper_code, session_label, board, qualification, validation_state, question_paper_document_id, mark_scheme_document_id, to_char\(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'\) as created_at from exam_papers where validation_state = 'SUGGESTED'$/,
    rows: [],
  },
  {
    match: /^select q.exam_paper_id as paper_id, v.validation_state as state, count\(\*\) as count from question_versions v join questions q on q.id = v.question_id where q.exam_paper_id is not null group by q.exam_paper_id, v.validation_state$/,
    rows: [],
  },
  {
    match: /^select q.exam_paper_id as paper_id, s.validation_state as state, count\(\*\) as count from mark_schemes s join question_versions v on v.id = s.question_version_id join questions q on q.id = v.question_id where q.exam_paper_id is not null group by q.exam_paper_id, s.validation_state$/,
    rows: [],
  },
];

// ── app assembly: the REAL mount order (T-MIG-020 router, then this lane's) ─

type AuthRow = Record<string, unknown> | null;

function makeApp(auth: (c: Context) => AuthRow, routes: Route[]) {
  const sql = fakeSql(routes);
  // the REAL review service over the REAL read repos — only the seams the
  // topics GET exercises are wired; the rest is never touched by this file
  const review = new ContentReviewService({
    questions: new QuestionReadRepository(sql),
    topics: new QuestionTopicReadRepository(sql),
    nodes: new KnowledgeNodeDisplayRepository(sql),
    papers: new ExamPaperRepository(sql),
    versions: new QuestionVersionReadRepository(sql),
    schemes: new MarkSchemeReadRepository(sql),
  } as unknown as ConstructorParameters<typeof ContentReviewService>[0]);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const contentApp = {
    review,
    documents: { findById: async () => null },
  } as unknown as ContentReadApp; // type-honest partial: only `review` is exercised below
  app.route("/api/v1/teacher/content", createTeacherContentRouter(contentApp));
  app.route("/api/v1/teacher/content", createTeacherContentMethodsRouter());
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
  });
  return { app, sql };
}

const asTeacher = (): AuthRow => ({
  email: "t@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
});
const asStudent = (): AuthRow => ({
  email: "s@example.edu",
  userId: "bb000000-0000-4000-8000-000000000001",
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): AuthRow => null;

// ── the three un-captured GETs — honest 501 seams ───────────────────────────

describe("T-MIG-088 honest 501 seams (enumerate / enumerate-structured / fetch)", () => {
  const paths = [
    "/api/v1/teacher/content/enumerate",
    "/api/v1/teacher/content/enumerate/structured",
    "/api/v1/teacher/content/fetch",
  ];

  test("anonymous → Boot 401 body BEFORE the seam (the shell answers first)", async () => {
    const { app } = makeApp(anon, []);
    for (const path of paths) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe(path);
    }
  });

  test("authenticated STUDENT → Boot 403 body on all three paths", async () => {
    const { app } = makeApp(asStudent, []);
    for (const path of paths) {
      const res = await app.request(path);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.status).toBe(403);
      expect(body.error).toBe("Forbidden");
      expect(body.path).toBe(path);
    }
  });

  test("teacher → 501 not_implemented naming the owning capture pass (never a fabricated 200)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    for (const path of paths) {
      const res = await app.request(path);
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.status).toBe(501);
      expect(body.error).toBe("not_implemented");
      expect(body.message).toContain("not yet ported — owned by T-MIG-088 capture pass");
      expect(typeof body.timestamp).toBe("string");
    }
    expect(sql.queries).toHaveLength(0); // the seam never touches persistence
  });

  test("the seams own ONLY their three static paths — the T-MIG-020 surface stays untouched", async () => {
    // /review-queue belongs to the T-MIG-020 router: it must answer from THAT
    // router (200 shape), never from this lane's module
    const { app } = makeApp(asTeacher, emptyQueueRoutes);
    const res = await app.request("/api/v1/teacher/content/review-queue");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ papers: [], suggestedVersions: 0, suggestedSchemes: 0 });
  });
});

// ── the topics pair — seam verification the card asked for ─────────────────

describe("GET /questions/{questionId}/topics — the REAL seam (already mounted, re-verified)", () => {
  test("happy: 200 rows from the REAL ContentReviewService, canonical TopicRowView wire", async () => {
    const { app } = makeApp(
      asTeacher,
      [
        questionRoute([{ id: QUESTION, primary_topic_node_id: null }]),
        topicRowsRoute([
          { node_id: NODE_1, is_primary: true },
          { node_id: NODE_2, is_primary: false },
        ]),
        nodeRoute([{ id: NODE_1, code: "4CH1-S1-c", title: "States of matter" }, { id: NODE_2, code: "4CH1-S2-a", title: "Particle model" }]),
      ],
    );
    const res = await app.request(`/api/v1/teacher/content/questions/${QUESTION}/topics`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTrue();
    for (const row of body) expect(topicRowViewSchema.safeParse(row).success).toBeTrue();
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ nodeId: NODE_1, primary: true, code: "4CH1-S1-c", title: "States of matter" });
    expect(body[1].primary).toBe(false);
  });

  test("V20 anchor synthesis: an ingested question with no primary row still shows its anchor", async () => {
    const { app } = makeApp(
      asTeacher,
      [
        questionRoute([{ id: QUESTION, primary_topic_node_id: NODE_1 }]),
        topicRowsRoute([{ node_id: NODE_2, is_primary: false }]),
        nodeRoute([{ id: NODE_1, code: "4CH1-S1-c", title: "States of matter" }]),
      ],
    );
    const res = await app.request(`/api/v1/teacher/content/questions/${QUESTION}/topics`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].nodeId).toBe(NODE_1);
    expect(body[0].primary).toBe(true);
    expect(body.filter((r: { primary: boolean }) => r.primary)).toHaveLength(1);
  });

  test("unknown question → 404 'question … not found' (the frozen verbatim envelope)", async () => {
    const { app } = makeApp(
      asTeacher,
      [questionRoute([])],
    );
    const res = await app.request(`/api/v1/teacher/content/questions/${UNKNOWN_QUESTION}/topics`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`question ${UNKNOWN_QUESTION} not found`);
  });
});

describe("POST /questions/{questionId}/topics — the mapping WRITE stays an honest 501", () => {
  test("teacher → 501 owned by the T-MIG-020 filing (write logic exists nowhere in the tree)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/content/questions/${QUESTION}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryNodeId: NODE_1, secondaryNodeIds: [] }),
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("not_implemented");
    expect(body.message).toContain("owned by T-MIG-023");
    expect(sql.queries).toHaveLength(0); // no invented write path
  });
});

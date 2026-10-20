/**
 * DC-6 phase 3 route pins — the observable HTTP contract of the CLA thread
 * sync tier (POST/GET/GET:id/PUT:id/DELETE:id under
 * /api/v1/learners/me/cla/threads), over an IN-MEMORY Hono app wiring the
 * REAL store + route law over stubbed sql (no Neon) — the
 * tutor-routes.test.ts harness pattern (T-MIG-041t2/052t2/060 lineage).
 *
 * Pinned here (docs/DC6-CLA-SYNC-TIER-PLAN.md §6): the authz shell (Boot
 * 401 first), the sessions-family error law (404 not_found with the
 * foreign-or-unknown oracle, 409 conflict, 400 bad_request "malformed
 * request" — NOT the frozen cla/ask two-envelope law), the create 201 shape
 * + the R13 cap 409, the 'assistant'-surface reservation, the summaries
 * list (no transcript bodies), the view seq-order + the epoch-ms `at`
 * conversion, the PUT full-state mirror (metadata ALWAYS applies,
 * lastActiveAt never moves backwards, per-row upsert + the shrink tail
 * delete, >100 messages 409) and the delete 204.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createClaThreadsRouter } from "../../src/routes/cla-threads";
import { buildClaThreadStore } from "../../src/services/cla/threads-store";
import { toErrorResponse } from "../../src/services/identity/errors";
import type { SqlFn } from "../../src/services/assessment/sql";
import { claThreadViewSchema } from "@syllabai/contracts";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const LEARNER = "bb000000-0000-4000-8000-000000000002";
const THREAD_A = "cc000000-0000-4000-8000-000000000002";

const NOW_TEXT = "2026-10-20T12:00:00Z";
const NOW_ISO = "2026-10-20T12:00:00.000Z";
const NOW = new Date(NOW_TEXT);
const clock = { now: () => NOW };

// ── fakeSql (param-aware substring dispatch; the tutor harness shape) ──────

type Row = Record<string, unknown>;
type Responder = Row[] | ((params: unknown[]) => Row[]);
function fakeSql(responses: Record<string, Responder>) {
  const queries: string[] = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    queries.push(text);
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) {
        const hit = responses[key];
        return typeof hit === "function" ? hit(params) : hit;
      }
    }
    return [];
  }) as unknown as SqlFn & { queries: string[] };
  fn.queries = queries;
  return fn;
}

const threadRow = (over: Partial<Row> = {}): Row => ({
  id: THREAD_A,
  learner_id: LEARNER,
  surface: "question_cla",
  question_id: "bio-paper-2-q7",
  question_number: 7,
  course_slug: "biology",
  title: "Why is the marker red?",
  created_at: NOW_ISO,
  last_active_at: NOW_ISO,
  ...over,
});

const messageRow = (seq: number, over: Partial<Row> = {}): Row => ({
  id: `dd000000-0000-4000-8000-00000000000${seq}`,
  thread_id: THREAD_A,
  seq,
  kind: seq % 2 === 1 ? "user" : "assistant",
  text: seq % 2 === 1 ? `question ${seq}` : null,
  payload: seq % 2 === 1 ? null : validAnswer(),
  payload_version: 1,
  occurred_at: NOW_ISO,
  ...over,
});

// ── app assembly (auth injection + the real error boundary + real mount) ───

type AuthRow = Record<string, unknown> | null;

function makeApp(responses: Record<string, Responder>, auth?: (c: Context) => AuthRow) {
  const sql = fakeSql(responses);
  const store = buildClaThreadStore(sql, clock);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = (auth ?? asLearner)(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/learners/me/cla/threads", createClaThreadsRouter(store));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
  });
  return { app, sql };
}

const asLearner = (): AuthRow => ({
  email: "s@example.edu",
  userId: LEARNER,
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): AuthRow => null;

const BASE = "/api/v1/learners/me/cla/threads";

/** A contracts-valid ClaAnswerView (the defensive wire parse is REAL law —
 *  every fixture payload must survive claAnswerViewSchema). */
const validAnswer = () => ({
  answer: "It isn't — the indicator is.",
  citations: [],
  context: {
    kind: "PAST_PAPER_QUESTION",
    reference: "aa000000-0000-4000-8000-000000000001",
    topicNodeId: "aa000000-0000-4000-8000-000000000002",
    rootId: "aa000000-0000-4000-8000-000000000003",
    subjectCode: "0610",
    topicCode: "9.1",
    topicTitle: "Respiration",
    curriculumVersion: "cv-1",
    curriculumBoard: "CIE",
    curriculumQualification: "IGCSE",
    validationState: "VALIDATED",
    mode: "EXPLAIN",
    questionStem: null,
    questionCommandWord: null,
    questionMarks: 1,
    paperCode: null,
    attempted: null,
    partLabel: null,
    lessonAction: null,
    noteId: null,
    noteTitle: null,
  },
  topics: [],
  evidenceCount: 0,
  model: null,
  provider: "deterministic-refusal",
  refused: true,
  latencyMs: 0,
  tools: [],
});

const createBody = {
  surface: "question_cla",
  questionId: "bio-paper-2-q7",
  questionNumber: 7,
  courseSlug: "biology",
  title: "Why is the marker red?",
};

const syncBody = {
  title: "Why is the marker red?",
  questionNumber: 7,
  courseSlug: "biology",
  messages: [
    { kind: "user", at: 1, text: "Why is the marker red?" },
    { kind: "assistant", at: 2, payload: validAnswer() },
  ],
};

// ── the battery ─────────────────────────────────────────────────────────────

describe("cla threads — the sync tier (DC-6 phase 3)", () => {
  test("authz shell first: anonymous 401 Boot shape before any handler work", async () => {
    const { app } = makeApp({}, anon);
    const res = await app.request(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createBody) });
    expect(res.status).toBe(401);
  });

  test("POST / → 201 {threadId, createdAt} (the lazy-bind anchor shape)", async () => {
    const { app } = makeApp({
      "select count(*) as n from cla_threads": [{ n: 0 }],
      "insert into cla_threads": [threadRow()],
    });
    const res = await app.request(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createBody) });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { threadId: string; createdAt: string };
    expect(body.threadId).toBe(THREAD_A);
    expect(body.createdAt).toBe(NOW_ISO);
  });

  test("POST / cap → 409 conflict (the R13 law shape — never silent eviction)", async () => {
    const { app } = makeApp({
      "select count(*) as n from cla_threads": [{ n: 200 }],
    });
    const res = await app.request(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createBody) });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("conflict");
  });

  test("POST / 'assistant' surface is RESERVED → 400 (plan §5.4)", async () => {
    const { app } = makeApp({});
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...createBody, surface: "assistant", questionId: "x" }),
    });
    expect(res.status).toBe(400);
  });

  test("POST / bad bodies → 400 bad_request 'malformed request' (NOT the two-envelope law)", async () => {
    const { app } = makeApp({});
    for (const body of [null, {}, { ...createBody, questionId: 9 }, { ...createBody, surface: "weird" }, { ...createBody, title: "" }, "nope"]) {
      const res = await app.request(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      const b = (await res.json()) as { error: string; message: string };
      expect(b.error).toBe("bad_request");
      expect(b.message).toBe("malformed request");
    }
  });

  test("GET / → summaries only, no transcript bodies (the s143 discipline)", async () => {
    const { app } = makeApp({
      "from cla_threads t": [Object.assign(threadRow(), { message_count: 3 })],
    });
    const res = await app.request(`${BASE}?surface=question_cla&questionId=bio-paper-2-q7`);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.threadId).toBe(THREAD_A);
    expect(rows[0]?.messageCount).toBe(3);
    expect(rows[0]?.title).toBe("Why is the marker red?");
    expect(JSON.stringify(rows)).not.toContain("transcript");
    expect(rows[0]?.messages).toBeUndefined();
  });

  test("GET /:id → 200 seq-ordered view, message `at` rides epoch ms", async () => {
    const { app } = makeApp({
      "from cla_threads where id = ? and learner_id = ?": [threadRow()],
      "order by seq": [messageRow(1), messageRow(2)],
    });
    const res = await app.request(`${BASE}/${THREAD_A}`);
    expect(res.status).toBe(200);
    const view = claThreadViewSchema.parse(await res.json());
    expect(view.threadId).toBe(THREAD_A);
    expect(view.messages).toHaveLength(2);
    expect(view.messages[0]?.at).toBe(NOW.getTime());
    expect(view.messages[1]?.kind).toBe("assistant");
  });

  test("GET /:id foreign-or-unknown → 404 indistinguishable (the §22 oracle law)", async () => {
    const { app } = makeApp({}); // no owned row → the same empty answer
    const res = await app.request(`${BASE}/${THREAD_A}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  test("GET /:id malformed uuid → 400 bad_request 'malformed request'", async () => {
    const { app } = makeApp({});
    const res = await app.request(`${BASE}/not-a-uuid`);
    expect(res.status).toBe(400);
  });

  test("PUT /:id → 200; the full-state mirror law holds (metadata ALWAYS applies, markActive guarded, per-row upsert, shrink tail delete)", async () => {
    const { app, sql } = makeApp({
      "from cla_threads where id = ? and learner_id = ?": [threadRow()],
      "select last_active_at from cla_threads": [{ last_active_at: NOW_ISO }],
    });
    const res = await app.request(`${BASE}/${THREAD_A}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncBody),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { threadId: string; lastActiveAt: string };
    expect(body.threadId).toBe(THREAD_A);
    expect(body.lastActiveAt).toBe(NOW_ISO);
    const joined = sql.queries.join(" | ");
    // metadata refresh is its OWN statement and is NOT gated by the recency guard
    expect(joined).toContain("update cla_threads set title = ?");
    expect(joined).not.toMatch(/update cla_threads set title[^|]*last_active_at is null/);
    // markActive is the guarded statement (lastActiveAt never moves backwards)
    expect(joined).toContain("set last_active_at = ?");
    expect(joined).toContain("last_active_at is null or last_active_at < ?");
    // one upsert per message, riding the array index as seq (the store maps
    // index -> seq; the params carry the values the text never shows)
    const upserts = sql.queries.filter((q) => q.includes("on conflict (thread_id, seq) do update"));
    expect(upserts).toHaveLength(2);
    expect(joined).toContain("::jsonb");
    expect(joined).toContain("question = excluded.question");
    // the shrink law rides its own statement
    expect(joined).toContain("seq > ?");
  });

  test("PUT /:id >100 messages → 400 at admission (the contracts .max(100) law; the store 409 stays the unreachable backstop)", async () => {
    const { app } = makeApp({
      "from cla_threads where id = ? and learner_id = ?": [threadRow()],
    });
    const many = Array.from({ length: 101 }, (_, i) => ({ kind: "user", at: i, text: `q ${i}` }));
    const res = await app.request(`${BASE}/${THREAD_A}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...syncBody, messages: many }),
    });
    expect(res.status).toBe(400);
  });

  test("PUT /:id bad body / malformed uuid / foreign-or-unknown → the mapped laws", async () => {
    const { app } = makeApp({
      "from cla_threads where id = ? and learner_id = ?": [], // owned → NotFound
    });
    const bad = await app.request(`${BASE}/${THREAD_A}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x", messages: [] , questionId: "nope" }),
    });
    expect(bad.status).toBe(400); // .strict() rejects the questionId smuggle
    const malformed = await app.request(`${BASE}/nope`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncBody),
    });
    expect(malformed.status).toBe(400);
    const foreign = await app.request(`${BASE}/${THREAD_A}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncBody),
    });
    expect(foreign.status).toBe(404);
    const fb = (await foreign.json()) as { error: string };
    expect(fb.error).toBe("not_found");
  });

  test("DELETE /:id → 204; messages go first, then the anchor; foreign-or-unknown 404", async () => {
    const { app, sql } = makeApp({
      "from cla_threads where id = ? and learner_id = ?": [threadRow()],
    });
    const res = await app.request(`${BASE}/${THREAD_A}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(sql.queries[1]).toContain("delete from cla_thread_messages");
    expect(sql.queries[2]).toContain("delete from cla_threads where id = ?");
    const { app: app2 } = makeApp({});
    const foreign = await app2.request(`${BASE}/${THREAD_A}`, { method: "DELETE" });
    expect(foreign.status).toBe(404);
  });
});

/**
 * T-MIG-060 tranche 2 route pins — the observable HTTP contract of
 * TutorController (POST /api/v1/tutor/ask + /ask/stream, the SSE twin) and
 * TutorSessionController (the §22 sessions CRUD), over an IN-MEMORY Hono
 * app wiring the REAL tranche-1 services + the REAL route law over stubbed
 * sql (no Neon) — the T-MIG-041t2/052t2 route-test pattern.
 *
 * Pinned here: the authz shells (Boot 401 first), the two-envelope body law
 * (Jackson binds before @Valid — malformed uuids/non-objects are
 * malformed_body, @NotBlank/@Size/@Pattern are validation_failed with the
 * jakarta messages), the §22 foreign-session 404 + V53 course-consistency
 * 409 probes BEFORE the pipeline, the deterministic refusal laws served
 * through the route with a DORMANT LLM seam (refusals never 503 — the
 * generator is never reached), the fail-open paper guard echoed through the
 * route, the honest 503 tutor_unavailable with the FIXED body (M2), the §22
 * append + its never-5xx guard, the SSE wire sequence
 * (citations → meta → delta* → done, the append on completed only, the
 * post-open error event with the fixed text) and the sessions CRUD status
 * laws (201 created shape, summaries list, /latest 204-vs-200 and never
 * captured by /:sessionId, delete 204, foreign-404 indistinguishable).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { buildTutorRouters, createTutorRouter } from "../../src/routes/tutor";
import { createTutorSessionsRouter } from "../../src/routes/tutorsessions";
import { buildTutorModule } from "../../src/services/tutor";
import { buildGroundedTutorGenerator, type PaperQuestionResolver } from "../../src/services/tutor";
import { TUTOR_REFUSAL, paperIdentityRefusal } from "../../src/services/tutor/prompt";
import { evidenceFromChunk } from "../../src/services/tutor/evidence";
import type { LlmProvider } from "../../src/services/tutor/karag";
import { toErrorResponse } from "../../src/services/identity/errors";
import type { SqlFn } from "../../src/services/tutor/sql";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const LEARNER = "bb000000-0000-4000-8000-000000000001";
const SESSION_A = "cc000000-0000-4000-8000-000000000001";
const ROW_A = "dd000000-0000-4000-8000-000000000001";
const CHUNK_A = "ee000000-0000-4000-8000-000000000001";

const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z";
const NOW = new Date(NOW_TEXT);
const clock = { now: () => NOW };

const SCOPE = {
  curriculumVersionId: "cv-00000000-0000-0000-0000-000000000001",
  code: "4CH1-2017",
  surface: new Set(["n1"]),
};
const scopes = {
  resolveActive: async () => SCOPE,
  resolveForCourse: async () => SCOPE,
};
const emptyGraph = {
  structureNodes: async () => [],
  prerequisiteChains: async () => new Map<string, never[]>(),
  misconceptionsForTopics: async () => new Map<string, never[]>(),
};
const notPaper: PaperQuestionResolver = async () => ({
  items: [],
  identityParsed: false,
  identityLabel: null,
});

const liveLlm: LlmProvider = {
  available: () => true,
  generate: async () => ({ text: "The answer is [1].", model: "fake-model", providerName: "fake-provider" }),
  stream: async function* () {
    yield { text: "The answer", model: "fake-model", providerName: "fake-provider" };
    yield { text: " is [1].", model: "fake-model", providerName: "fake-provider" };
  },
};
const dormantLlm: LlmProvider = {
  available: () => false,
  generate: async () => ({ text: "", model: "dormant", providerName: "dormant" }),
  stream: async function* () {},
};

const oneEvidenceItem = () =>
  evidenceFromChunk({
    documentRowId: ROW_A,
    documentId: "doc-1",
    documentVersion: 1,
    chunkId: CHUNK_A,
    chunkIndex: 0,
    kind: "QUESTION_PAPER",
    content: "Question 10 stem.",
    pageStart: 1,
    pageEnd: 1,
    elementIds: [],
    embeddingModel: "text-embedding-004",
    cosine: 0.9,
  });

// ── fakeSql (param-aware substring dispatch) ────────────────────────────────

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

const sessionRow = (over: Partial<Row> = {}): Row => ({
  id: SESSION_A,
  learner_id: LEARNER,
  created_at: NOW_ISO,
  last_active_at: NOW_ISO,
  course_ref: null,
  ...over,
});

// ── app assembly (auth injection + the real error boundary + real mounts) ───

type AuthRow = Record<string, unknown> | null;

function makeApp(
  routes: Record<string, Responder>,
  opts: {
    resolver?: PaperQuestionResolver;
    llm?: LlmProvider;
    auth?: (c: Context) => AuthRow;
  } = {},
) {
  const sql = fakeSql(routes);
  const module = buildTutorModule(sql, clock, {
    kgGraph: emptyGraph,
    scopes,
    vectorRetriever: async () => [],
    paperQuestionResolver: opts.resolver ?? notPaper,
    generator: buildGroundedTutorGenerator(opts.llm ?? dormantLlm),
    telemetry: () => {},
  } as never);
  const auth = opts.auth ?? asLearner;
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/tutor/sessions", createTutorSessionsRouter(module));
  app.route("/api/v1/tutor", createTutorRouter(module));
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

const ask = (app: Hono, body: unknown, path = "/api/v1/tutor/ask") =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

// ── authz shells (SecurityConfig :91 parity) ────────────────────────────────

describe("authz shells", () => {
  test("anonymous ask → Boot 401 body with the request path", async () => {
    const { app } = makeApp({}, { auth: anon });
    const res = await ask(app, { question: "why is the sky blue?" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/tutor/ask");
  });

  test("anonymous sessions list → Boot 401 (the shell runs before any handler)", async () => {
    const { app } = makeApp({}, { auth: anon });
    const res = await app.request("/api/v1/tutor/sessions");
    expect(res.status).toBe(401);
    expect(((await res.json()) as Record<string, unknown>).path).toBe("/api/v1/tutor/sessions");
  });
});

// ── the two-envelope body law (Jackson binds before @Valid) ─────────────────

describe("ask body law — malformed_body vs validation_failed", () => {
  test("a non-object body → 400 malformed_body", async () => {
    const { app } = makeApp({});
    const res = await ask(app, "[1,2,3]");
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("malformed_body");
  });

  test("a present-but-wrong question type is a BINDING failure", async () => {
    const { app } = makeApp({});
    const res = await ask(app, { question: 42 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("malformed_body");
  });

  test("a malformed sessionId uuid fails Jackson's UUID binding → malformed_body", async () => {
    const { app } = makeApp({});
    const res = await ask(app, { question: "q", sessionId: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("malformed_body");
  });

  test("absent question → @NotBlank → validation_failed", async () => {
    const { app } = makeApp({});
    const res = await ask(app, {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).message).toBe("question: must not be blank");
  });

  test("empty question → @NotBlank fires before @Size", async () => {
    const { app } = makeApp({});
    const res = await ask(app, { question: "" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).message).toBe("question: must not be blank");
  });

  test("whitespace-only question → @NotBlank trimmed-length law (T-MIG-070 blocker 1)", async () => {
    // jakarta @NotBlank evaluates the TRIMMED length (TutorController.java
    // :123-141): "   " is a constraint violation serving 400
    // validation_failed "question: must not be blank" — the former
    // z.string().min(1) admitted it into the service, which answered the
    // WRONG envelope (400 bad_request "malformed request").
    const { app } = makeApp({});
    const res = await ask(app, { question: "   " });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("question: must not be blank");
  });

  test("whitespace-only history turn → 400 at binding, never a silent drop (T-MIG-070 blocker 1)", async () => {
    // THE DANGEROUS ONE (comment 6010396027): a history turn whose text is
    // whitespace-only must be a binding-time 400 validation_failed — the
    // former min(1) schema admitted it and conversation.ts's defensive
    // trim-to-null silently served a 200 with the turn gone.
    const { app } = makeApp({});
    const res = await ask(app, {
      question: "what is a mole?",
      history: [{ role: "user", text: "   " }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("history[0].text: must not be blank");
  });

  test("oversized question → the @Size jakarta message", async () => {
    const { app } = makeApp({});
    const res = await ask(app, { question: "x".repeat(2001) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).message).toBe(
      "question: size must be between 0 and 2000",
    );
  });

  test("a non user|assistant history role → the @Pattern constraint message", async () => {
    const { app } = makeApp({});
    const res = await ask(app, {
      question: "q",
      history: [{ role: "teacher", text: "hello" }],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).message).toBe(
      'history[0].role: must match "user|assistant"',
    );
  });

  test("13 history turns → the @Size history message", async () => {
    const { app } = makeApp({});
    const res = await ask(app, {
      question: "q",
      history: Array.from({ length: 13 }, () => ({ role: "user", text: "t" })),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).message).toBe(
      "history: size must be between 0 and 12",
    );
  });

  test("oversized courseRef → the @Size courseRef message", async () => {
    const { app } = makeApp({});
    const res = await ask(app, { question: "q", courseRef: "c".repeat(65) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).message).toBe(
      "courseRef: size must be between 0 and 64",
    );
  });
});

// ── the §22 probes + the deterministic laws through the route ───────────────

const ownedRoute = (knownIds: string[]): Responder => (params: unknown[]) =>
  knownIds.includes(String(params[0])) ? [sessionRow()] : [];

describe("the §22 probes and the deterministic ask laws", () => {
  test("a foreign session id 404s up front — indistinguishable from unknown", async () => {
    const { app } = makeApp({ "from tutor_sessions where id =": ownedRoute([]) });
    const res = await ask(app, { question: "q", sessionId: SESSION_A });
    expect(res.status).toBe(404);
    expect(((await res.json()) as Record<string, unknown>).message).toBe(
      `tutor session ${SESSION_A} not found`,
    );
  });

  test("V53: a course-switching ask 409s before the pipeline", async () => {
    const serving: Responder = (params: unknown[]) =>
      String(params[0]) === SESSION_A ? [sessionRow({ course_ref: "4CH1-2017" })] : [];
    const { app } = makeApp({
      "from tutor_sessions where id =": serving,
    });
    const res = await ask(app, {
      question: "q",
      sessionId: SESSION_A,
      courseRef: "4CH1",
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Record<string, unknown>).message).toBe(
      `this chat serves course 4CH1-2017 — it cannot switch to 4CH1; start a new chat for the other course`,
    );
  });

  test("empty grounding refuses deterministically THROUGH the route (dormant LLM never 503s)", async () => {
    const { app, sql } = makeApp({});
    const res = await ask(app, { question: "why is that?" });
    expect(res.status).toBe(200);
    const view = (await res.json()) as Record<string, unknown>;
    expect(view.refused).toBe(true);
    expect(view.provider).toBe("deterministic-refusal");
    expect(view.answer).toBe(TUTOR_REFUSAL);
    expect(view.evidenceCount).toBe(0);
    // the generator was never reached — no append either (no sessionId)
    expect(sql.queries.some((q) => q.includes("insert into tutor_session_turns"))).toBe(false);
  });

  test("the fail-open paper guard echoes the identity through the route", async () => {
    const resolver: PaperQuestionResolver = async () => ({
      items: [],
      identityParsed: true,
      identityLabel: "question 10 from the June 2019 paper 2",
    });
    const { app } = makeApp({}, { resolver });
    const res = await ask(app, { question: "explain question 10 from june 2019 paper 2" });
    expect(res.status).toBe(200);
    const view = (await res.json()) as Record<string, unknown>;
    expect(view.refused).toBe(true);
    expect(view.provider).toBe("deterministic-paper-refusal");
    expect(view.answer).toBe(paperIdentityRefusal("question 10 from the June 2019 paper 2"));
  });

  test("generation-reaching ask + dormant LLM seam → the honest 503 with the FIXED body", async () => {
    const resolver: PaperQuestionResolver = async () => ({
      items: [oneEvidenceItem()],
      identityParsed: false,
      identityLabel: null,
    });
    const { app } = makeApp({}, { resolver });
    const res = await ask(app, { question: "explain question 10" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("tutor_unavailable");
    expect(body.message).toBe("the tutor is temporarily unavailable — please try again shortly");
  });

  test("200 happy path: served answer + the §22 append, V53 write-once course attach", async () => {
    const resolver: PaperQuestionResolver = async () => ({
      items: [oneEvidenceItem()],
      identityParsed: false,
      identityLabel: null,
    });
    const { app, sql } = makeApp(
      {
        "from tutor_sessions where id =": ownedRoute([SESSION_A]),
        "update tutor_sessions set course_ref": [],
        "select seq from tutor_session_turns": [],
        "insert into tutor_session_turns": [],
        "update tutor_sessions": [],
      },
      { resolver, llm: liveLlm },
    );
    const res = await ask(app, { question: "explain question 10", sessionId: SESSION_A, courseRef: "4CH1" });
    expect(res.status).toBe(200);
    const view = (await res.json()) as Record<string, unknown>;
    expect(view.refused).toBe(false);
    expect(view.model).toBe("fake-model");
    expect(view.evidenceCount).toBe(1);
    expect((view.citations as unknown[]).length).toBe(1);
    // the §22 append: both turns + the last_active touch
    expect(sql.queries.filter((q) => q.includes("insert into tutor_session_turns")).length).toBe(2);
    expect(sql.queries.some((q) => q.includes("update tutor_sessions set course_ref"))).toBe(true);
  });

  test("the append guard: a persistence failure NEVER 5xxes the delivered answer", async () => {
    const resolver: PaperQuestionResolver = async () => ({
      items: [oneEvidenceItem()],
      identityParsed: false,
      identityLabel: null,
    });
    const { app } = makeApp(
      {
        "from tutor_sessions where id =": ownedRoute([SESSION_A]),
        "insert into tutor_session_turns": () => {
          throw new Error("db write failed");
        },
      },
      { resolver, llm: liveLlm },
    );
    const res = await ask(app, { question: "explain question 10", sessionId: SESSION_A });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).refused).toBe(false);
  });
});

// ── the SSE stream law ──────────────────────────────────────────────────────

describe("POST /ask/stream — the SSE wire law", () => {
  test("pre-open failures are JSON errors, not an opened-then-failed stream", async () => {
    const { app } = makeApp({ "from tutor_sessions where id =": ownedRoute([]) });
    const res = await ask(app, { question: "q", sessionId: SESSION_A }, "/api/v1/tutor/ask/stream");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("deterministic refusal streams citations → meta → delta → done", async () => {
    const { app, sql } = makeApp({});
    const res = await ask(app, { question: "why is that?" }, "/api/v1/tutor/ask/stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: citations");
    expect(text).toContain("event: meta");
    expect(text).toContain("event: delta");
    expect(text).toContain("event: done");
    expect(text).toContain('"refused":true');
    expect(text).toContain('"provider":"deterministic-refusal"');
    // no sessionId → no §22 append
    expect(sql.queries.some((q) => q.includes("insert into tutor_session_turns"))).toBe(false);
  });

  test("a served stream persists the exchange on completed (§22 append on success only)", async () => {
    const resolver: PaperQuestionResolver = async () => ({
      items: [oneEvidenceItem()],
      identityParsed: false,
      identityLabel: null,
    });
    const { app, sql } = makeApp(
      {
        "from tutor_sessions where id =": ownedRoute([SESSION_A]),
        "select seq from tutor_session_turns": [],
        "insert into tutor_session_turns": [],
        "update tutor_sessions": [],
      },
      { resolver, llm: liveLlm },
    );
    const res = await ask(
      app,
      { question: "explain question 10", sessionId: SESSION_A },
      "/api/v1/tutor/ask/stream",
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("event: done");
    expect(text).toContain('"ok":true');
    expect(sql.queries.filter((q) => q.includes("insert into tutor_session_turns")).length).toBe(2);
  });

  test("a post-open stream failure travels as the wire error event with the FIXED text", async () => {
    const explodingLlm: LlmProvider = {
      available: () => true,
      generate: async () => ({ text: "", model: "m", providerName: "p" }),
      stream: async function* () {
        yield { text: "partial", model: "m", providerName: "p" };
        throw new Error("upstream provider exploded with secrets");
      },
    };
    const resolver: PaperQuestionResolver = async () => ({
      items: [oneEvidenceItem()],
      identityParsed: false,
      identityLabel: null,
    });
    const { app } = makeApp({}, { resolver, llm: explodingLlm });
    const res = await ask(app, { question: "q" }, "/api/v1/tutor/ask/stream");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("event: error");
    // deep-audit M2: the provider error text NEVER reaches the wire
    expect(text).not.toContain("secrets");
    expect(text).toContain("the tutor is temporarily unavailable — please try again shortly");
  });
});

// ── the sessions CRUD (§22, s143) ───────────────────────────────────────────

describe("tutor sessions CRUD", () => {
  test("POST / → 201 CreatedSessionView with EXACTLY {sessionId, createdAt}", async () => {
    const { app } = makeApp({
      "count(*) as n from tutor_sessions": [{ n: 0 }],
      "insert into tutor_sessions": [sessionRow()],
    });
    const res = await app.request("/api/v1/tutor/sessions", { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["createdAt", "sessionId"]);
    expect(body.sessionId).toBe(SESSION_A);
    expect(body.createdAt).toBe(NOW_ISO);
  });

  test("R13: the 50th session 409s with the verbatim guidance", async () => {
    const { app } = makeApp({
      "count(*) as n from tutor_sessions": [{ n: 50 }],
    });
    const res = await app.request("/api/v1/tutor/sessions", { method: "POST" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Record<string, unknown>).message).toBe(
      "session limit reached (50) — delete an old chat to start a new one",
    );
  });

  test("GET / → 200 summaries only (no transcript bodies)", async () => {
    // T-MIG-093 construction law pinned at the adapter boundary: the IN list
    // binds EVERY id as its own scalar $n (submit.ts :383 law at dynamic
    // length) — a bound JS array is a single wire value and 500s the Neon
    // wire (golden-verify T-MIG-092 run-002 L06). fakeSql joins the template
    // strings with "?", so the per-element construction shows up as "(?)"
    // (and "(?, ?)" for two ids) — and the responder receives ids.length
    // scalar params, never an array.
    const seenCounts: unknown[][] = [];
    const seenFirst: unknown[][] = [];
    const { app } = makeApp({
      "order by last_active_at desc limit ?": [sessionRow()],
      "where session_id in (?) group by session_id": (params: unknown[]) => {
        seenCounts.push(params);
        return [{ session_id: SESSION_A, n: 2 }];
      },
      "where session_id in (?) and seq = 1": (params: unknown[]) => {
        seenFirst.push(params);
        return [{ session_id: SESSION_A, role: "user", content: "What is electrolysis?" }];
      },
    });
    const res = await app.request("/api/v1/tutor/sessions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]!.sessionId).toBe(SESSION_A);
    expect(body[0]!.title).toBe("What is electrolysis?");
    expect(body[0]!.turnCount).toBe(2);
    expect(body[0]).not.toHaveProperty("turns");
    // every id rode its own scalar parameter — no array ever crossed the seam
    expect(seenCounts).toHaveLength(1);
    expect(seenCounts[0]).toHaveLength(1);
    expect(Array.isArray(seenCounts[0]![0])).toBe(false);
    expect(seenCounts[0]![0]).toBe(SESSION_A);
    expect(seenFirst).toHaveLength(1);
    expect(seenFirst[0]).toHaveLength(1);
    expect(Array.isArray(seenFirst[0]![0])).toBe(false);
  });

  test("GET /latest → 204 when the learner never chatted", async () => {
    const { app } = makeApp({});
    const res = await app.request("/api/v1/tutor/sessions/latest");
    expect(res.status).toBe(204);
  });

  test("GET /latest → 200 with the transcript, and is NOT captured by /:sessionId", async () => {
    const { app } = makeApp({
      "from tutor_sessions where id =": ownedRoute([SESSION_A]),
      "order by last_active_at desc limit 1": [sessionRow()],
      "from tutor_session_turns where session_id =": [],
    });
    const res = await app.request("/api/v1/tutor/sessions/latest");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sessionId).toBe(SESSION_A);
    expect(body.turns).toEqual([]);
  });

  test("GET /:sessionId → 200 the seq-ordered transcript", async () => {
    const { app } = makeApp({
      "from tutor_sessions where id =": ownedRoute([SESSION_A]),
      "from tutor_session_turns where session_id =": [
        {
          id: "t1",
          session_id: SESSION_A,
          seq: 1,
          role: "user",
          content: "q",
          evidence_count: 0,
          refused: false,
          answer_model: null,
          answer_provider: null,
          latency_ms: null,
          created_at: NOW_ISO,
        },
      ],
    });
    const res = await app.request(`/api/v1/tutor/sessions/${SESSION_A}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.turns as unknown[]).length).toBe(1);
  });

  test("GET /:sessionId with a malformed uuid → 400 bad_request 'malformed request'", async () => {
    const { app } = makeApp({});
    const res = await app.request("/api/v1/tutor/sessions/nope");
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("DELETE /:sessionId → 204; a foreign id 404s exactly like unknown", async () => {
    const { app } = makeApp({
      "from tutor_sessions where id =": ownedRoute([SESSION_A]),
      "delete from tutor_session_turns where session_id =": [],
      "delete from tutor_sessions where id =": [],
    });
    const ok = await app.request(`/api/v1/tutor/sessions/${SESSION_A}`, { method: "DELETE" });
    expect(ok.status).toBe(204);

    const foreign = await app.request(
      "cc000000-0000-4000-8000-000000000002".replace(/^/, "/api/v1/tutor/sessions/"),
      { method: "DELETE" },
    );
    expect(foreign.status).toBe(404);
    expect(((await foreign.json()) as Record<string, unknown>).message).toBe(
      "tutor session cc000000-0000-4000-8000-000000000002 not found",
    );
  });
});

// ── the composition root constructs (mount topology smoke) ──────────────────

describe("buildTutorRouters composition root", () => {
  test("both routers construct over a DATABASE_URL-shaped env (wired, not lazy)", () => {
    const env = { DATABASE_URL: "postgres://placeholder" } as Record<string, string>;
    // requireDatabaseUrl accepts the placeholder; no Neon contact happens at
    // construction (the sql client connects lazily on first query)
    const built = buildTutorRouters(env);
    expect(typeof built.tutorRoute).toBe("object");
    expect(typeof built.tutorSessionsRoute).toBe("object");
    expect(built.module.sessionStore).toBeDefined();
    expect(built.module.ask).toBeDefined();
    expect(built.module.askStream).toBeDefined();
  });
});

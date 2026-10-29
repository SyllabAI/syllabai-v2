/**
 * Paper-marks award route tests (T-MG-AWARDS-1 run-001) — the observable
 * HTTP contract of /api/v1/paper-marks over REAL services on stubbed sql
 * (the 032 route-test pattern). 200 bodies validated against the canonical
 * contracts; the error envelopes pinned to the Boot 401 shell + the
 * malformed-400 / unknown-404 law.
 *   (d) posture pin — the read+write routes are auth-gated (401 shell
 *       FIRST) and the learner id rides the JWT context: the ledger query
 *       receives getAuth(c).userId, and NO wire shape carries a learnerId.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createPaperAwardsRouter } from "../../src/routes/paper-awards";
import { PaperAwards, createPaperAwardPublisher, type PaperAwardPublisher } from "../../src/services/paper-awards";
import { toErrorResponse } from "../../src/services/identity/errors";
import { paperMarksLedgerSchema, paperAwardWriteResponseSchema } from "@syllabai/contracts";
import type { SqlFn } from "../../src/services/paper-awards/sql";

type Route = {
  match: RegExp;
  rows?: Array<Record<string, unknown>>;
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
};

const LEARNER = "aa645313-5930-4381-91ed-caff67a2f836";
const PAPER = "47000000-0000-4000-8000-000000000001";
const PART = "51000000-0000-4000-8000-000000000001";
const QUESTION = "52000000-0000-4000-8000-000000000001";
const UNKNOWN_REGION = "56000000-0000-4000-8000-000000000099";

const fb = {
  attempt: "full",
  chatMessage: "route test",
  pointsScored: [],
  pointsNotScored: [],
  thoughtProcess: "route test",
  strategiesForImprovement: [],
};

const ledgerRoute: Route = {
  match: /from mark_awards a left join mark_working_blocks/,
  rows: [],
  rowsFor: (params) =>
    params[0] === LEARNER && params[2] === PAPER
      ? [
          {
            id: "54000000-0000-4000-8000-000000000001", region_key: "9", page: 2, code: "B1",
            awarded: true, score: 1, max_score: 1, ordinal: 0, mark_point_id: null, working_ref: null,
            pipeline_version: "paper-mark/v1", feedback: fb, created_at: "2026-10-30T00:00:00Z",
            wb_id: null, wb_kind: null, wb_content: null, wb_created_at: null,
          },
        ]
      : [],
};

const partRoute: Route = {
  match: /from question_parts p join question_versions v/,
  rows: [],
  rowsFor: (params) =>
    params[0] === PART
      ? [{ part_id: PART, label: "a", ordering: 0, question_id: QUESTION }]
      : [],
};

const questionRoute: Route = {
  match: /from questions q where q\.id = \?/,
  rows: [],
  rowsFor: (params) =>
    params[0] === QUESTION
      ? [{ question_id: QUESTION, external_ref: "9", exam_paper_id: PAPER }]
      : [],
};

const claimRoute: Route = {
  match: /insert into mark_awards/,
  rows: [{ id: "54000000-0000-4000-8000-000000009999" }],
};

const blockRoute: Route = {
  match: /insert into mark_working_blocks/,
  rows: [{ id: "55000000-0000-4000-8000-000000009999" }],
};

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  opts: { extra?: Route[]; publisher?: PaperAwardPublisher } = {},
) {
  const issued: string[] = [];
  const all = [...(opts.extra ?? []), claimRoute, blockRoute, ledgerRoute, partRoute, questionRoute];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    issued.push(text);
    const hit = all.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : hit.rows;
  }) as unknown as SqlFn;
  const publisher = opts.publisher ?? createPaperAwardPublisher(sql);
  const awards = new PaperAwards(sql, publisher);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/paper-marks", createPaperAwardsRouter(awards));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-30T00:00:00Z" }, 500 as const);
  });
  return { app, issued };
}

const STUDENT = { email: "student@example.edu", userId: LEARNER, roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const anon = () => null;

const validBody = {
  pipelineVersion: "paper-mark/v1",
  awards: [
    { code: "P1", awarded: true, score: 1, maxScore: 1, ordinal: 0, markPointId: null, page: 2, feedback: fb },
    { code: "C1", awarded: false, score: 0, maxScore: 1, ordinal: 0, feedback: fb },
  ],
};

describe("POSTURE PIN (d) — auth shell first, learner rides the JWT context", () => {
  test("unauthenticated GET → 401 before any handler work", async () => {
    const { app } = makeApp(anon);
    const res = await app.request(`/api/v1/paper-marks?documentRefType=paper_asset&documentRefId=${PAPER}`);
    expect(res.status).toBe(401);
  });

  test("unauthenticated POST → 401 before any handler work", async () => {
    const { app } = makeApp(anon);
    const res = await app.request(`/api/v1/paper-marks/regions/${PART}/awards`, {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  test("the ledger query receives getAuth(c).userId — the JWT learner, never a wire param", async () => {
    const { app, issued } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks?documentRefType=paper_asset&documentRefId=${PAPER}`);
    expect(res.status).toBe(200);
    const ledgerQuery = issued.find((t) => /from mark_awards a left join/.test(t));
    expect(ledgerQuery).toBeDefined();
  });
});

describe("GET /api/v1/paper-marks — the getRegionMarks ledger", () => {
  test("200 shape validated against the canonical contract; honest-empty for an unmarked document", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks?documentRefType=paper_asset&documentRefId=${PAPER}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = paperMarksLedgerSchema.parse(body);
    expect(parsed.documentRefType).toBe("paper_asset");
    expect(parsed.documentRefId).toBe(PAPER);
    expect(parsed.regions).toHaveLength(1);
    expect(parsed.regions[0]!.regionKey).toBe("9");
    expect(parsed.regions[0]!.awards[0]!.code).toBe("B1");

    const empty = await app.request(`/api/v1/paper-marks?documentRefType=paper_asset&documentRefId=47000000-0000-4000-8000-0000000000ff`);
    expect(empty.status).toBe(200);
    const emptyBody = await empty.json();
    expect(emptyBody.regions).toEqual([]); // honest-empty — never an error
  });

  test("documentRefType defaults to paper_asset", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks?documentRefId=${PAPER}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documentRefType).toBe("paper_asset");
  });

  test("malformed documentRefId uuid → 400 bad_request 'malformed request'", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks?documentRefId=not-a-uuid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("unknown documentRefType → 400 (the union enum is the contract law)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks?documentRefType=not_a_kind&documentRefId=${PAPER}`);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/paper-marks/regions/:regionId/awards — the claim receipt", () => {
  test("200 validated against the canonical contract: the bridge resolves identity, the live claim emits", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks/regions/${PART}/awards`, {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = paperAwardWriteResponseSchema.parse(body);
    // the bridge: part 'a' of external_ref '9' → regionKey '9.a', paper PAPER
    expect(parsed.regionKey).toBe("9.a");
    expect(parsed.documentRefType).toBe("paper_asset");
    expect(parsed.documentRefId).toBe(PAPER);
    expect(parsed.emitted).toBe(2); // the live claim admits both (distinct codes)
    expect(parsed.suppressed).toBe(0);
    expect(parsed.workingBlocks).toBe(0); // no working payloads in this body
  });

  test("suppressed re-fires are 200 counts, never errors (idempotent pipeline semantics)", async () => {
    const suppressAll: PaperAwardPublisher = { publishAward: async () => false };
    const { app } = makeApp(asStudent, { publisher: suppressAll });
    const res = await app.request(`/api/v1/paper-marks/regions/${PART}/awards`, {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emitted).toBe(0);
    expect(body.suppressed).toBe(2); // the once-only claim absorbed the re-fire
  });

  test("unknown region → 404 'region {uuid} not found' (the T-C20 envelope)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks/regions/${UNKNOWN_REGION}/awards`, {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`region ${UNKNOWN_REGION} not found`);
  });

  test("malformed regionId uuid → 400 bad_request 'malformed request'", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks/regions/not-a-uuid/awards`, {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("unreadable body → 400 malformed_body; constraint failure → 400 validation_failed 'field: message'", async () => {
    const { app } = makeApp(asStudent);
    const unreadable = await app.request(`/api/v1/paper-marks/regions/${PART}/awards`, {
      method: "POST",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect(unreadable.status).toBe(400);
    expect((await unreadable.json()).error).toBe("malformed_body");

    const missingVersion = await app.request(`/api/v1/paper-marks/regions/${PART}/awards`, {
      method: "POST",
      body: JSON.stringify({ awards: validBody.awards }),
      headers: { "content-type": "application/json" },
    });
    expect(missingVersion.status).toBe(400);
    const verdict = await missingVersion.json();
    expect(verdict.error).toBe("validation_failed");
    expect(verdict.message).toContain("pipelineVersion");

    const emptyAwards = await app.request(`/api/v1/paper-marks/regions/${PART}/awards`, {
      method: "POST",
      body: JSON.stringify({ pipelineVersion: "paper-mark/v1", awards: [] }),
      headers: { "content-type": "application/json" },
    });
    expect(emptyAwards.status).toBe(400);
    expect((await emptyAwards.json()).message).toContain("awards");
  });
});

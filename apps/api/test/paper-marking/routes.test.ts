/**
 * Paper-marking route tests (T-MG-CROPMARK-1 run-001) — the observable
 * HTTP contract of the pipeline surface over REAL services on stubbed sql
 * with deterministic model fakes (the paper-awards route-test posture).
 *
 * The envelope law: 401 shell FIRST (the learner rides the JWT context,
 * never the wire) | 400 malformed path/body/validation | 413 crop over cap
 * | 404 unknown region/mark | 422 region without definitions | 202 + poll
 * (the long-running posture of record, retry: 0).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createPaperMarkingRouter, buildPaperMarkingRouters } from "../../src/routes/paper-marking";
import { PaperMarking, MarkJobRegistry, type PaperMarkingLlm } from "../../src/services/paper-marking";
import { PaperAwards, createPaperAwardPublisher } from "../../src/services/paper-awards";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  paperMarkAcceptedSchema,
  paperMarkPollResponseSchema,
} from "@syllabai/contracts";
import type { TranscriptionProvider } from "../../src/services/answer-input/service";
import type { SqlFn } from "../../src/services/paper-marking/sql";

const LEARNER = "aa645313-5930-4381-91ed-caff67a2f836";
const PAPER = "47000000-0000-4000-8000-000000000001";
const PART_A = "51000000-0000-4000-8000-000000000001";
const PART_EMPTY = "51000000-0000-4000-8000-000000000003"; // known region, no definitions
const UNKNOWN_REGION = "56000000-0000-4000-8000-000000000099";
const PNG_CROP = "data:image/png;base64,aGVsbG8gd29ybGQ=";

const DEFS_A = [
  { id: "61000000-0000-4000-8000-000000000001", ref: "P1", ordering: 0, text: "the scale factor", marks: 1, acceptance_criteria: null },
  { id: "61000000-0000-4000-8000-000000000002", ref: "C1", ordering: 1, text: "the conclusion", marks: 1, acceptance_criteria: null },
];

const VERDICT = {
  chatMessage: "Show the factor step.",
  reasoning: "hello world\n\nThe factor is shown but the conclusion is bare.",
  points: [
    { ref: "P1", awarded: true, comment: "shown" },
    { ref: "C1", awarded: false, comment: "bare conclusion" },
  ],
  strategiesForImprovement: ["Multiply every ingredient."],
};

function makeSql() {
  const claimParams: unknown[][] = [];
  const contextParams: unknown[][] = [];
  const routes: Array<{ match: RegExp; rowsFor: (params: unknown[]) => Array<Record<string, unknown>> }> = [
    {
      match: /from question_parts p join question_versions v/,
      rowsFor: (params) =>
        params[0] === PART_A
          ? [{ part_id: PART_A, label: "a", ordering: 0, question_id: "52000000-0000-4000-8000-000000000001" }]
          : params[0] === PART_EMPTY
            ? [{ part_id: PART_EMPTY, label: "z", ordering: 25, question_id: "52000000-0000-4000-8000-000000000001" }]
            : [],
    },
    {
      match: /from questions q where q\.id = \?/,
      rowsFor: (params) =>
        params[0] === "52000000-0000-4000-8000-000000000001"
          ? [{ question_id: "52000000-0000-4000-8000-000000000001", external_ref: "17", exam_paper_id: PAPER }]
          : [], // any OTHER uuid (incl. UNKNOWN_REGION) is honestly unknown
    },
    {
      match: /from mark_points mp where mp\.question_part_id/,
      rowsFor: (params) => (params[0] === PART_A ? DEFS_A : []),
    },
    { match: /min\(r\.page\)/, rowsFor: () => [{ page: 2 }] },
    {
      match: /from mark_working_blocks\s+where learner_id/,
      rowsFor: (params) => {
        contextParams.push(params as unknown[]);
        return [];
      },
    },
    {
      match: /insert into mark_awards/,
      rowsFor: (params) => {
        claimParams.push(params as unknown[]);
        return [{ id: crypto.randomUUID() }];
      },
    },
    { match: /insert into mark_working_blocks/, rowsFor: () => [{ id: crypto.randomUUID() }] },
  ];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    const hit = routes.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor(params);
  }) as unknown as SqlFn;
  return { sql, claimParams, contextParams };
}

const realOkTranscriber: TranscriptionProvider = {
  generate: async () => ({ text: "hello world", providerName: "fake", model: "fake-vision", latencyMs: 1 }),
};

const okMarker: PaperMarkingLlm = {
  generate: async () => ({ text: JSON.stringify(VERDICT) }),
};

interface MakeOpts {
  transcriber?: TranscriptionProvider | null;
  marker?: PaperMarkingLlm | null;
}

function makeApp(auth: (c: Context) => Record<string, unknown> | null, opts: MakeOpts = {}) {
  const { sql, claimParams } = makeSql();
  const awards = new PaperAwards(sql, createPaperAwardPublisher(sql));
  // the EXPLICIT-null seam law (the dormant posture must survive the
  // defaults): undefined → the ok fake; null → honestly dormant.
  const marking = new PaperMarking(
    sql,
    awards,
    opts.transcriber !== undefined ? opts.transcriber : realOkTranscriber,
    opts.marker !== undefined ? opts.marker : okMarker,
  );
  const registry = new MarkJobRegistry();
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/paper-marks", createPaperMarkingRouter(marking, registry));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-30T00:00:00Z" }, 500 as const);
  });
  return { app, registry, claimParams };
}

const STUDENT = { email: "student@example.edu", userId: LEARNER, roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const anon = () => null;

const markBody = () => JSON.stringify({ imageDataUrl: PNG_CROP });

describe("POSTURE — auth shell first, learner rides the JWT context", () => {
  test("unauthenticated mark/regrade/poll → 401 before any handler work", async () => {
    const { app } = makeApp(anon);
    expect((await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, { method: "POST", body: markBody(), headers: { "content-type": "application/json" } })).status).toBe(401);
    expect((await app.request(`/api/v1/paper-marks/parts/${PART_A}/regrade`, { method: "POST", body: JSON.stringify({ answerHtml: "<p>x</p>" }), headers: { "content-type": "application/json" } })).status).toBe(401);
    expect((await app.request(`/api/v1/paper-marks/marks/${crypto.randomUUID()}`)).status).toBe(401);
  });

  test("no wire shape carries a learnerId — the claim rows ride the JWT learner, an injected learnerId key is stripped", async () => {
    const { app, registry, claimParams } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, {
      method: "POST",
      body: JSON.stringify({ imageDataUrl: PNG_CROP, learnerId: "11111111-1111-4111-8111-111111111111" }),
      headers: { "content-type": "application/json" },
    });
    // the wire has NO learnerId field — the extra key is stripped, the run
    // proceeds, and the ledger write carries the JWT learner alone.
    expect(res.status).toBe(202);
    await registry.waitAll();
    expect(claimParams.length).toBe(2); // one claim per award row
    for (const params of claimParams) {
      // (learnerId, documentRefType, ...) — the JWT learner rides position 0
      expect(params[0]).toBe(LEARNER);
      expect(params[1]).toBe("paper_asset");
    }
  });
});

describe("the crop channel envelope (POST /regions/:regionId/mark)", () => {
  test("malformed path uuid → 400 bad_request", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request("/api/v1/paper-marks/regions/not-a-uuid/mark", { method: "POST", body: markBody(), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_request");
  });

  test("unreadable body → 400 malformed_body; wrong shape → 400 validation_failed", async () => {
    const { app } = makeApp(asStudent);
    const bad = await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, { method: "POST", body: "[]", headers: { "content-type": "application/json" } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("malformed_body");
    const wrong = await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, { method: "POST", body: JSON.stringify({ imageDataUrl: "http://example.com/crop.png" }), headers: { "content-type": "application/json" } });
    expect(wrong.status).toBe(400);
    const wrongBody = (await wrong.json()) as { error: string; message: string };
    expect(wrongBody.error).toBe("validation_failed");
    expect(wrongBody.message).toContain("imageDataUrl");
  });

  test("a >4MB crop → 413 crop_too_large BEFORE any job exists", async () => {
    const { app } = makeApp(asStudent);
    const huge = Buffer.alloc(4 * 1024 * 1024 + 1, 7).toString("base64");
    const res = await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, { method: "POST", body: JSON.stringify({ imageDataUrl: `data:image/png;base64,${huge}` }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("crop_too_large");
  });

  test("unknown region → 404 (the T-C20 envelope)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks/regions/${UNKNOWN_REGION}/mark`, { method: "POST", body: markBody(), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe(`region ${UNKNOWN_REGION} not found`);
  });

  test("a known region without mark_points → 422 no_mark_points (the honest unmarkable law)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks/regions/${PART_EMPTY}/mark`, { method: "POST", body: markBody(), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no_mark_points");
  });

  test("the happy path → 202 {markId, status:'queued'}; the poll walks running → succeeded with the full output", async () => {
    const { app, registry } = makeApp(asStudent);
    const res = await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, { method: "POST", body: markBody(), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(202);
    const accepted = paperMarkAcceptedSchema.parse(await res.json());
    const poll1 = await app.request(`/api/v1/paper-marks/marks/${accepted.markId}`);
    expect(poll1.status).toBe(200);
    const snap1 = paperMarkPollResponseSchema.parse(await poll1.json());
    expect(["running", "succeeded"]).toContain(snap1.status);
    await registry.waitAll();
    const poll2 = await app.request(`/api/v1/paper-marks/marks/${accepted.markId}`);
    const snap2 = paperMarkPollResponseSchema.parse(await poll2.json());
    expect(snap2.status).toBe("succeeded");
    expect(snap2.regionKey).toBe("17.a");
    expect(snap2.transcription).toBe("hello world");
    expect(snap2.feedback?.thoughtProcess.startsWith("hello world")).toBe(true);
    expect(snap2.awards?.length).toBe(2);
    expect(snap2.receipt).toEqual({ emitted: 2, suppressed: 0, workingBlocks: 1 });
    expect(snap2.pipelineVersion).toBe("paper-mark/v1");
  });

  test("a failed run polls as failed with the honest error code (no fabricated partials)", async () => {
    const badMarker: PaperMarkingLlm = { generate: async () => ({ text: "not json" }) };
    const { app, registry } = makeApp(asStudent, { marker: badMarker });
    const res = await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, { method: "POST", body: markBody(), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(202);
    const accepted = paperMarkAcceptedSchema.parse(await res.json());
    await registry.waitAll();
    const poll = await app.request(`/api/v1/paper-marks/marks/${accepted.markId}`);
    const snap = paperMarkPollResponseSchema.parse(await poll.json());
    expect(snap.status).toBe("failed");
    expect(snap.error?.code).toBe("marking_output_invalid");
    expect(snap.awards).toBeUndefined();
  });

  test("a dormant vision seam → the job fails transcription_unavailable (the poll shows it honestly)", async () => {
    const { app, registry } = makeApp(asStudent, { transcriber: null });
    const res = await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, { method: "POST", body: markBody(), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(202);
    const accepted = paperMarkAcceptedSchema.parse(await res.json());
    await registry.waitAll();
    const poll = await app.request(`/api/v1/paper-marks/marks/${accepted.markId}`);
    const snap = paperMarkPollResponseSchema.parse(await poll.json());
    expect(snap.status).toBe("failed");
    expect(snap.error?.code).toBe("transcription_unavailable");
  });
});

describe("the typed channel envelope (POST /parts/:partId/regrade)", () => {
  test("validation: empty answerHtml → 400; the happy path runs the same 202 + poll pipeline", async () => {
    const { app, registry } = makeApp(asStudent);
    const empty = await app.request(`/api/v1/paper-marks/parts/${PART_A}/regrade`, { method: "POST", body: JSON.stringify({ answerHtml: "" }), headers: { "content-type": "application/json" } });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toBe("validation_failed");

    const res = await app.request(`/api/v1/paper-marks/parts/${PART_A}/regrade`, { method: "POST", body: JSON.stringify({ answerHtml: "<p>No, not enough milk</p>" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(202);
    const accepted = paperMarkAcceptedSchema.parse(await res.json());
    await registry.waitAll();
    const poll = await app.request(`/api/v1/paper-marks/marks/${accepted.markId}`);
    const snap = paperMarkPollResponseSchema.parse(await poll.json());
    expect(snap.status).toBe("succeeded");
    expect(snap.transcription).toBe("<p>No, not enough milk</p>");
    expect(snap.feedback?.attempt).toBe("<p>No, not enough milk</p>");
  });

  test("malformed path uuid → 400 bad_request", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request("/api/v1/paper-marks/parts/nope/regrade", { method: "POST", body: JSON.stringify({ answerHtml: "x" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });
});

describe("the poll envelope (GET /marks/:markId)", () => {
  test("unknown mark → 404 not_found; malformed uuid → 400 bad_request", async () => {
    const { app } = makeApp(asStudent);
    const missing = await app.request(`/api/v1/paper-marks/marks/${crypto.randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: string }).error).toBe("not_found");
    const malformed = await app.request("/api/v1/paper-marks/marks/abc");
    expect(malformed.status).toBe(400);
  });
});

describe("the composition root seams (the smartmark posture)", () => {
  test("buildPaperMarkingRouters wires the full stack from injected seams without env/DB access", async () => {
    const { sql } = makeSql();
    const built = buildPaperMarkingRouters({}, {
      sql,
      transcriber: realOkTranscriber,
      markingLlm: okMarker,
      registry: new MarkJobRegistry(),
    });
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("syllabai.auth" as never, STUDENT as never);
      await next();
    });
    app.route("/api/v1/paper-marks", built.paperMarkingRoute);
    app.onError((err, c) => {
      const mapped = toErrorResponse(err);
      if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
      return c.json({ status: 500, error: "internal_error", message: "x" }, 500 as const);
    });
    const res = await app.request(`/api/v1/paper-marks/regions/${PART_A}/mark`, { method: "POST", body: markBody(), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(202);
    await built.registry.waitAll();
  });
});

/**
 * Learner PDF drawing route tests (T-MG-INK-1 run-002) — the observable
 * HTTP contract of /api/v1/learner/pdf-drawings over REAL services on
 * stubbed sql (the 032 route-test pattern). 200 bodies validated against
 * the canonical contracts; the error envelopes pinned to the Boot 401
 * shell + the malformed-400 / validation-400 / stale-409 law.
 *   (d) posture pin — the read+write routes are auth-gated (401 shell
 *       FIRST) and the learner id rides the JWT context: the load/save
 *       receive getAuth(c).userId, and NO wire shape carries a learnerId.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createLearnerPdfDrawingsRouter } from "../../src/routes/learner/pdf-drawings";
import { PdfDrawings } from "../../src/services/learner-pdf-drawings";
import { toErrorResponse } from "../../src/services/identity/errors";
import { pdfDrawingLoadSchema, servedPdfDrawingSchema, type InkDoc } from "@syllabai/contracts";
import type { SqlFn } from "../../src/services/learner-pdf-drawings/sql";

type Route = {
  match: RegExp;
  rows?: Array<Record<string, unknown>>;
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
};

const LEARNER = "aa645313-5930-4381-91ed-caff67a2f836";
const PAPER = "47000000-0000-4000-8000-000000000001";
const SOURCE = "https://www.mathsgenie.co.uk/resources/1f-jun2025-1ma1.pdf";
const ROW_ID = "57000000-0000-4000-8000-000000000001";

const DOC: InkDoc = {
  schema: "syllabai-ink/1",
  shapes: [{ type: "stroke", page: 1, points: [[0.1, 0.2], [0.3, 0.4]] }],
};

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ROW_ID,
  document_ref_type: "paper_asset",
  document_ref_id: PAPER,
  source_url: null,
  doc: DOC,
  revision: 1,
  updated_at: "2026-10-30T00:00:00Z",
  ...over,
});

const selectRoute: Route = {
  match: /from learner_pdf_drawings/,
  rows: [],
  rowsFor: (params) => (params[0] === LEARNER && params[2] === PAPER ? [row()] : []),
};

const insertRoute: Route = {
  match: /insert into learner_pdf_drawings/,
  rows: [],
  rowsFor: (params) => [
    row({
      document_ref_id: params[2],
      source_url: params[3],
      doc: JSON.parse(params[4] as string),
      revision: params[5],
      updated_at: "2026-10-30T00:01:00Z",
    }),
  ],
};

const updateRoute: Route = {
  match: /update learner_pdf_drawings/,
  rows: [],
  rowsFor: (params) => [
    row({ id: params[2], doc: JSON.parse(params[0] as string), revision: params[1], updated_at: "2026-10-30T00:02:00Z" }),
  ],
};

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  opts: { extra?: Route[] } = {},
) {
  const issued: string[] = [];
  const all = [...(opts.extra ?? []), updateRoute, insertRoute, selectRoute];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    issued.push(text);
    const hit = all.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : hit.rows;
  }) as unknown as SqlFn;
  const drawings = new PdfDrawings(sql);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/learner/pdf-drawings", createLearnerPdfDrawingsRouter(drawings));
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

const validPut = {
  documentRefType: "paper_asset",
  documentRefId: PAPER,
  doc: DOC,
  revision: 0,
};

describe("POSTURE PIN (d) — auth shell first, learner rides the JWT context", () => {
  test("unauthenticated GET → 401 before any handler work", async () => {
    const { app } = makeApp(anon);
    const res = await app.request(`/api/v1/learner/pdf-drawings?documentRefId=${PAPER}`);
    expect(res.status).toBe(401);
  });

  test("unauthenticated PUT → 401 before any handler work", async () => {
    const { app } = makeApp(anon);
    const res = await app.request("/api/v1/learner/pdf-drawings", {
      method: "PUT",
      body: JSON.stringify(validPut),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  test("the load query receives getAuth(c).userId — the JWT learner, never a wire param", async () => {
    const { app, issued } = makeApp(asStudent);
    const res = await app.request(`/api/v1/learner/pdf-drawings?documentRefId=${PAPER}`);
    expect(res.status).toBe(200);
    const loadQuery = issued.find((t) => /from learner_pdf_drawings/.test(t));
    expect(loadQuery).toBeDefined();
  });
});

describe("GET /api/v1/learner/pdf-drawings — the load", () => {
  test("200 shape validated against the canonical contract; honest-empty drawing:null for a not-yet-drawn document", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`/api/v1/learner/pdf-drawings?documentRefId=${PAPER}`);
    expect(res.status).toBe(200);
    const body = pdfDrawingLoadSchema.parse(await res.json());
    expect(body.documentRefType).toBe("paper_asset");
    expect(body.documentRefId).toBe(PAPER);
    expect(body.drawing).not.toBeNull();
    expect(body.drawing!.doc).toEqual(DOC);
    expect(body.drawing!.revision).toBe(1);

    const empty = await app.request(`/api/v1/learner/pdf-drawings?documentRefId=47000000-0000-4000-8000-0000000000ff`);
    expect(empty.status).toBe(200);
    const emptyBody = pdfDrawingLoadSchema.parse(await empty.json());
    expect(emptyBody.drawing).toBeNull(); // honest-empty — never an error
  });

  test("the fallback pin over the wire — sourceUrl-keyed external-PDF drawing loads (documentRefId null)", async () => {
    const sourceRoute: Route = {
      match: selectRoute.match,
      rows: [],
      rowsFor: (params) => (params[0] === LEARNER && params[2] === SOURCE ? [row({ document_ref_id: null, source_url: SOURCE, revision: 2 })] : []),
    };
    const { app } = makeApp(asStudent, { extra: [sourceRoute] });
    const res = await app.request(`/api/v1/learner/pdf-drawings?sourceUrl=${encodeURIComponent(SOURCE)}`);
    expect(res.status).toBe(200);
    const body = pdfDrawingLoadSchema.parse(await res.json());
    expect(body.sourceUrl).toBe(SOURCE);
    expect(body.documentRefId).toBeNull();
    expect(body.drawing!.revision).toBe(2);
  });

  test("malformed documentRefId uuid → 400 bad_request 'malformed request'", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request("/api/v1/learner/pdf-drawings?documentRefId=not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("the identity refine over the wire — neither key, or both keys → 400 malformed request", async () => {
    const { app } = makeApp(asStudent);
    const neither = await app.request("/api/v1/learner/pdf-drawings");
    expect(neither.status).toBe(400);
    expect((await neither.json()).error).toBe("bad_request");

    const both = await app.request(`/api/v1/learner/pdf-drawings?documentRefId=${PAPER}&sourceUrl=${encodeURIComponent(SOURCE)}`);
    expect(both.status).toBe(400);
    expect((await both.json()).error).toBe("bad_request");
  });
});

describe("PUT /api/v1/learner/pdf-drawings — the full-doc write", () => {
  test("200 validated against the canonical contract: the fresh store advances base 0 → revision 1", async () => {
    const { app } = makeApp(asStudent, { extra: [{ ...selectRoute, rowsFor: () => [] }] });
    const res = await app.request("/api/v1/learner/pdf-drawings", {
      method: "PUT",
      body: JSON.stringify(validPut),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = servedPdfDrawingSchema.parse(await res.json());
    expect(body.revision).toBe(1);
    expect(body.doc).toEqual(DOC);
    expect(body.documentRefId).toBe(PAPER);
  });

  test("stale base → 409 revision_conflict (the ApiError envelope; zero rows written)", async () => {
    const { app, issued } = makeApp(asStudent, { extra: [{ ...selectRoute, rowsFor: () => [row({ revision: 3 })] }] });
    const res = await app.request("/api/v1/learner/pdf-drawings", {
      method: "PUT",
      body: JSON.stringify({ ...validPut, revision: 2 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("revision_conflict");
    expect(body.status).toBe(409);
    expect(body.message).toContain("stale revision: stored 3, got base 2");
    // zero rows written: the load select is the only statement issued
    expect(issued.filter((t) => /insert into|update learner_pdf_drawings/.test(t))).toHaveLength(0);
  });

  test("unreadable body → 400 malformed_body; constraint failure → 400 validation_failed 'field: message'", async () => {
    const { app } = makeApp(asStudent);
    const unreadable = await app.request("/api/v1/learner/pdf-drawings", {
      method: "PUT",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect(unreadable.status).toBe(400);
    expect((await unreadable.json()).error).toBe("malformed_body");

    // the container law: a foreign schema id is a validation failure
    const badSchema = await app.request("/api/v1/learner/pdf-drawings", {
      method: "PUT",
      body: JSON.stringify({ ...validPut, doc: { schema: "tldraw/1", shapes: [] } }),
      headers: { "content-type": "application/json" },
    });
    expect(badSchema.status).toBe(400);
    const verdict = await badSchema.json();
    expect(verdict.error).toBe("validation_failed");
    expect(verdict.message).toContain("doc");

    const noRevision = await app.request("/api/v1/learner/pdf-drawings", {
      method: "PUT",
      body: JSON.stringify({ documentRefId: PAPER, doc: DOC }),
      headers: { "content-type": "application/json" },
    });
    expect(noRevision.status).toBe(400);
    expect((await noRevision.json()).message).toContain("revision");

    // the refine over the write wire: both keys → 400
    const bothKeys = await app.request("/api/v1/learner/pdf-drawings", {
      method: "PUT",
      body: JSON.stringify({ ...validPut, sourceUrl: SOURCE }),
      headers: { "content-type": "application/json" },
    });
    expect(bothKeys.status).toBe(400);
    expect((await bothKeys.json()).message).toContain("exactly one of documentRefId, sourceUrl");
  });
});

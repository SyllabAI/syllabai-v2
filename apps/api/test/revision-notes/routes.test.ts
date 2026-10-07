/**
 * T-MIG-082/083 ROUTE tests (r1c mount band) — the observable HTTP contract
 * of RevisionNoteLearnerController (:24-69) and RevisionNoteAdminController
 * (:24-52) @ 6cad6ef over IN-MEMORY Hono apps. Layout mirrors the 079 band
 * (test/learner/kg-routes.test.ts) + the sme route tests (test/sme/
 * routes.test.ts): the route layer over the REAL 053-t3 services with
 * stubbed sql (fakeSql / txSql from this module's helpers — no Neon).
 *
 * Pinned here (the route-layer law the service pins do NOT cover):
 *   - the authz shells: learner = anyRequest().authenticated() (Boot 401
 *     body with the request path); admin = hasRole("ADMIN") (Boot 403
 *     Forbidden for authenticated non-admins — LEARNER and TEACHER both);
 *   - every 200 body parses against the CANONICAL @syllabai/contracts
 *     response schemas (strict — parse throws on any drift);
 *   - the asset blob leg: stored Content-Type + the private 1-hour
 *     cache-control envelope (the route layer's frozen :52-53 law);
 *   - the views-body two-envelope classifier (the learnerme law): missing
 *     noteId → validation_failed "noteId: must not be null", over-80 →
 *     "noteId: size must be between 0 and 80" (jakarta @Size default),
 *     non-object / wrong-type / unreadable → malformed_body;
 *   - the admin multipart envelope: missing/empty/non-multipart "file" →
 *     the guard 400 (sibling-shaped, DISCLOSED — see routes/revisionnotes.ts
 *     header), 413 over the 64 MB cap, and the SERVICE's verbatim 400
 *     vocabulary through the route (unsupported package_version);
 *   - static-path precedence: /progress (and /progress/views, /assets/*)
 *     never fall into /:noteId (the GET /progress happy path IS the pin).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createLearnerRevisionNotesRouter,
  createAdminRevisionNotesRouter,
} from "../../src/routes/revisionnotes";
import { RevisionNoteIngestService } from "../../src/services/revision-notes/ingest";
import type { TxSqlFn } from "../../src/services/sme";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  revisionNotesIndexViewSchema,
  revisionNoteBodyViewSchema,
  revisionNoteProgressViewSchema,
  revisionNoteViewedViewSchema,
  revisionNoteIngestSummarySchema,
  revisionNoteStatusViewSchema,
} from "@syllabai/contracts";
import type { Route } from "../assessment/helpers";
import { buildZip, clock, fakeSql, ingestRoutes, learnerRoutes, pkg, txSql, USER } from "./helpers";

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + boundary) ─

type AuthFn = (c: Context) => Record<string, unknown> | null;

const LEARNER_AUTH = {
  email: "student@example.edu",
  userId: USER,
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const asStudent: AuthFn = () => LEARNER_AUTH;
const anon: AuthFn = () => null;

function makeLearnerApp(auth: AuthFn, routes: Route[]) {
  const sql = fakeSql(routes);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/learners/me/revision-notes", createLearnerRevisionNotesRouter({ sql, clock }));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
  });
  return { app, sql };
}

function makeAdminApp(auth: AuthFn, routes: Route[]) {
  const sql = txSql(routes);
  const queries = () => (sql as TxSqlFn & { queries: string[] }).queries;
  const ingest = new RevisionNoteIngestService(sql, clock);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/admin/revision-notes", createAdminRevisionNotesRouter({ ingest }));
  return { app, queries };
}

/** buildZip returns a plain Uint8Array; the File constructor wants a
 *  definite ArrayBuffer view (bun-types strictness). */
const zipFile = (parts: ReturnType<typeof PKG_ZIP_PARTS>) =>
  new File([buildZip(parts) as unknown as BlobPart], "corpus.zip");

const asRole = (role: string): AuthFn => () => ({
  email: "u@example.invalid",
  userId: "60000000-0000-4000-8000-000000000001",
  roles: [role],
  tokenVersion: 0,
});

const ADMIN = asRole("ADMIN");

// ── the corpus package zip fixtures (the ingest.test.ts parts) ──────────────

const PKG_ZIP_PARTS = (overrides: Record<string, unknown> = {}) => [
  { name: "package.json", data: new TextEncoder().encode(JSON.stringify(pkg(overrides))) },
  { name: "assets/fig-1.png", data: new Uint8Array([1]) },
];

// ═══ T-MIG-082 — the learner wire ════════════════════════════════════════════

describe("GET /api/v1/learners/me/revision-notes — authz shell", () => {
  test("anonymous: Boot 401 body with the request path on every route (5/5)", async () => {
    const { app } = makeLearnerApp(anon, learnerRoutes());
    for (const [method, path] of [
      ["GET", "/api/v1/learners/me/revision-notes"],
      ["GET", "/api/v1/learners/me/revision-notes/2.31-ph"],
      ["GET", "/api/v1/learners/me/revision-notes/assets/fig-1.png"],
      ["GET", "/api/v1/learners/me/revision-notes/progress"],
      ["POST", "/api/v1/learners/me/revision-notes/progress/views"],
    ] as const) {
      const res = await app.request(path, {
        method,
        ...(method === "POST" ? { body: JSON.stringify({ noteId: "2.31-ph" }) } : {}),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { status: number; error: string; path: string };
      expect(body.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe(path);
    }
  });
});

describe("GET /api/v1/learners/me/revision-notes — the index", () => {
  test("student: 200, canonical-schema-valid, the tree + viewed markers", async () => {
    const { app } = makeLearnerApp(
      asStudent,
      learnerRoutes({
        viewed: [
          { note_id: "2.31-ph", viewed_at: "2026-10-05T10:00:00Z" },
          { note_id: "2.31-strong-acids", viewed_at: "2026-10-04T10:00:00Z" },
        ],
      }),
    );
    const res = await app.request("/api/v1/learners/me/revision-notes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(() => revisionNotesIndexViewSchema.parse(body)).not.toThrow();
    expect(body.corpusVersion).toBe("4CH1-notes-2026-09");
    expect(body.ingestedAt).toBe("2026-10-05T09:00:00.000Z");
    const topics = body.topics as Array<Record<string, unknown>>;
    expect(topics.length).toBe(1);
    const subs = topics[0]!.subtopics as Array<Record<string, unknown>>;
    expect(subs.map((s) => s.title)).toEqual(["Acids and bases", "Salt preparations"]);
    expect(subs[0]!.noteCount).toBe(2);
    expect((subs[0]!.notes as Array<Record<string, unknown>>).map((n) => n.noteId)).toEqual([
      "2.31-ph",
      "2.31-strong-acids",
    ]);
    expect((body.viewed as Array<Record<string, unknown>>).map((v) => v.noteId)).toEqual([
      "2.31-ph",
      "2.31-strong-acids",
    ]);
  });

  test("un-ingested corpus: honest nulls + empty arrays (the service early return)", async () => {
    const { app, sql } = makeLearnerApp(asStudent, learnerRoutes({ notes: [] }));
    const res = await app.request("/api/v1/learners/me/revision-notes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(() => revisionNotesIndexViewSchema.parse(body)).not.toThrow();
    expect(body).toEqual({ corpusVersion: null, ingestedAt: null, topics: [], viewed: [] });
    expect(sql.queries.length).toBe(1); // the viewed leg is never queried
  });
});

describe("GET /api/v1/learners/me/revision-notes/progress — static precedence + the ring", () => {
  test("student: 200 schema-valid, newest-first — and NOT captured by /:noteId", async () => {
    const { app } = makeLearnerApp(
      asStudent,
      learnerRoutes({
        viewed: [
          { note_id: "n2", viewed_at: "2026-10-05T10:00:00Z" },
          { note_id: "n1", viewed_at: "2026-10-04T10:00:00Z" },
        ],
      }),
    );
    const res = await app.request("/api/v1/learners/me/revision-notes/progress");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(() => revisionNoteProgressViewSchema.parse(body)).not.toThrow();
    expect((body.viewed as Array<Record<string, unknown>>).map((v) => v.noteId)).toEqual(["n2", "n1"]);
  });
});

describe("GET /api/v1/learners/me/revision-notes/{noteId} — the body", () => {
  test("student: 200 canonical-schema-valid with canonical prev/next", async () => {
    const { app } = makeLearnerApp(asStudent, learnerRoutes());
    const first = await app.request("/api/v1/learners/me/revision-notes/2.31-ph");
    expect(first.status).toBe(200);
    const body = (await first.json()) as Record<string, unknown>;
    expect(() => revisionNoteBodyViewSchema.parse(body)).not.toThrow();
    expect(body.noteId).toBe("2.31-ph");
    expect(body.prevNoteId).toBeNull();
    expect(body.nextNoteId).toBe("2.31-strong-acids");
    expect(body.specMapJson).toBe('{"4CH1-2.31":"recall"}'); // TEXT passthrough
    expect(body.assets).toEqual(["fig-1.png", "fig-2.png"]); // distinct, first-seen
    const last = await app.request("/api/v1/learners/me/revision-notes/2.32-salts");
    const lastBody = (await last.json()) as Record<string, unknown>;
    expect(lastBody.prevNoteId).toBe("2.31-strong-acids");
    expect(lastBody.nextNoteId).toBeNull();
  });

  test("unknown noteId: 404 not_found with the verbatim message", async () => {
    const { app } = makeLearnerApp(asStudent, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/no-such-note");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { status: number; error: string; message: string };
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("revision note no-such-note not found");
  });
});

describe("GET /api/v1/learners/me/revision-notes/assets/{filename} — the blob leg", () => {
  test("student: 200 bytes + stored Content-Type + the private 1h cache-control", async () => {
    const { app } = makeLearnerApp(asStudent, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/assets/fig-1.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4, 5]);
  });

  test("unknown filename: 404 not_found with the verbatim message", async () => {
    const { app } = makeLearnerApp(asStudent, learnerRoutes({ asset: [] }));
    const res = await app.request("/api/v1/learners/me/revision-notes/assets/ghost.png");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("revision note asset ghost.png not found");
  });
});

describe("POST /api/v1/learners/me/revision-notes/progress/views — markViewed", () => {
  test("fresh view: 200 with the marker (schema-valid), the clock-stamped insert", async () => {
    const { app, sql } = makeLearnerApp(asStudent, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      body: JSON.stringify({ noteId: "2.31-ph" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(() => revisionNoteViewedViewSchema.parse(body)).not.toThrow();
    expect(body).toEqual({ noteId: "2.31-ph", viewedAt: "2026-10-06T10:00:00.000Z" });
    expect(sql.queries.filter((q) => q.startsWith("insert into")).length).toBe(1);
  });

  test("idempotent first-view-wins: the existing marker is returned untouched, NO insert", async () => {
    const { app, sql } = makeLearnerApp(
      asStudent,
      learnerRoutes({
        existingViewed: [{ note_id: "2.31-ph", viewed_at: "2026-10-05T08:00:00Z" }],
      }),
    );
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      body: JSON.stringify({ noteId: "2.31-ph" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ noteId: "2.31-ph", viewedAt: "2026-10-05T08:00:00.000Z" });
    expect(sql.queries.some((q) => q.startsWith("insert into"))).toBe(false);
  });

  test("unknown note: 404 verbatim BEFORE the viewed table is touched", async () => {
    const { app, sql } = makeLearnerApp(asStudent, learnerRoutes({ noteExists: [] }));
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      body: JSON.stringify({ noteId: "ghost" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("revision note ghost not found");
    expect(sql.queries.length).toBe(1); // the 404-first note lookup only
  });

  test("missing noteId: 400 validation_failed 'noteId: must not be null'", async () => {
    const { app, sql } = makeLearnerApp(asStudent, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { status: number; error: string; message: string };
    expect(body.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("noteId: must not be null");
    expect(sql.queries.length).toBe(0); // the 400 short-circuits before any query
  });

  test("noteId over the @Size(80) bound: 400 validation_failed with the jakarta default", async () => {
    const { app, sql } = makeLearnerApp(asStudent, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      body: JSON.stringify({ noteId: "x".repeat(81) }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("noteId: size must be between 0 and 80");
    expect(sql.queries.length).toBe(0);
  });

  test("non-object body: 400 malformed_body (the binding class)", async () => {
    const { app, sql } = makeLearnerApp(asStudent, learnerRoutes());
    for (const raw of ["[1,2]", "\"str\"", "123", "null"]) {
      const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
        method: "POST",
        body: raw,
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("malformed_body");
    }
    expect(sql.queries.length).toBe(0);
  });

  test("numeric noteId: 400 malformed_body (present-but-wrong type cannot reach bean validation)", async () => {
    const { app, sql } = makeLearnerApp(asStudent, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      body: JSON.stringify({ noteId: 5 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("malformed_body");
    expect(sql.queries.length).toBe(0);
  });
});

// ═══ T-MIG-083 — the admin wire ══════════════════════════════════════════════

describe("POST|GET /api/v1/admin/revision-notes — the ADMIN-only authz shell", () => {
  test("anonymous: Boot 401 body with the request path on both surfaces", async () => {
    const { app } = makeAdminApp(anon, ingestRoutes());
    for (const [method, path] of [
      ["GET", "/api/v1/admin/revision-notes/status"],
      ["POST", "/api/v1/admin/revision-notes/ingest"],
    ] as const) {
      const res = await app.request(path, {
        method,
        ...(method === "POST" ? { body: new FormData() } : {}),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { status: number; error: string; path: string };
      expect(body.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe(path);
    }
  });

  test("LEARNER token → 403 Forbidden Boot body (non-admin is the captured sibling posture)", async () => {
    const { app } = makeAdminApp(asRole("LEARNER"), ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/status");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden");
  });

  test("TEACHER token → 403 Forbidden Boot body (admin-only is the truth)", async () => {
    const { app } = makeAdminApp(asRole("TEACHER"), ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", { method: "POST", body: new FormData() });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden");
  });
});

describe("GET /api/v1/admin/revision-notes/status — the REAL service over the route", () => {
  test("ADMIN: 200 schema-valid, the live corpus snapshot", async () => {
    const { app } = makeAdminApp(ADMIN, ingestRoutes({ noteCount: [{ n: 3 }] }));
    const res = await app.request("/api/v1/admin/revision-notes/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(() => revisionNoteStatusViewSchema.parse(body)).not.toThrow();
    expect(body).toEqual({
      ingested: true,
      notes: 3,
      assets: 1,
      ingestedAt: "2026-10-05T09:00:00.000Z",
      corpusVersion: "4CH1-notes-2026-09",
    });
  });

  test("ADMIN: the un-ingested corpus reads honest nulls (200)", async () => {
    const { app } = makeAdminApp(
      ADMIN,
      ingestRoutes({ noteCount: [{ n: 0 }], assetCount: [{ n: 0 }], anyNote: [] }),
    );
    const res = await app.request("/api/v1/admin/revision-notes/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(() => revisionNoteStatusViewSchema.parse(body)).not.toThrow();
    expect(body).toEqual({ ingested: false, notes: 0, assets: 0, ingestedAt: null, corpusVersion: null });
  });
});

describe("POST /api/v1/admin/revision-notes/ingest — the multipart envelope + the verbatim 400s", () => {
  test("ADMIN happy path: 200 IngestSummary through the REAL service (schema-valid)", async () => {
    const { app } = makeAdminApp(ADMIN, ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.set("file", zipFile(PKG_ZIP_PARTS()));
        return form;
      })(),
    });
    expect(res.status).toBe(200); // ResponseEntity.ok, NOT 201
    const body = (await res.json()) as Record<string, unknown>;
    expect(() => revisionNoteIngestSummarySchema.parse(body)).not.toThrow();
    expect(body).toEqual({ topics: 1, subtopics: 1, notes: 1, assets: 1, replaced: false });
  });

  test("the SERVICE's verbatim 400 through the route: unsupported package_version", async () => {
    const { app } = makeAdminApp(ADMIN, ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.set("file", zipFile(PKG_ZIP_PARTS({ packageVersion: "9.9" })));
        return form;
      })(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { status: number; error: string; message: string };
    expect(body.status).toBe(400);
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("unsupported revision-notes package_version (expected 1.0)");
  });

  test("missing 'file' part → the guard 400; the service is never reached", async () => {
    const { app, queries } = makeAdminApp(ADMIN, ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      body: new FormData(), // multipart but no 'file' part
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("multipart part 'file' (the revision-notes package) is required");
    expect(queries().length).toBe(0); // no write path reached
  });

  test("EMPTY 'file' part → the same guard 400 (file.isEmpty() law)", async () => {
    const { app, queries } = makeAdminApp(ADMIN, ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.set("file", new File([], "empty.zip"));
        return form;
      })(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("multipart part 'file' (the revision-notes package) is required");
    expect(queries().length).toBe(0);
  });

  test("non-multipart body → the same honest 400 (sibling binding-class disclosure)", async () => {
    const { app, queries } = makeAdminApp(ADMIN, ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anything: true }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("multipart part 'file' (the revision-notes package) is required");
    expect(queries().length).toBe(0);
  });

  test("compressed upload beyond the 64 MB cap → 413 payload_too_large", async () => {
    const { app, queries } = makeAdminApp(ADMIN, ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.set("file", new File([new Uint8Array(64 * 1024 * 1024 + 1)], "big.zip"));
        return form;
      })(),
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("payload_too_large");
    expect(body.message).toBe("request body exceeds the allowed size");
    expect(queries().length).toBe(0);
  });
});

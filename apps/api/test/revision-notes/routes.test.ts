/**
 * T-MIG-082 tranche-1 route tests (r4b) — the observable HTTP contract of
 * RevisionNoteLearnerController (@RequestMapping /api/v1/learners/me/
 * revision-notes, frozen :24-69) and RevisionNoteAdminController
 * (/api/v1/admin/revision-notes, frozen :24-52), over an IN-MEMORY Hono
 * app wiring the REAL T-MIG-053 tranche-3 services over the shared
 * fixtures (test/revision-notes/helpers.ts — the fleet's cross-module
 * test-helper precedent), no Neon.
 *
 * Pinned laws:
 *   - the authz shells: learner paths answer the Boot 401 body with the
 *     request path for anonymous callers BEFORE any handler work; the
 *     admin pair answers 401 anon / 403 authenticated-non-ADMIN (the
 *     SecurityConfig hasRole("ADMIN") M5 shell, the sme.ts precedent);
 *   - the asset blob leg: Content-Type + the frozen
 *     CacheControl.maxAge(1, HOURS).cachePrivate() rendering
 *     "max-age=3600, private" (:48-55);
 *   - the markViewed body law (MarkNoteViewedRequest :53 — @Size(max = 80),
 *     NOT @NotBlank): {"noteId": null} and {} bind noteId=null and REACH
 *     the service, whose 404-first lookup answers "revision note null not
 *     found" (RevisionNoteService :104-107); 81 chars → 400
 *     validation_failed "noteId: size must be between 0 and 80"; an
 *     unreadable body → 400 bad_request "request body is not readable
 *     (check field types and enum values)" (GlobalExceptionHandler :175-180);
 *     the happy path returns 204 NO CONTENT (the controller discards the
 *     ViewedView, ResponseEntity.noContent);
 *   - the multipart law (the sme.ts precedent, verbatim): a missing/empty
 *     "file" part → 400 "multipart part 'file' (the corpus ZIP) is
 *     required"; the happy path drives the REAL ingest over a real ZIP
 *     (buildZip) and validates the summary against the canonical
 *     @syllabai/contracts schema.
 *
 * 200 bodies are validated against the CANONICAL contracts schemas
 * (revision-notes.ts — index/body/progress/summary/status, pre-ratified,
 * zero new wire). Determinism: the shared fixed clock (ADR-031).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createAdminRevisionNotesRouter,
  createLearnerRevisionNotesRouter,
} from "../../src/routes/revision-notes";
import {
  revisionNotesIndexViewSchema,
  revisionNoteBodyViewSchema,
  revisionNoteProgressViewSchema,
  revisionNoteIngestSummarySchema,
  revisionNoteStatusViewSchema,
} from "@syllabai/contracts";
import { toErrorResponse } from "../../src/services/identity/errors";
import type { RevisionNotesDeps } from "../../src/routes/revision-notes";
import {
  buildZip,
  clock,
  ingestRoutes,
  learnerRoutes,
  pkg,
  txSql,
  USER,
} from "./helpers";

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + boundary) ─

type AuthFn = (c: Context) => Record<string, unknown> | null;

function makeApp(auth: AuthFn, routes: ReturnType<typeof learnerRoutes>) {
  const deps: RevisionNotesDeps = { sql: txSql(routes), clock };
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/learners/me/revision-notes", createLearnerRevisionNotesRouter(deps));
  app.route("/api/v1/admin/revision-notes", createAdminRevisionNotesRouter(deps));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return { app, deps };
}

const LEARNER_AUTH = {
  email: "student@example.edu",
  userId: USER,
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const ADMIN_AUTH = {
  email: "admin@example.edu",
  userId: "f1000000-0000-4000-8000-0000000000aa",
  roles: ["ADMIN"],
  tokenVersion: 1,
};
const asLearner = () => LEARNER_AUTH;
const asAdmin = () => ADMIN_AUTH;
const asStudent = () => LEARNER_AUTH;
const anon = () => null;

// ── the learner surface (5 endpoints) ────────────────────────────────────────

describe("learner revision-notes — authz + reads", () => {
  test("anonymous: Boot 401 body with the request path, before any work", async () => {
    const { app } = makeApp(anon, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/learners/me/revision-notes");
    expect(typeof body.timestamp).toBe("string");
  });

  test("GET '' — the full tree + the caller's viewed markers (200, canonical schema)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = revisionNotesIndexViewSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    // the corpus ids ride the canonical order (the driver returns them ordered)
    expect(body.topics[0].title).toBe("Inorganic chemistry");
  });

  test("GET /{noteId} — one body with prev/next (200, canonical schema)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/2.31-ph");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = revisionNoteBodyViewSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.noteId).toBe("2.31-ph");
    expect(body.prevNoteId).toBeNull(); // first in canonical order
    expect(body.nextNoteId).toBe("2.31-strong-acids");
    expect(body.assets).toEqual(["fig-1.png", "fig-2.png"]); // fig-1 repeats — DISTINCT
  });

  test("GET /{noteId} unknown — 404 not_found 'revision note X not found' (the :89 law)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/no-such-note");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("revision note no-such-note not found");
  });

  test("GET /assets/{filename} — the blob leg with the private 1h cache headers", async () => {
    const { app } = makeApp(asLearner, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/assets/fig-1.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("max-age=3600, private");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4, 5]);
  });

  test("GET /assets/{filename} unknown — 404 'revision note asset X not found' (:98-99)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes({ asset: [] }));
    const res = await app.request("/api/v1/learners/me/revision-notes/assets/ghost.png");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("revision note asset ghost.png not found");
  });

  test("GET /progress — the ring input (200, canonical schema)", async () => {
    const { app } = makeApp(
      asLearner,
      learnerRoutes({ viewed: [{ note_id: "2.31-ph", viewed_at: "2026-10-05T09:00:00Z" }] }),
    );
    const res = await app.request("/api/v1/learners/me/revision-notes/progress");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = revisionNoteProgressViewSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.viewed[0].noteId).toBe("2.31-ph");
  });
});

describe("learner revision-notes — POST /progress/views laws", () => {
  test("happy path: 204 NO CONTENT (the controller discards the ViewedView)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "2.31-ph" }),
    });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  test("the null-tolerant @Size bind: {'noteId': null} REACHES the service → 404 'revision note null not found'", async () => {
    const { app } = makeApp(asLearner, learnerRoutes({ noteExists: [] }));
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: null }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("revision note null not found");
  });

  test("{} binds noteId=null identically (constraints skip null; the service 404s)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes({ noteExists: [] }));
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("revision note null not found");
  });

  test("81 chars → 400 validation_failed 'noteId: size must be between 0 and 80'", async () => {
    const { app } = makeApp(asLearner, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "x".repeat(81) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("noteId: size must be between 0 and 80");
  });

  test("unreadable body → 400 bad_request (GlobalExceptionHandler :175-180 verbatim)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes());
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });
});

// ── the admin surface (2 endpoints, the ADMIN shell) ─────────────────────────

describe("admin revision-notes — the ADMIN shell + ingest/status", () => {
  test("anonymous POST /ingest → Boot 401 (the M5 shell fires before the bind)", async () => {
    const { app } = makeApp(anon, ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", { method: "POST" });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  test("authenticated STUDENT → Boot 403 on both admin paths (hasRole('ADMIN'))", async () => {
    const { app } = makeApp(asStudent, ingestRoutes());
    const ingest = await app.request("/api/v1/admin/revision-notes/ingest", { method: "POST" });
    expect(ingest.status).toBe(403);
    expect((await ingest.json()).error).toBe("Forbidden");
    const status = await app.request("/api/v1/admin/revision-notes/status");
    expect(status.status).toBe(403);
    expect((await status.json()).error).toBe("Forbidden");
  });

  test("POST /ingest bodyless/non-multipart → 400 (the media-type refusal; fail-closed, uncaptured shape)", async () => {
    const { app } = makeApp(asAdmin, ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/ingest", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("multipart part 'file' (the corpus ZIP) is required");
  });

  test("POST /ingest multipart WITHOUT the 'file' part → the core's unhandled @RequestPart bind 500 (golden-captures/t-mig-083 leg-04 wire law of record)", async () => {
    const { app } = makeApp(asAdmin, ingestRoutes());
    const form = new FormData();
    form.set("note", "a part, but not the 'file' part");
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      body: form,
    });
    // the frozen core's @RequestPart bind throws MissingServletRequestPartException
    // BEFORE the controller body → unhandled → the GlobalExceptionHandler catch-all
    // 500 internal_error envelope, captured of record (r4b run-001, 6cad6ef).
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal_error");
    expect(body.message).toBe("an internal error occurred");
    expect(body.status).toBe(500);
  });

  test("POST /ingest with an EMPTY file part → the same 400 (file.isEmpty())", async () => {
    const { app } = makeApp(asAdmin, ingestRoutes());
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(0)], { type: "application/zip" }), "corpus.zip");
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("multipart part 'file' (the corpus ZIP) is required");
  });

  test("POST /ingest happy path — the REAL ingest over a real ZIP (200, canonical schema)", async () => {
    const capture = { notes: [] as unknown[][], assets: [] as unknown[][] };
    const { app } = makeApp(asAdmin, ingestRoutes({ noteCount: [{ n: 3 }] }, capture));
    const zip = buildZip([
      { name: "package.json", data: new TextEncoder().encode(JSON.stringify(pkg())) },
      { name: "assets/fig-1.png", data: new Uint8Array([9, 9, 9]) },
    ]);
    const form = new FormData();
    form.set("file", new Blob([zip as unknown as BlobPart], { type: "application/zip" }), "corpus.zip");
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = revisionNoteIngestSummarySchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body).toEqual({ topics: 1, subtopics: 1, notes: 1, assets: 1, replaced: true });
    expect(capture.notes.length).toBe(1);
    expect(capture.assets.length).toBe(1);
  });

  test("GET /status — what is live (200, canonical schema)", async () => {
    const { app } = makeApp(asAdmin, ingestRoutes({ noteCount: [{ n: 3 }] }));
    const res = await app.request("/api/v1/admin/revision-notes/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = revisionNoteStatusViewSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.ingested).toBe(true);
    expect(body.corpusVersion).toBe("4CH1-notes-2026-09");
  });

  test("GET /status on an un-ingested corpus — the honest-nulls law", async () => {
    const { app } = makeApp(asAdmin, ingestRoutes({ anyNote: [], assetCount: [{ n: 0 }] }));
    const res = await app.request("/api/v1/admin/revision-notes/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ingested).toBe(false);
    expect(body.notes).toBe(0);
    expect(body.assets).toBe(0);
    expect(body.ingestedAt).toBeNull();
    expect(body.corpusVersion).toBeNull();
  });
});

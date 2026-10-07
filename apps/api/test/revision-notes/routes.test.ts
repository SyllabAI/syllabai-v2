/**
 * T-MIG-082 tranche-A route tests (R0) — the observable HTTP contract of
 * RevisionNoteLearnerController (frozen :26-68 @ 6cad6ef) and
 * RevisionNoteAdminController (frozen :20-52), over an IN-MEMORY Hono app
 * wiring the REAL 053-t3 services (services/revision-notes/**) through the
 * shared helpers' fakeSql fixtures — the T-MIG-021/041/079 route-test
 * pattern, ZERO service edits.
 *
 * Pinned here (the WIRE laws the service tests cannot pin):
 *   - authz shells: the learner notes fall under anyRequest().authenticated()
 *     → anonymous 401 Boot body with the request path BEFORE any param law;
 *     the admin pair is /api/v1/admin/** hasRole("ADMIN") → anonymous 401,
 *     authenticated STUDENT 403 (the sme.ts capture postures);
 *   - the asset leg: 200 bytes + Content-Type from the STORED content_type
 *     column + Cache-Control "max-age=3600, private" (the frozen
 *     CacheControl.maxAge(1,HOURS).cachePrivate() rendering — max-age first,
 *     then private);
 *   - markViewed: 204 noContent on a fresh view; the IDEMPOTENT repeat is
 *     ALSO 204 (the service returns the existing marker; the frozen answers
 *     204 either way — "opening the same note twice never conflicts");
 *   - the markViewed body law: noteId is @Size(max=80) ONLY — a >80 noteId
 *     is 400 validation_failed "noteId: size must be between 0 and 80"
 *     BEFORE any sql; an ABSENT noteId binds null (constraints skip null)
 *     and dies honestly at the 404-first lookup ("revision note null not
 *     found"); a non-string noteId is a BIND failure → 400 malformed_body
 *     "request body is not readable (check field types and enum values)"
 *     (GlobalExceptionHandler :175-180); a non-JSON/empty body → the same
 *     malformed_body envelope;
 *   - unknown note/asset → 404 not_found with the verbatim service message;
 *   - admin ingest: missing/empty "file" part → 400 bad_request "multipart
 *     part 'file' (the corpus ZIP) is required" (the guard verbatim, the
 *     EXACT sme.ts law); a real ZIP happy path → 200 (ResponseEntity.ok —
 *     NOT 201) with the summary; admin status → 200 live snapshot.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createRevisionNoteLearnerRouter,
  createRevisionNoteAdminRouter,
  type RevisionNotesDeps,
} from "../../src/routes/revisionnotes";
import { toErrorResponse } from "../../src/services/identity/errors";
import type { SubmitClock } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";
import { learnerRoutes, ingestRoutes, clock, buildZip, txSql, USER } from "./helpers";
import { pkg } from "./helpers";

// ── fixed-constant ids ───────────────────────────────────────────────────────

const TEACHER_ID = "f2000000-0000-4000-8000-000000000001";
const ADMIN_ID = "f3000000-0000-4000-8000-000000000001";

const NOW = new Date("2026-10-06T10:00:00Z");
const testClock: SubmitClock = {
  newId: () => "7e571d00-0000-4000-8000-00000000000a",
  now: () => NOW,
};

type AuthFn = (c: Context) => Record<string, unknown> | null;

const asLearner = () => ({ email: "student@example.edu", userId: USER, roles: ["STUDENT"], tokenVersion: 1 });
const asAdmin = () => ({ email: "admin@example.edu", userId: ADMIN_ID, roles: ["ADMIN"], tokenVersion: 1 });
const asTeacher = () => ({ email: "t@example.edu", userId: TEACHER_ID, roles: ["TEACHER"], tokenVersion: 1 });

function makeApp(auth: AuthFn, learnerRoutes_: Route[], adminRoutes_: Route[]) {
  const deps: RevisionNotesDeps = {
    sql: fakeSql(learnerRoutes_) as unknown as RevisionNotesDeps["sql"],
    clock: testClock,
  };
  // the ingest service runs the replace-all INSIDE one transaction — the
  // admin deps need the tx-forwarding shim (txSql), not bare fakeSql
  const adminDeps: RevisionNotesDeps = {
    sql: txSql(adminRoutes_) as unknown as RevisionNotesDeps["sql"],
    clock: testClock,
  };
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/learners/me/revision-notes", createRevisionNoteLearnerRouter(deps));
  app.route("/api/v1/admin/revision-notes", createRevisionNoteAdminRouter(adminDeps));
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

const anon = () => null;
const boot401 = (path: string) => ({
  timestamp: expect.any(String),
  status: 401,
  error: "Unauthorized",
  path,
});

// ── the learner note surface (frozen :26-68) ─────────────────────────────────

describe("revision-notes learner router — shells and reads", () => {
  test("anonymous → the Boot 401 shell with the request path, BEFORE any param law", async () => {
    const { app } = makeApp(anon, learnerRoutes(), []);
    const res = await app.request("/api/v1/learners/me/revision-notes");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject(boot401("/api/v1/learners/me/revision-notes"));
  });

  test("GET / index → 200 tree + viewed markers over the REAL service", async () => {
    const { app } = makeApp(asLearner, learnerRoutes({
      viewed: [{ note_id: "2.31-ph", viewed_at: "2026-10-05T10:00:00Z" }],
    }), []);
    const res = await app.request("/api/v1/learners/me/revision-notes", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(200);
    const v = await res.json();
    expect(v.corpusVersion).toBe("4CH1-notes-2026-09");
    expect(v.topics[0].subtopics[0].notes.map((n: { noteId: string }) => n.noteId))
      .toEqual(["2.31-ph", "2.31-strong-acids"]);
    expect(v.viewed).toEqual([{ noteId: "2.31-ph", viewedAt: "2026-10-05T10:00:00.000Z" }]);
  });

  test("GET /:noteId body → 200 with prev/next + specMapJson passthrough; unknown → 404 verbatim", async () => {
    const { app } = makeApp(asLearner, learnerRoutes(), []);
    const ok = await app.request("/api/v1/learners/me/revision-notes/2.31-strong-acids", {
      headers: { Authorization: "Bearer x" },
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.prevNoteId).toBe("2.31-ph");
    expect(body.nextNoteId).toBe("2.32-salts");

    const miss = await app.request("/api/v1/learners/me/revision-notes/no-such-note", {
      headers: { Authorization: "Bearer x" },
    });
    expect(miss.status).toBe(404);
    expect(await miss.json()).toMatchObject({ status: 404, error: "not_found", message: "revision note no-such-note not found" });
  });

  test("GET /assets/:filename → 200 bytes + stored Content-Type + the private 1h cache law", async () => {
    const { app } = makeApp(asLearner, learnerRoutes(), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/assets/fig-1.png", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    // CacheControl.maxAge(1, HOURS).cachePrivate() — Spring renders
    // "max-age=3600, private" (max-age first, then private)
    expect(res.headers.get("cache-control")).toBe("max-age=3600, private");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  test("GET /assets/:filename unknown → 404 verbatim", async () => {
    const { app } = makeApp(asLearner, learnerRoutes({ asset: [] }), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/assets/escape.png", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ message: "revision note asset escape.png not found" });
  });

  test("GET /progress → 200 the ring input, newest first", async () => {
    const { app } = makeApp(asLearner, learnerRoutes({
      viewed: [{ note_id: "n2", viewed_at: "2026-10-05T10:00:00Z" }],
    }), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/progress", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewed: [{ noteId: "n2", viewedAt: "2026-10-05T10:00:00.000Z" }] });
  });
});

describe("revision-notes learner router — POST /progress/views laws", () => {
  test("a fresh view → 204 noContent (the frozen ResponseEntity.noContent law)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes(), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { Authorization: "Bearer x", "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "2.31-ph" }),
    });
    expect(res.status).toBe(204);
  });

  test("the IDEMPOTENT repeat → ALSO 204 (the existing marker; opening twice never conflicts)", async () => {
    const { app } = makeApp(asLearner, learnerRoutes({
      existingViewed: [{ note_id: "2.31-ph", viewed_at: "2026-10-05T08:00:00Z" }],
    }), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { Authorization: "Bearer x", "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "2.31-ph" }),
    });
    expect(res.status).toBe(204);
  });

  test("unknown noteId → 404 verbatim (404-first, before any viewed access)", async () => {
    const { app, deps } = makeApp(asLearner, learnerRoutes({ noteExists: [] }), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { Authorization: "Bearer x", "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "ghost" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ message: "revision note ghost not found" });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(1); // never touched the viewed table
  });

  test("noteId longer than 80 → 400 validation_failed (the @Size law), NO sql issued", async () => {
    const { app, deps } = makeApp(asLearner, learnerRoutes(), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { Authorization: "Bearer x", "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "x".repeat(81) }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: 400, error: "validation_failed", message: "noteId: size must be between 0 and 80",
    });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0); // the route owns the constraint
  });

  test("ABSENT noteId binds null (constraints skip null) and dies at the 404-first lookup", async () => {
    const { app } = makeApp(asLearner, learnerRoutes({ noteExists: [] }), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { Authorization: "Bearer x", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ message: "revision note null not found" });
  });

  test("a non-string noteId is a BIND failure (F-0) → 400 malformed_body, beats the @Size check", async () => {
    const { app, deps } = makeApp(asLearner, learnerRoutes(), []);
    const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
      method: "POST",
      headers: { Authorization: "Bearer x", "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: 12345 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: 400, error: "malformed_body",
      message: "request body is not readable (check field types and enum values)",
    });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });

  test("a non-JSON body → 400 malformed_body; an EMPTY body → the same unreadable envelope", async () => {
    const { app, deps } = makeApp(asLearner, learnerRoutes(), []);
    for (const body of ["not-json", ""]) {
      const res = await app.request("/api/v1/learners/me/revision-notes/progress/views", {
        method: "POST",
        headers: { Authorization: "Bearer x", "Content-Type": "application/json" },
        body: body === "" ? undefined : body,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ status: 400, error: "malformed_body" });
    }
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });
});

// ── the admin corpus-management surface (frozen :20-52) ──────────────────────

const adminRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, enabled from users where id = \? ::uuid$/,
  rows,
});

describe("revision-notes admin router — shells and the multipart law", () => {
  test("anonymous → Boot 401; authenticated STUDENT → Boot 403 (the ADMIN shell precedes everything)", async () => {
    const { app } = makeApp(anon, [], ingestRoutes());
    const res401 = await app.request("/api/v1/admin/revision-notes/status");
    expect(res401.status).toBe(401);
    expect(await res401.json()).toMatchObject(boot401("/api/v1/admin/revision-notes/status"));

    const app403 = makeApp(asLearner, [], ingestRoutes()).app;
    const res403 = await app403.request("/api/v1/admin/revision-notes/status", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res403.status).toBe(403);
    expect(await res403.json()).toMatchObject({ status: 403, error: "Forbidden" });
  });

  test("a TEACHER is ALSO 403 on the admin surface (hasRole('ADMIN') — not hasAnyRole)", async () => {
    const { app } = makeApp(asTeacher, [], ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/status", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(403);
  });

  test("POST /ingest with NO file part → 400 bad_request, the guard verbatim", async () => {
    const { app } = makeApp(asAdmin, [], ingestRoutes());
    const form = new FormData();
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      headers: { Authorization: "Bearer x", "Content-Type": "multipart/form-data; boundary=x" },
      body: form,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: 400, error: "bad_request",
      message: "multipart part 'file' (the corpus ZIP) is required",
    });
  });

  test("POST /ingest with an EMPTY file → the same 400 (file.isEmpty())", async () => {
    const { app } = makeApp(asAdmin, [], ingestRoutes());
    const form = new FormData();
    form.append("file", new File([], "empty.zip"));
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      headers: { Authorization: "Bearer x" },
      body: form,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ message: "multipart part 'file' (the corpus ZIP) is required" });
  });

  test("POST /ingest happy path → 200 (ResponseEntity.ok, NOT 201) with the replace summary", async () => {
    const capture = { notes: [] as unknown[][], assets: [] as unknown[][] };
    const { app } = makeApp(asAdmin, [], ingestRoutes({}, capture));
    const zip = buildZip([
      { name: "package.json", data: new TextEncoder().encode(JSON.stringify(pkg())) },
      { name: "assets/fig-1.png", data: new Uint8Array([1]) },
    ]);
    const form = new FormData();
    form.append("file", new File([zip as BlobPart], "corpus.zip"));
    const res = await app.request("/api/v1/admin/revision-notes/ingest", {
      method: "POST",
      headers: { Authorization: "Bearer x" },
      body: form,
    });
    expect(res.status).toBe(200);
    const summary = await res.json();
    expect(summary.replaced).toBe(false);
    expect(summary.topics).toBe(1);
    expect(summary.subtopics).toBe(1);
    expect(summary.notes).toBe(1);
    expect(summary.assets).toBe(1);
  });

  test("GET /status → 200 the live snapshot (what is corpus-live right now)", async () => {
    const { app } = makeApp(asAdmin, [], ingestRoutes({ noteCount: [{ n: 1 }] }));
    const res = await app.request("/api/v1/admin/revision-notes/status", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ingested: true,
      notes: 1,
      assets: 1,
      ingestedAt: "2026-10-05T09:00:00.000Z",
      corpusVersion: "4CH1-notes-2026-09",
    });
  });

  test("GET /status BEFORE the first ingest → honest nulls (ingested:false)", async () => {
    const { app } = makeApp(asAdmin, [], ingestRoutes());
    const res = await app.request("/api/v1/admin/revision-notes/status", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ingested: false, notes: 0, assets: 0, ingestedAt: null, corpusVersion: null,
    });
  });
});

void adminRoute; void USER; void clock;

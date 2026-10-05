/**
 * SME admin ROUTE tests (T-MIG-033 tranche-3) — the observable HTTP
 * contract of SmeQuestionAdminController (:20-62 @ 6cad6ef) over a FAKE
 * module: the ADMIN-only authz shell (SecurityConfig.java:86 + the
 * controller's @PreAuthorize defense-in-depth :22-25 — student AND teacher
 * both 403, the captured w3-sme-status-* postures), the multipart
 * error-parity classes (all 500s in the frozen core — no specific handler
 * exists), the present-but-empty 400 (controller :37-40), and the status
 * view shape. Service internals are ingest.test.ts's surface.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  createSmeRouter,
  declaredMultipartOverCap,
  MULTIPART_MAX_BYTES,
} from "../../src/routes/sme";
import type { SmeModule } from "../../src/services/sme";
import { BadRequestError } from "../../src/services/selfmark";
import { bootErrorBody } from "../../src/middleware/auth";
import { buildZip, bytes } from "./helpers";

function authFor(roles: string[] | null) {
  return roles === null
    ? null
    : { email: "u@example.invalid", userId: "60000000-0000-4000-8000-000000000001", roles, tokenVersion: 0 };
}

function boot(opts: { roles?: string[] | null; module?: Partial<SmeModule> } = {}) {
  const calls: Record<string, unknown[]> = {};
  const fake = (name: string, ret: unknown) => async (...args: unknown[]) => {
    (calls[name] ??= []).push(args);
    return ret;
  };
  const module: SmeModule = {
    ingest: fake("ingest", {
      questions: 1, mcq: 1, structured: 0, parts: 0, options: 2,
      markPoints: 1, specPointMappings: 0, topicMappings: 2, assets: 0,
      deactivated: 0, corpusVersion: "c1",
    }),
    status: fake("status", {
      activeQuestions: 5, activeMcq: 3, activeStructured: 2,
      specPointMappings: 7, assets: 1,
    }),
    ...(opts.module ?? {}),
  } as SmeModule;
  const router = createSmeRouter(module);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = authFor(opts.roles ?? null);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/", router);
  return { app, calls };
}

const ADMIN = ["ADMIN"];
const STUDENT = ["LEARNER"];
const TEACHER = ["TEACHER"];

function multipartBody(zip: Uint8Array = buildZip([{ name: "package.json", data: bytes("{}") }])): FormData {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(zip)], "package.zip", { type: "application/zip" }));
  return form;
}

// ── authz shell (SecurityConfig /api/v1/admin/** hasRole('ADMIN') :86) ──────

describe("admin shell", () => {
  test("anonymous caller gets the Boot 401 body on both surfaces", async () => {
    const { app } = boot({ roles: null });
    const status = await app.request("/status");
    expect(status.status).toBe(401);
    const body = await status.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/status");
    const ingest = await app.request("/ingest", { method: "POST" });
    expect(ingest.status).toBe(401);
    expect((await ingest.json()).path).toBe("/ingest");
  });

  test("LEARNER gets the Boot 403 body (w3-sme-status-student-403 posture)", async () => {
    const { app } = boot({ roles: STUDENT });
    const res = await app.request("/status");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  test("TEACHER gets the Boot 403 body too — ADMIN-only (w3-sme-status-teacher-403)", async () => {
    const { app } = boot({ roles: TEACHER });
    const res = await app.request("/status");
    expect(res.status).toBe(403);
    const ingest = await app.request("/ingest", { method: "POST", body: multipartBody() });
    expect(ingest.status).toBe(403);
  });

  test("ADMIN passes the shell (handler behavior then applies)", async () => {
    const { app } = boot({ roles: ADMIN });
    const res = await app.request("/status");
    expect(res.status).toBe(200);
  });
});

// ── GET /status (:49-52) ────────────────────────────────────────────────────

describe("GET /status", () => {
  test("renders the BankStatusView record verbatim", async () => {
    const { app, calls } = boot({ roles: ADMIN });
    const res = await app.request("/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      activeQuestions: 5,
      activeMcq: 3,
      activeStructured: 2,
      specPointMappings: 7,
      assets: 1,
    });
    expect(calls.status).toHaveLength(1);
  });
});

// ── POST /ingest (:34-47) ───────────────────────────────────────────────────

describe("POST /ingest — happy path", () => {
  test("a multipart zip reaches the module; the IngestSummary renders 200", async () => {
    const { app, calls } = boot({ roles: ADMIN });
    const res = await app.request("/ingest", { method: "POST", body: multipartBody() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      questions: 1, mcq: 1, structured: 0, parts: 0, options: 2,
      markPoints: 1, specPointMappings: 0, topicMappings: 2, assets: 0,
      deactivated: 0, corpusVersion: "c1",
    });
    const passed = ((calls.ingest! as unknown[][])[0]![0] ?? null) as Uint8Array;
    // the module received the raw ZIP bytes, starting with the PK\x03\x04 marker
    expect(passed.constructor?.name).toBe("Uint8Array");
    expect(Array.from(passed.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  test("a module BadRequestError renders the 400 bad_request envelope", async () => {
    const { app } = boot({
      roles: ADMIN,
      module: { ingest: async () => { throw new BadRequestError("package carries no questions"); } },
    });
    const res = await app.request("/ingest", { method: "POST", body: multipartBody() });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("package carries no questions");
  });
});

describe("POST /ingest — multipart error parity (frozen catch-all 500s)", () => {
  test("wrong content-type == HttpMediaTypeNotSupportedException → 500 internal_error", async () => {
    const { app } = boot({ roles: ADMIN });
    const res = await app.request("/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal_error");
    expect(body.message).toBe("an internal error occurred");
  });

  test("multipart body WITHOUT the 'file' part == MissingServletRequestPartException → 500", async () => {
    const { app, calls } = boot({ roles: ADMIN });
    const other = new FormData();
    other.append("notFile", "nope");
    const res = await app.request("/ingest", { method: "POST", body: other });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal_error");
    expect(calls.ingest).toBeUndefined();
  });

  test("unreadable multipart body == MultipartException → 500", async () => {
    const { app } = boot({ roles: ADMIN });
    // declares multipart but the body is garbage
    const res = await app.request("/ingest", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=xx" },
      body: "not-a-multipart-body",
    });
    expect(res.status).toBe(500);
  });

  test("a present-but-EMPTY 'file' part is the controller's own 400 (:37-40, verbatim)", async () => {
    const { app, calls } = boot({ roles: ADMIN });
    const empty = new FormData();
    empty.append("file", new File([], "empty.zip"));
    const res = await app.request("/ingest", { method: "POST", body: empty });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(
      "multipart part 'file' (the corpus ZIP) is required",
    );
    expect(calls.ingest).toBeUndefined();
  });

  test("a module throw of a non-domain error renders the opaque 500", async () => {
    const { app } = boot({
      roles: ADMIN,
      module: { ingest: async () => { throw new Error("db exploded"); } },
    });
    const res = await app.request("/ingest", { method: "POST", body: multipartBody() });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal_error");
    expect(body.message).toBe("an internal error occurred"); // never the raw text
  });
});

// ── the declared-length servlet cap (application.yml :44-45) ────────────────

describe("multipart cap predicate", () => {
  test("the 64MB cap bounds the DECLARED upload (MaxUploadSizeExceededException class)", () => {
    expect(MULTIPART_MAX_BYTES).toBe(67108864);
    expect(declaredMultipartOverCap("67108865")).toBe(true);
    expect(declaredMultipartOverCap("67108864")).toBe(false); // exactly at cap passes
    expect(declaredMultipartOverCap("1000")).toBe(false);
    expect(declaredMultipartOverCap(undefined)).toBe(false);
    expect(declaredMultipartOverCap("not-a-number")).toBe(false);
  });
});

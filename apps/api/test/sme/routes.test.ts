/**
 * SME admin ROUTE tests (T-MIG-033 tranche 3) — the observable HTTP
 * contract of SmeQuestionAdminController (:34-52 @ 6cad6ef) over a FAKE
 * module (service internals are pinned in sme.test.ts / ingest-flow.test.ts;
 * this file pins the route layer: the ADMIN-only authz shell — the four
 * captured w3-sme-* postures —, the multipart law with the verbatim guard
 * message, the disclosed 413 compressed cap, status codes + envelopes).
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createSmeRouter, MULTIPART_MAX_FILE_BYTES } from "../../src/routes/sme";
import type { SmeModule } from "../../src/services/sme";
import { BadRequestError } from "../../src/services/selfmark";

const SUMMARY = {
  questions: 3, mcq: 2, structured: 1, parts: 2, options: 6, markPoints: 3,
  specPointMappings: 1, topicMappings: 2, assets: 0, deactivated: 3, corpusVersion: "cor-9",
};
const STATUS = {
  activeQuestions: 7, activeMcq: 3, activeStructured: 4, specPointMappings: 11, assets: 4,
};

/** Auth contexts (roles drive the shell: anonymous/LEARNER/TEACHER/ADMIN). */
function authFor(roles: string[] | null) {
  return roles === null
    ? null
    : { email: "u@example.invalid", userId: "60000000-0000-4000-8000-000000000001", roles, tokenVersion: 0 };
}

function boot(opts: { roles: string[] | null; module?: Partial<SmeModule["ingestService"]> } = {} as never) {
  const calls: Record<string, unknown[]> = {};
  const fake = (name: string, ret: unknown = {}) => async (...args: unknown[]) => {
    (calls[name] ??= []).push(args);
    return ret;
  };
  const module = {
    ingestService: {
      ingest: fake("ingest", SUMMARY),
      status: fake("status", STATUS),
      ...((opts.module ?? {}) as object),
    },
  } as unknown as SmeModule;
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
const ingestForm = (file: File | null) => {
  const form = new FormData();
  if (file) form.set("file", file, "corpus.zip");
  return form;
};

// ── authz shell (SecurityConfig :86 hasRole("ADMIN") + @PreAuthorize) ───────

test("anonymous caller gets the Boot 401 body on both surfaces (w3-sme-*-unauthed-401)", async () => {
  const { app } = boot({ roles: null });
  for (const [method, path] of [
    ["GET", "/status"],
    ["POST", "/ingest"],
  ] as const) {
    const res = await app.request(path, {
      method,
      ...(method === "POST" ? { body: ingestForm(new File([new Uint8Array([1])], "x.zip")), headers: { "Content-Type": "multipart/form-data; boundary=x" } } : {}),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; path: string };
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(path);
  }
});

test("STUDENT token → 403 Boot body (w3-sme-status-student-403)", async () => {
  const { app } = boot({ roles: ["LEARNER"] });
  const res = await app.request("/status");
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe("Forbidden");
});

test("TEACHER token → 403 Boot body (w3-sme-status-teacher-403 — admin-only is the captured truth)", async () => {
  const { app } = boot({ roles: ["TEACHER"] });
  const res = await app.request("/status");
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe("Forbidden");
});

test("ADMIN passes the shell on both surfaces", async () => {
  const { app, calls } = boot({ roles: ADMIN });
  const s = await app.request("/status");
  expect(s.status).toBe(200);
  expect(await s.json()).toEqual(STATUS);
  expect(calls.status?.length).toBe(1);
});

// ── POST /ingest — the multipart law (:34-47) ────────────────────────────────

test("ADMIN ingest happy path: bytes reach the service; 200 IngestSummary (ResponseEntity.ok, NOT 201)", async () => {
  const { app, calls } = boot({ roles: ADMIN });
  const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]);
  const res = await app.request("/ingest", {
    method: "POST",
    body: ingestForm(new File([bytes], "corpus.zip")),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(SUMMARY);
  const passed = (calls.ingest?.[0] as unknown[] | undefined)?.[0] as Uint8Array;
  expect(Array.from(passed)).toEqual(Array.from(bytes));
});

test("missing 'file' part → 400 bad_request with the verbatim guard message", async () => {
  const { app, calls } = boot({ roles: ADMIN });
  const res = await app.request("/ingest", {
    method: "POST",
    body: ingestForm(null), // multipart but no 'file' part
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: string; message: string };
  expect(body.error).toBe("bad_request");
  expect(body.message).toBe("multipart part 'file' (the corpus ZIP) is required");
  expect(calls.ingest).toBeUndefined(); // no write path reached
});

test("EMPTY 'file' part → the same guard 400 (file.isEmpty() law)", async () => {
  const { app, calls } = boot({ roles: ADMIN });
  const res = await app.request("/ingest", {
    method: "POST",
    body: ingestForm(new File([], "empty.zip")),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("multipart part 'file' (the corpus ZIP) is required");
  expect(calls.ingest).toBeUndefined();
});

test("non-multipart body → the same honest 400 (disclosed R-1 class; frozen 500s at the framework layer)", async () => {
  const { app, calls } = boot({ roles: ADMIN });
  const res = await app.request("/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anything: true }),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("multipart part 'file' (the corpus ZIP) is required");
  expect(calls.ingest).toBeUndefined();
});

test("compressed upload beyond the 64 MB cap → 413 payload_too_large (the core's own 413 law)", async () => {
  const { app, calls } = boot({ roles: ADMIN });
  const oversized = new File([new Uint8Array(MULTIPART_MAX_FILE_BYTES + 1)], "big.zip");
  const res = await app.request("/ingest", {
    method: "POST",
    body: ingestForm(oversized),
  });
  expect(res.status).toBe(413);
  const body = (await res.json()) as { error: string; message: string };
  expect(body.error).toBe("payload_too_large");
  expect(body.message).toBe("request body exceeds the allowed size");
  expect(calls.ingest).toBeUndefined();
});

// ── error envelopes ──────────────────────────────────────────────────────────

test("service BadRequest (a fail-closed validation message) → 400 bad_request with the detail", async () => {
  const mod = {
    ingestService: {
      ingest: async () => {
        throw new BadRequestError("unsupported package version: 9.9");
      },
      status: async () => ({}),
    },
  } as unknown as SmeModule;
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("syllabai.auth" as never, authFor(ADMIN) as never);
    await next();
  });
  a.route("/", createSmeRouter(mod));
  const res = await a.request("/ingest", {
    method: "POST",
    body: ingestForm(new File([new Uint8Array([1])], "c.zip")),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: string; message: string };
  expect(body.error).toBe("bad_request");
  expect(body.message).toBe("unsupported package version: 9.9");
});

test("unexpected service error → the opaque 500 (GlobalExceptionHandler catch-all parity)", async () => {
  const mod = {
    ingestService: {
      ingest: async () => {
        throw new Error("db exploded");
      },
      status: async () => ({}),
    },
  } as unknown as SmeModule;
  const r = createSmeRouter(mod);
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("syllabai.auth" as never, authFor(ADMIN) as never);
    await next();
  });
  a.route("/", r);
  const res = await a.request("/ingest", {
    method: "POST",
    body: ingestForm(new File([new Uint8Array([1])], "c.zip")),
  });
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: string; message: string };
  expect(body.error).toBe("internal_error");
  expect(body.message).toBe("an internal error occurred");
});

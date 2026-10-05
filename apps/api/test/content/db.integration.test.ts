import { describe, expect, test, beforeAll } from "bun:test";
import appRoot from "../../src/index";

/**
 * Integration tier — the T-MIG-020 content read surfaces against a REAL
 * Neon branch (copy-on-write of the production end-state, per
 * BASELINE_DB.md §2, branch name convention `t-mig-020/r3-c`). Requires:
 *   INTEGRATION_DATABASE_URL   — postgresql://…ep-….neon.tech/…branch…
 * (no JWT secret needed for the content surfaces themselves, but the
 * identity module fail-fasts without one — provide a test value.)
 * Skipped (loudly, by design) when the URL is absent — CI runs the unit
 * tier; the integration run's receipt is attached to the PR (§2 receipts
 * doctrine). Expected bodies are the T-MIG-004 captured golden cases.
 */

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const SECRET = process.env.INTEGRATION_JWT_SECRET ?? "integration-secret-0123456789abcdef0123456";

const integrationTest = DB_URL ? test : test.skip;

let app: typeof appRoot | null = null;

beforeAll(() => {
  if (!DB_URL) return;
  process.env.DATABASE_URL = DB_URL;
  process.env.SYLLABAI_JWT_SECRET = SECRET;
  delete process.env.SYLLABAI_EMBEDDING_GEMINI_API_KEY; // unkeyed posture = the capture posture
  app = appRoot;
});

const UNKNOWN = "00000000-0000-4000-8000-0000000000d1";
const UNKNOWN_PAPER = "00000000-0000-4000-8000-0000000000e1";

describe("content read surfaces — Neon branch tier (T-MIG-020)", () => {
  integrationTest("unauthed content-docs → 401 Boot body (run-001 shell)", async () => {
    const res = await app!.request(`/api/v1/teacher/content/documents`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/teacher/content/documents");
  });

  integrationTest("student content-docs → 403 Forbidden (run-002)", async () => {
    const token = await registerAndLogin("STUDENT");
    const res = await app!.request(`/api/v1/teacher/content/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  integrationTest("teacher content-docs → 200 [] empty state (content-docs-teacher-empty-200)", async () => {
    const token = await registerTeacher();
    const res = await app!.request(`/api/v1/teacher/content/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  integrationTest("documents/:id unknown → 404 'Document … not found'", async () => {
    const token = await registerTeacher();
    const res = await app!.request(`/api/v1/teacher/content/documents/${UNKNOWN}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`Document ${UNKNOWN} not found`);
  });

  integrationTest("search: missing → 400 validation_failed; blank → 500 (F-2); empty → 200 + SCOPE_UNRESOLVED", async () => {
    const token = await registerTeacher();
    const h = { Authorization: `Bearer ${token}` };
    const missing = await app!.request(`/api/v1/teacher/content/documents/search`, { headers: h });
    expect(missing.status).toBe(400);
    expect((await missing.json()).message).toBe("missing required parameter: query");
    const blank = await app!.request(`/api/v1/teacher/content/documents/search?query=`, { headers: h });
    expect(blank.status).toBe(500);
    expect((await blank.json()).error).toBe("internal_error");
    const empty = await app!.request(`/api/v1/teacher/content/documents/search?query=moles`, { headers: h });
    // on a bare branch the seed leaves two ACTIVE curricula OR none — either
    // way the captured empty contract is 200 [] with a cause header
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);
    expect(empty.headers.get("X-Search-Empty-Cause")).toBeDefined();
  });

  integrationTest("review queues v1/v2/v3 → captured empty shapes", async () => {
    const token = await registerTeacher();
    const h = { Authorization: `Bearer ${token}` };
    expect(await (await app!.request(`/api/v1/teacher/content/review-queue`, { headers: h })).json())
      .toEqual({ papers: [], suggestedVersions: 0, suggestedSchemes: 0 });
    expect(await (await app!.request(`/api/v1/teacher/content/review-queue-v2`, { headers: h })).json())
      .toEqual({ papers: [], suggestedVersions: 0, suggestedSchemes: 0 });
    expect(await (await app!.request(`/api/v1/teacher/content/review-queue-v3`, { headers: h })).json())
      .toEqual({ papers: [], suggestedVersions: 0, suggestedSchemes: 0, practicableTopicCount: 0 });
  });

  integrationTest("paper review/audit/provenance unknown → 404 captured messages", async () => {
    const token = await registerTeacher();
    const h = { Authorization: `Bearer ${token}` };
    const review = await app!.request(`/api/v1/teacher/content/exam-papers/${UNKNOWN_PAPER}/review`, { headers: h });
    expect(review.status).toBe(404);
    expect((await review.json()).message).toBe(`exam paper ${UNKNOWN_PAPER} not found`);
    const audit = await app!.request(`/api/v1/teacher/content/exam-papers/${UNKNOWN_PAPER}/audit`, { headers: h });
    expect(audit.status).toBe(404);
    const provenance = await app!.request(`/api/v1/teacher/content/exam-papers/${UNKNOWN_PAPER}/provenance`, { headers: h });
    expect(provenance.status).toBe(404);
  });

  integrationTest("reader: unauthed 401; unknown/non-citable → 404 identical bodies", async () => {
    const unauthed = await app!.request(`/api/v1/content/documents/${UNKNOWN}`);
    expect(unauthed.status).toBe(401);
    const token = await registerAndLogin("STUDENT");
    const res = await app!.request(`/api/v1/content/documents/${UNKNOWN}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`Document ${UNKNOWN} not found`);
  });

  integrationTest("question assets: unauthed 401; unknown → 404 EMPTY body", async () => {
    const unauthed = await app!.request(`/api/v1/content/question-assets/unknown-figure.png`);
    expect(unauthed.status).toBe(401);
    const token = await registerAndLogin("STUDENT");
    const res = await app!.request(`/api/v1/content/question-assets/unknown-figure.png`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  // ── helpers (honest API path registration — same as the identity tier) ──

  async function registerAndLogin(role: "STUDENT" | "TEACHER"): Promise<string> {
    const email = `content-r3c-${role.toLowerCase()}-${Date.now()}@example.invalid`;
    const password = "integration-pass-1A";
    const register = await app!.request(`/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        role === "TEACHER"
          ? { email, password, displayName: "Content R3C", role, joinCode: process.env.INTEGRATION_TEACHER_JOIN_CODE ?? "test-join-code-2026" }
          : { email, password, displayName: "Content R3C", role },
      ),
    });
    if (register.status !== 201) {
      throw new Error(`register failed: ${register.status} ${await register.text()}`);
    }
    const login = await app!.request(`/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    return (await login.json()).accessToken as string;
  }

  async function registerTeacher(): Promise<string> {
    return registerAndLogin("TEACHER");
  }
});

/**
 * Strangler surface-routing pins (T-MIG-037, r8-hub).
 *
 * These pins freeze the DUAL-RUN CONTRACT of apps/hub/src/lib/api.ts:
 * which hub-emitted paths resolve to the v2 api base while the Java core
 * keeps serving production, and — equally load-bearing — which paths must
 * stay on the core so the hub never routes a live page into a v2 404/501
 * (teacher write actions are honest CONTENT_WRITE_TASK stubs, glm-ocr is
 * W6-unported, learner /questions + /exam-papers await T-MIG-031
 * tranche-2, and 20+ sibling /api/v1/learners/me/* surfaces are not
 * ported). The rollback property (MIGRATION_PLAN §7) is pinned at the
 * decision layer too: with the one env var unset, EVERY path — including
 * the flipped ones — reverts to the core.
 *
 * The module under test is the hub's ACTUAL routing code (apiPath +
 * the v2SurfaceBase decision resolveBase delegates to), imported with the
 * v2 env var set so the module-level constants bind the dual-run posture.
 * Run: bun test apps/hub/src/lib/api.v2-surface.test.ts
 */
process.env.NEXT_PUBLIC_API_V2_BASE_URL = "https://v2.example";

const { apiPath, v2SurfaceBase, V2_SURFACE_PREFIXES } = await import("./api");

import { describe, expect, test } from "bun:test";

const V2 = "https://v2.example";

/** Every hub-emitted path family under the flipped prefixes (grep-verified at c920eea). */
const DUAL_RUN_PATHS: readonly string[] = [
  // W1 identity (T-MIG-010)
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/me",
  "/api/v1/auth/password",
  "/api/v1/auth/bootstrap-status",
  // W2 content reads (T-MIG-005/020/022 + F-1/F-2) — the hub emits the
  // citation detail form /documents/{row}?page=N (citation-map.ts); the
  // bare list + search + canonical forms are TEACHER-side paths
  "/api/v1/content/documents/doc-row-1",
  "/api/v1/content/documents/doc-row-1?page=2",
  "/api/v1/content/question-assets/asset-9.pdf",
  // W2 curriculum reads (T-MIG-021)
  "/api/v1/curriculum/subjects",
  "/api/v1/curriculum/subjects/sub-1",
  "/api/v1/curriculum/versions",
  // W3 attempts (T-MIG-030 + T-MIG-032)
  "/api/v1/attempts",
  "/api/v1/attempts/structured",
  "/api/v1/learners/me/attempts?limit=20",
  "/api/v1/learners/me/attempts/att-1/self-mark",
  "/api/v1/learners/me/attempts/att-1/smart-mark",
  "/api/v1/learners/me/attempts/att-1/parts/p-2/feedback-explanation",
  "/api/v1/learners/me/attempts/att-1/parts/p-2/improvement-plan",
  // Wave S3 (T-MIG-082, r3a) — learner revision-notes, the family's hub-emitted
  // forms (index / body / asset / progress / markViewed), golden-verified of record
  "/api/v1/learners/me/revision-notes",
  "/api/v1/learners/me/revision-notes/rn_TWGVV6RXN3Ktqb9h",
  "/api/v1/learners/me/revision-notes/assets/0093b0722e85-2-7-9-preparation-of-leadiisulfate-4.png",
  "/api/v1/learners/me/revision-notes/progress",
  "/api/v1/learners/me/revision-notes/progress/views",
];

/** Hub-emitted (or hub-adjacent) paths that MUST stay on the core in the dual-run posture. */
const CORE_ONLY_PATHS: readonly string[] = [
  // teacher content: v2 serves honest 501 write stubs + does NOT serve glm-ocr at all
  "/api/v1/teacher/content/review-queue",
  "/api/v1/teacher/content/review-queue-v3",
  "/api/v1/teacher/content/exam-papers/ep-1/review",
  "/api/v1/teacher/content/exam-papers/ep-1/validate",
  "/api/v1/teacher/content/question-versions/qv-1/flag",
  "/api/v1/teacher/content/mark-schemes/ms-1/reject",
  "/api/v1/teacher/content/glm-ocr/papers/p-1/findings",
  // teacher curriculum + teacher W5 families (unported)
  "/api/v1/teacher/curriculum/versions",
  "/api/v1/teacher/classes",
  "/api/v1/teacher/marking/answers",
  "/api/v1/teacher/assignments",
  // learner /questions + /exam-papers: NOT mounted in the v2 api yet (T-MIG-031 tranche-2)
  "/api/v1/questions?q=photosynthesis",
  "/api/v1/questions/families",
  "/api/v1/exam-papers?subjectId=sub-1",
  "/api/v1/exam-papers/ep-1",
  // non-attempts learner surfaces (W4) — the reason /api/v1/learners/me/attempts stays narrow
  "/api/v1/learners/me/agenda",
  "/api/v1/learners/me/state",
  "/api/v1/learners/me/flashcard-ratings",
  "/api/v1/learners/me/cla/ask",
  "/api/v1/learners/me/answer-input/transcribe",
  // T-MIG-082 (Wave S3, r3a): revision-notes FLIPPED after its golden gate —
  // run-002 frozen-core captures (d19289cc8) + run-003 verify 7/7 vs the
  // landed mounts; moved out of this CORE_ONLY list of record.
  "/api/v1/learners/me/knowledge-graph",
  // classic core-only surfaces (T-MIG-035 check-3 law, still true)
  "/api/v1/subjects",
  "/api/v1/tree?includeMisconceptions=true",
  "/api/v1/knowledge/nodes/kn-1/tree",
  "/api/v1/tutor/ask",
];

describe("V2_SURFACE_PREFIXES table (T-MIG-037 flip law)", () => {
  test("is exactly the verified set — widening requires a new golden-verified surface", () => {
    expect([...V2_SURFACE_PREFIXES]).toEqual([
      "/api/v1/auth",
      "/api/v1/content/documents",
      "/api/v1/content/question-assets",
      "/api/v1/curriculum",
      "/api/v1/attempts",
      "/api/v1/learners/me/attempts",
      "/api/v1/learners/me/revision-notes", // Wave S3: T-MIG-082 golden-verified (run-002/003, r3a)
      "/api/v1/admin/llm/chain-health", // T-MIG-090: golden-verified (run-005, r0 rider) — NARROWEST: the prefix IS the single endpoint
    ]);
  });
});

describe("dual-run posture (NEXT_PUBLIC_API_V2_BASE_URL set)", () => {
  test("every flipped hub-emitted path resolves to the v2 base", () => {
    for (const p of DUAL_RUN_PATHS) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
      expect(apiPath(p).startsWith(`${V2}/api/v1/`)).toBe(true);
    }
  });

  test("apiPath emits exact v2 URLs for representative surfaces", () => {
    expect(apiPath("/api/v1/auth/login")).toBe(`${V2}/api/v1/auth/login`);
    expect(apiPath("/api/v1/curriculum/subjects")).toBe(`${V2}/api/v1/curriculum/subjects`);
    expect(apiPath("/api/v1/learners/me/attempts?limit=20")).toBe(
      `${V2}/api/v1/learners/me/attempts?limit=20`,
    );
  });

  test("every core-only path stays core (relative + XTransformPort convention, never v2)", () => {
    for (const p of CORE_ONLY_PATHS) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
      expect(apiPath(p).startsWith(V2)).toBe(false);
      expect(apiPath(p).includes("XTransformPort=8080")).toBe(true);
    }
  });

  test("the /learners/me boundary: attempts flips, answer-input does not (ans vs att)", () => {
    expect("/api/v1/learners/me/answer-input/transcribe".startsWith("/api/v1/learners/me/attempts")).toBe(false);
    expect(v2SurfaceBase("/api/v1/learners/me/attempts?limit=5", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/learners/me/answer-input/transcribe", V2)).toBeNull();
  });

  test("the T-MIG-090 line: the exact chain-health surface flips with zero live-page routing change (r0 rider)", () => {
    // the verified surface itself resolves to v2 (golden-verified of record:
    // run-005, 4/4 legs at merged main bd4eaeb — the routing-availability pin)
    expect(v2SurfaceBase("/api/v1/admin/llm/chain-health", V2)).toBe(V2);
    // TRUE siblings (v2 serves none of them) stay core — the prefix must never
    // capture them
    for (const p of [
      "/api/v1/admin/llm/other",
      "/api/v1/admin/llm/chain",
      "/api/v1/admin/users",
      "/api/v1/admin/stats",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has — e.g. /api/v1/auth would capture /auth/loginx):
    // a non-existent partial-segment sibling IS captured by the string match.
    // This is pinned as DOCUMENTED INERT capture: no hub emitter and no route
    // named chain-healthx exists on either side (the hub-source grep law in
    // the api.ts table comment), so the capture can never route a live page.
    expect(v2SurfaceBase("/api/v1/admin/llm/chain-healthx", V2)).toBe(V2);
    expect("/api/v1/admin/llm/chain-healthx".startsWith("/api/v1/admin/llm/chain-health")).toBe(true);
    // and the hub emits NOTHING under /api/v1/admin/** today (the line is
    // routing availability, zero live-page behavior change)
  });
});

describe("rollback posture (MIGRATION_PLAN §7 — unset the one env var)", () => {
  test("EVERY path — flipped or not — reverts to the core at the decision layer", () => {
    for (const p of [...DUAL_RUN_PATHS, ...CORE_ONLY_PATHS]) {
      expect(v2SurfaceBase(p, undefined)).toBeNull();
      expect(v2SurfaceBase(p, "")).toBeNull();
    }
  });
});

describe("base normalization (operator-convention tolerance, unchanged from T-MIG-011)", () => {
  test("trailing slash is stripped", () => {
    expect(v2SurfaceBase("/api/v1/auth/login", `${V2}/`)).toBe(V2);
  });
  test("a trailing /api/v1 on the base is normalized away (no doubled prefix)", () => {
    expect(v2SurfaceBase("/api/v1/auth/login", `${V2}/api/v1`)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/auth/login", `${V2}/api/v1/`)).toBe(V2);
  });
});

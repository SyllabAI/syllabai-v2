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
  // non-attempts learner surfaces (W4) — agenda + state FLIPPED in T-MIG-094
  // (run-001 golden-verify); flashcard-ratings + note-votes STAY CORE until
  // the T-MIG-095 first-field-error defect band closes (frozen core serves
  // subtopicCode/vote first; the port serves cardId/noteId first — a flip
  // would 400 live user writes core accepts)
  "/api/v1/learners/me/flashcard-ratings",
  "/api/v1/learners/me/note-votes",
  // T-MIG-094: recommendations stays core this band — 400/404 wires verified
  // (L03/L04) but the 200 NBA-engine wire is not live-proven yet (disclosed)
  "/api/v1/learners/me/recommendations",
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
  // T-MIG-092 (r0 rider): the tutor SESSIONS tree flipped, so these siblings
  // stay core-pinned explicitly — the zero-key law (generation-reaching asks
  // 503 on the dormant v2 LLM seam) forbids their capture
  "/api/v1/tutor/ask/stream",
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
      "/api/v1/tutor/sessions", // T-MIG-092: golden-verified (run-003 14/14, r0 rider) — NARROW: the sessions tree ONLY, ask/stream stay core
      "/api/v1/learners/me/agenda", // T-MIG-094: golden-verified (run-001 16/18, r0 rider) — per-exact-subpath rows, NEVER the bare /learners/me
      "/api/v1/learners/me/flashcard-rating-trail", // T-MIG-094 run-001 L05/L06
      "/api/v1/learners/me/flashcard-review-schedule", // T-MIG-094 run-001 L07
      "/api/v1/learners/me/exam-series", // T-MIG-094 run-001 L11
      "/api/v1/learners/me/assignments", // T-MIG-094 run-001 L14/L15 (incl. the submissions subpath wire)
      "/api/v1/learners/me/state", // T-MIG-094 run-001 L16
      "/api/v1/learners/me/course-stats", // T-MIG-094 run-001 L17
      "/api/v1/learners/me/courses", // T-MIG-094 run-001 L12/L13 — zero emitters, routing availability
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

  test("the T-MIG-094 lines: the learner-me heart flips per-exact-subpath with the write surfaces core-pinned (r0 rider)", () => {
    // every verified read path of the run-001 matrix resolves to v2
    for (const p of [
      "/api/v1/learners/me/agenda",
      "/api/v1/learners/me/agenda?rootId=3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
      "/api/v1/learners/me/flashcard-rating-trail?limit=20",
      "/api/v1/learners/me/flashcard-review-schedule",
      "/api/v1/learners/me/exam-series",
      "/api/v1/learners/me/assignments",
      "/api/v1/learners/me/assignments/a1/submissions", // the submission wire rides the assignments prefix (L15 law)
      "/api/v1/learners/me/state",
      "/api/v1/learners/me/course-stats",
      "/api/v1/learners/me/courses/igcse-chemistry-19/target-series",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // the T-MIG-095-blocked write surfaces + the not-yet-verified 200 NBA
    // wire stay core — the zero-key/defect-band law in string form
    for (const p of [
      "/api/v1/learners/me/flashcard-ratings",
      "/api/v1/learners/me/note-votes",
      "/api/v1/learners/me/recommendations?rootId=kn-1",
      "/api/v1/learners/me/cla/ask",
      "/api/v1/learners/me/classroom",
      "/api/v1/learners/me/intervention-runs",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
  });

  test("the T-MIG-092 line: the tutor sessions tree flips with ask/stream core-pinned (r0 rider)", () => {
    // every verified leg path of the run-003 matrix resolves to v2
    for (const p of [
      "/api/v1/tutor/sessions", // L01/L06/L13 list
      "/api/v1/tutor/sessions/latest", // L02/L07/L14
      "/api/v1/tutor/sessions/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab", // L03/L08/L11/L12 transcript/delete paths
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // the LLM-bearing siblings stay core — different segments, never captured
    for (const p of ["/api/v1/tutor/ask", "/api/v1/tutor/ask/stream", "/api/v1/tutor"]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has): a non-existent partial-segment sibling IS
    // captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named sessions* beyond the verified tree exists on either side)
    expect(v2SurfaceBase("/api/v1/tutor/sessionsxyz", V2)).toBe(V2);
    expect("/api/v1/tutor/sessionsxyz".startsWith("/api/v1/tutor/sessions")).toBe(true);
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
